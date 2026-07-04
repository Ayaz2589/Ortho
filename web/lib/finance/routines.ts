/**
 * Transaction-based routine detector (spec 016 — prototype / validation slice).
 *
 * Answers the question findings.md says to validate first: does `merchant +
 * cadence` ALONE (no location, no permission, works on bank imports) surface
 * recurring-spend "routines" that feel insightful? Pure, deterministic,
 * frequency-statistics only (no ML). Read-only over the existing Transaction
 * shape — nothing is persisted and nothing here is location-aware.
 *
 * This module is deliberately OUTSIDE the golden-vector parity harness (like the
 * scan and feature-flag work). It does not import from, modify, or extend
 * `insights.ts`, and it adds no golden vector or iOS mirror. See
 * specs/016-routine-detector/{plan,research,data-model}.md and contracts/.
 *
 * All date math uses UTC accessors so results are identical regardless of the
 * ambient process timezone (vitest pins TZ=UTC; the tsx harness may not).
 */
import type { Transaction, TransactionCategory } from '../types'
import { CATEGORIES } from '../categories'

// ---------------------------------------------------------------------------
// Public types (contracts/routine-detector.md)
// ---------------------------------------------------------------------------

export type Cadence = 'daily' | 'weekday' | 'weekly' | 'biweekly' | 'monthly' | 'irregular'
export type TimeBucket = 'morning' | 'midday' | 'afternoon' | 'evening' | 'night'
export type GroupingKind = 'merchant' | 'category'

export interface Routine {
  kind: GroupingKind
  key: string
  label: string
  cadence: Cadence
  timeBucket: TimeBucket | null
  typicalAmountCents: number
  occurrenceCount: number
  monthlyEstimateCents: number
  confidence: number // [0,1], 3-decimal rounded
  firstSeen: string // ISO
  lastSeen: string // ISO
}

export interface RoutineParams {
  minSupportN: number
  lookbackWeeksM: number
  now: Date
}

export interface RoutineReport {
  routines: Routine[]
  monthlyRoutineCostCents: number
  params: RoutineParams
}

export interface DetectOptions {
  now: Date // REQUIRED — injected reference date (no real-clock reads)
  minSupportN?: number
  lookbackWeeksM?: number
}

// ---------------------------------------------------------------------------
// Tunable constants — sensible documented defaults (FR-007; research D2/D3/D4/D7)
// ---------------------------------------------------------------------------

/** Occurrences required inside the window before a pattern is called a routine. */
export const MIN_SUPPORT_N = 3
/** Rolling lookback window in weeks (~one quarter). */
export const LOOKBACK_WEEKS_M = 12
/** Imported rows are pinned to noon-UTC (PARITY.md) → treated as "hour unknown". */
export const NOON_UTC_SENTINEL_HOUR = 12

/** Time-of-day buckets by UTC hour (research D3). `night` wraps past midnight. */
export const HOUR_BUCKETS: ReadonlyArray<{ bucket: TimeBucket; startHour: number; endHour: number }> = [
  { bucket: 'morning', startHour: 5, endHour: 10 },
  { bucket: 'midday', startHour: 11, endHour: 13 },
  { bucket: 'afternoon', startHour: 14, endHour: 17 },
  { bucket: 'evening', startHour: 18, endHour: 22 },
  { bucket: 'night', startHour: 23, endHour: 4 },
]

/** Canonical inter-occurrence periods (days) + tolerance, for cadence matching
 *  (research D2). `weekday` is derived (daily-range spacing that lands Mon–Fri),
 *  so it is not a gap-period entry here. */
export const CADENCE_PERIODS: Readonly<
  Record<'daily' | 'weekly' | 'biweekly' | 'monthly', { days: number; tolerance: number }>
> = {
  daily: { days: 1, tolerance: 0.5 },
  weekly: { days: 7, tolerance: 2 },
  biweekly: { days: 14, tolerance: 3 },
  monthly: { days: 30, tolerance: 5 },
}

/** Occurrences per month by cadence, for the monthly-cost roll-up (research D7).
 *  `irregular` never surfaces, so its multiplier is only a totality placeholder. */
export const CADENCE_MONTHLY_MULTIPLIER: Readonly<Record<Cadence, number>> = {
  daily: 30,
  weekday: 21.7, // ≈ 5 × 52 / 12
  weekly: 4.345, // 52 / 12
  biweekly: 2.17, // 26 / 12
  monthly: 1,
  irregular: 1,
}

const DAY_MS = 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Small pure numeric utilities
// ---------------------------------------------------------------------------

/** Median of a numeric list. Even length → mean of the two central values.
 *  Callers that need an integer (cents) round the result. */
export function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

/** Population standard deviation. */
function stdev(nums: number[]): number {
  if (nums.length === 0) return 0
  const m = mean(nums)
  return Math.sqrt(mean(nums.map((n) => (n - m) ** 2)))
}

const round3 = (n: number) => Math.round(n * 1000) / 1000

/** Consecutive gaps (in whole days) between sorted timestamps. */
function gapsInDays(sortedDates: Date[]): number[] {
  const gaps: number[] = []
  for (let i = 1; i < sortedDates.length; i++) {
    gaps.push(Math.round((sortedDates[i].getTime() - sortedDates[i - 1].getTime()) / DAY_MS))
  }
  return gaps
}

// ---------------------------------------------------------------------------
// Rule helpers (each exported so tests assert them directly — Constitution VI)
// ---------------------------------------------------------------------------

/** Light merchant normalization for the grouping key only (research D8):
 *  lowercase, collapse whitespace, drop a trailing store-number / ref token
 *  (`Dunkin' #3401` → `dunkin'`). Not a canonicalizer — `DD/BR` ≠ `Dunkin'`. */
export function normalizeMerchant(raw: string): string {
  let s = (raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  // strip a trailing "#1234", "no. 12", or bare numeric/hyphen store code
  s = s.replace(/\s+(?:#|no\.?\s*)?\d+$/i, '').replace(/\s+-\s*\w+$/i, '')
  return s.trim()
}

/** True when the timestamp is the noon-UTC import sentinel (hour unknown). */
function isSentinel(d: Date): boolean {
  return (
    d.getUTCHours() === NOON_UTC_SENTINEL_HOUR &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  )
}

/** Time-of-day bucket for a real-hour timestamp; `null` for the noon-UTC
 *  import sentinel (research D3). Uses the UTC hour. */
export function hourBucket(d: Date): TimeBucket | null {
  if (isSentinel(d)) return null
  const h = d.getUTCHours()
  for (const { bucket, startHour, endHour } of HOUR_BUCKETS) {
    const inRange = startHour <= endHour ? h >= startHour && h <= endHour : h >= startHour || h <= endHour
    if (inRange) return bucket
  }
  return null
}

/** Classify cadence from occurrence spacing (research D2). Needs the dates
 *  themselves (not just gaps) to tell weekday-only from truly daily. */
export function classifyCadence(sortedDates: Date[]): Cadence {
  if (sortedDates.length < 2) return 'irregular'
  const gaps = gapsInDays(sortedDates)
  const g = median(gaps)

  // Daily-range spacing: distinguish weekday-only from every-day.
  if (g <= CADENCE_PERIODS.daily.days + CADENCE_PERIODS.daily.tolerance) {
    const allWeekday = sortedDates.every((d) => {
      const wd = d.getUTCDay() // 0=Sun … 6=Sat
      return wd >= 1 && wd <= 5
    })
    return allWeekday ? 'weekday' : 'daily'
  }
  // Otherwise match the nearest canonical period within tolerance.
  for (const cadence of ['weekly', 'biweekly', 'monthly'] as const) {
    const { days, tolerance } = CADENCE_PERIODS[cadence]
    if (Math.abs(g - days) <= tolerance) return cadence
  }
  return 'irregular'
}

/** Confidence = support × regularity, both in [0,1] (research D5). Frequent,
 *  evenly-spaced routines score near 1; sparse or erratic ones approach 0. */
export function confidenceScore(gapsDays: number[], count: number, cadence: Cadence, spanDays: number): number {
  const expected = expectedCount(cadence, spanDays)
  const supportScore = expected > 0 ? Math.min(1, count / expected) : count > 0 ? 1 : 0
  let regularityScore = 1
  if (gapsDays.length > 0) {
    const m = mean(gapsDays)
    regularityScore = m > 0 ? 1 - Math.min(1, stdev(gapsDays) / m) : 1
  }
  return round3(supportScore * regularityScore)
}

/** How many times a cadence "should" occur across an observed span. */
function expectedCount(cadence: Cadence, spanDays: number): number {
  switch (cadence) {
    case 'daily':
      return spanDays + 1
    case 'weekday':
      return (spanDays / 7) * 5
    case 'weekly':
      return spanDays / 7 + 1
    case 'biweekly':
      return spanDays / 14 + 1
    case 'monthly':
      return spanDays / 30 + 1
    default:
      return 0
  }
}

/** Typical amount → estimated monthly spend by cadence (research D7). */
export function monthlyEquivalentCents(cadence: Cadence, typicalCents: number): number {
  return Math.round(typicalCents * CADENCE_MONTHLY_MULTIPLIER[cadence])
}

// ---------------------------------------------------------------------------
// Grouping + detection
// ---------------------------------------------------------------------------

interface Candidate {
  kind: GroupingKind
  groupKey: string // normalized merchant, or category enum value
  displayKey: string // human label seed
  txs: Transaction[]
}

function catLabel(c: TransactionCategory): string {
  return CATEGORIES[c]?.label ?? c
}

/** Most frequent original-cased merchant string in a group (stable tiebreak:
 *  lexical). Used for display while grouping stays on the normalized key. */
function displayMerchant(txs: Transaction[]): string {
  const counts = new Map<string, number>()
  for (const t of txs) counts.set(t.merchant, (counts.get(t.merchant) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0]
}

function buildLabel(key: string, cadence: Cadence, bucket: TimeBucket | null): string {
  const cadenceWord =
    cadence === 'weekday' ? 'weekday' : cadence === 'biweekly' ? 'biweekly' : cadence
  const phrase = bucket ? `${cadenceWord} ${bucket}s` : cadenceWord
  return `${key} — ${phrase}`
}

/** Dominant time bucket when a MAJORITY of real-hour occurrences agree; else
 *  null (groups that are mostly noon-UTC imports get no bucket — research D3). */
function dominantBucket(txs: Transaction[]): TimeBucket | null {
  const buckets = txs.map((t) => hourBucket(new Date(t.date))).filter((b): b is TimeBucket => b !== null)
  if (buckets.length === 0) return null
  const counts = new Map<TimeBucket, number>()
  for (const b of buckets) counts.set(b, (counts.get(b) ?? 0) + 1)
  const [topBucket, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]
  // majority of ALL occurrences (not just real-hour ones) must share it
  return topCount * 2 > txs.length ? topBucket : null
}

function toRoutine(c: Candidate): Routine | null {
  const sorted = [...c.txs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const dates = sorted.map((t) => new Date(t.date))
  const cadence = classifyCadence(dates)
  if (cadence === 'irregular') return null

  const gaps = gapsInDays(dates)
  const spanDays = (dates[dates.length - 1].getTime() - dates[0].getTime()) / DAY_MS
  const typicalAmountCents = Math.round(median(sorted.map((t) => t.amount_cents)))
  const bucket = dominantBucket(sorted)
  const key = c.kind === 'merchant' ? displayMerchant(sorted) : catLabel(c.groupKey as TransactionCategory)

  return {
    kind: c.kind,
    key: c.kind === 'merchant' ? c.groupKey : c.groupKey,
    label: buildLabel(key, cadence, bucket),
    cadence,
    timeBucket: bucket,
    typicalAmountCents,
    occurrenceCount: sorted.length,
    monthlyEstimateCents: monthlyEquivalentCents(cadence, typicalAmountCents),
    confidence: confidenceScore(gaps, sorted.length, cadence, spanDays),
    firstSeen: sorted[0].date,
    lastSeen: sorted[sorted.length - 1].date,
  }
}

/**
 * Detect recurring-spend routines from a household's transactions.
 * Pure and deterministic: same transactions (any order) + same `options.now`
 * yields an identical report. Never throws; empty/short input → empty report.
 */
export function detectRoutines(transactions: Transaction[], options: DetectOptions): RoutineReport {
  const minSupportN = options.minSupportN ?? MIN_SUPPORT_N
  const lookbackWeeksM = options.lookbackWeeksM ?? LOOKBACK_WEEKS_M
  const params: RoutineParams = { minSupportN, lookbackWeeksM, now: options.now }

  const windowStart = options.now.getTime() - lookbackWeeksM * 7 * DAY_MS
  const windowEnd = options.now.getTime()

  // Only spend, only within the lookback window (FR-002, FR-006).
  const inScope = transactions.filter((t) => {
    if (t.kind !== 'expense') return false
    const ts = new Date(t.date).getTime()
    return ts >= windowStart && ts <= windowEnd
  })

  // Two independent candidate streams (FR-003; research D1).
  const byMerchant = new Map<string, Transaction[]>()
  const byCategory = new Map<string, Transaction[]>()
  for (const t of inScope) {
    const mk = normalizeMerchant(t.merchant)
    if (mk) {
      if (!byMerchant.has(mk)) byMerchant.set(mk, [])
      byMerchant.get(mk)!.push(t)
    }
    if (!byCategory.has(t.category)) byCategory.set(t.category, [])
    byCategory.get(t.category)!.push(t)
  }

  const candidates: Candidate[] = []
  for (const [groupKey, txs] of byMerchant) {
    if (txs.length >= minSupportN) candidates.push({ kind: 'merchant', groupKey, displayKey: groupKey, txs })
  }
  for (const [groupKey, txs] of byCategory) {
    if (txs.length >= minSupportN) candidates.push({ kind: 'category', groupKey, displayKey: groupKey, txs })
  }

  const routines = candidates.map(toRoutine).filter((r): r is Routine => r !== null)

  // De-dupe: drop a category routine fully explained by surfaced merchant
  // routines — i.e. every merchant in it already surfaced on its own (research D1).
  const surfacedMerchantKeys = new Set(routines.filter((r) => r.kind === 'merchant').map((r) => r.key))
  const merchantTxKeysByCategory = new Map<string, Set<string>>()
  for (const c of candidates) {
    if (c.kind !== 'category') continue
    const keys = new Set(c.txs.map((t) => normalizeMerchant(t.merchant)))
    merchantTxKeysByCategory.set(c.groupKey, keys)
  }
  const kept = routines.filter((r) => {
    if (r.kind !== 'category') return true
    const merchants = merchantTxKeysByCategory.get(r.key)
    if (!merchants || merchants.size === 0) return true
    // fully explained only if EVERY merchant in the category already surfaced
    return ![...merchants].every((m) => surfacedMerchantKeys.has(m))
  })

  // Deterministic ranking with total-order tiebreak (research D6, FR-010).
  kept.sort(
    (a, b) =>
      b.confidence - a.confidence ||
      b.monthlyEstimateCents - a.monthlyEstimateCents ||
      b.occurrenceCount - a.occurrenceCount ||
      (a.kind === b.kind ? 0 : a.kind === 'merchant' ? -1 : 1) ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  )

  const monthlyRoutineCostCents = kept.reduce((s, r) => s + r.monthlyEstimateCents, 0)
  return { routines: kept, monthlyRoutineCostCents, params }
}
