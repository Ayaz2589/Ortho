import { detectRoutines, normalizeMerchantKey, type DetectedRoutine } from './routines'
import type { Transaction } from '../types'
import { parseTxDate } from '../format'

const MS_PER_DAY = 24 * 60 * 60 * 1000
/** Beyond this, a window is treated as multi-cycle: cycles fold onto the same
 *  31-day axis instead of projecting a "today"/"ahead" cycle (spec 057 US6
 *  redesign, zone 2). Matches the detector's own monthly cadence ceiling
 *  (routines-thresholds.ts `recurringCadenceMaxDays`). */
const LONG_WINDOW_DAYS = 40
/** Above this, a cycle dot renders at the larger of its two allowed sizes —
 *  two steps only, enough to see where the weight sits without a scale to
 *  decode (design brief). */
const BIG_DOT_THRESHOLD_CENTS = 30000
/** Same-day dots stack at most this many deep; the rest are still counted in
 *  the tally, never drawn as a fourth dot. */
const MAX_STACK_PER_DAY = 3

export interface MerchantEntry {
  merchantKey: string
  /** Mode of the raw merchant strings in this group — store-code variants
   *  ("Dunkin #4521"/"Dunkin #9902") are merged under one normalized key. */
  merchant: string
  cents: number
  count: number
  deltaCents: number
  recurring: boolean
}

export interface CycleDot {
  key: string
  merchantKey: string
  merchantLabel: string
  day: number
  amountCents: number
  landed: boolean
  stackIndex: number
  /** The real transaction date, when `landed` — omitted for a projected
   *  "ahead" dot, which has no real date yet. */
  landedDate: string | null
}

export interface TopMerchantsSummary {
  entries: MerchantEntry[]
  /** Detected recurring_charge routines, keyed lookups via `merchantKey` —
   *  exposed so the panel's second level (typical amount, cadence,
   *  confidence, lapsed flag) doesn't re-run detection. */
  routines: DetectedRoutine[]
  hasPriorPeriod: boolean
  periodTotalCents: number
  standingMonthlyCents: number
  activeRecurringCount: number
  recurringInPeriodCents: number
  share: number | null
  dots: CycleDot[]
  landedCount: number
  landedCents: number
  aheadCount: number
  aheadCents: number
  containsToday: boolean
  /** `now`'s day-of-month, only when `containsToday` — avoids the render
   *  layer ever reaching for a real `new Date()`. */
  todayDay: number | null
  isLongWindow: boolean
  /** Whole months the window spans, rounded — only meaningful/used when
   *  `isLongWindow`. */
  windowMonths: number
  nextCharge: { merchantLabel: string; day: number; amountCents: number } | null
}

function mode(values: readonly string[]): string {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best = values[0]
  let bestCount = 0
  for (const v of values) {
    const c = counts.get(v)!
    if (c > bestCount) {
      best = v
      bestCount = c
    }
  }
  return best
}

/**
 * Ranks merchants by period spend and derives the recurring-charge verdict
 * and cycle strip (spec 057 US6 redesign). Reuses `detectRoutines` as-is
 * (FR-016) rather than reimplementing recurring detection.
 *
 * Zone 1: `standingMonthlyCents` sums the typical amount of every ACTIVE
 * (non-lapsed) recurring charge — an approximate, forward-looking figure,
 * always presented hedged ("about"). `recurringInPeriodCents` is the exact
 * opposite: real money that actually landed within `interval`.
 *
 * Zone 2: detection is monthly by construction, so the only period-
 * independent axis is day-of-month (1-31) — not the period's own date
 * range, which would either be nearly empty (a week) or absurdly dense (a
 * year). A window longer than `LONG_WINDOW_DAYS` folds every cycle onto
 * that axis and drops the "ahead of today" projection entirely, since
 * "today" is not a meaningful single point across many months.
 */
export function computeTopMerchants(
  transactions: Transaction[],
  interval: { start: Date; end: Date },
  now: Date
): TopMerchantsSummary {
  const startMs = interval.start.getTime()
  const endMs = interval.end.getTime()
  const windowDays = (endMs - startMs) / MS_PER_DAY
  const isLongWindow = windowDays > LONG_WINDOW_DAYS
  const containsToday = !isLongWindow && now.getTime() >= startMs && now.getTime() < endMs

  const windowMs = endMs - startMs
  const prevStartMs = startMs - windowMs
  const prevEndMs = startMs

  const groups = new Map<string, { merchantKey: string; names: string[]; cents: number; count: number; prevCents: number }>()
  for (const tx of transactions) {
    if (tx.kind !== 'expense') continue
    const ms = parseTxDate(tx.date).getTime()
    const key = normalizeMerchantKey(tx.merchant)
    if (ms >= startMs && ms < endMs) {
      const g = groups.get(key) ?? { merchantKey: key, names: [], cents: 0, count: 0, prevCents: 0 }
      g.names.push(tx.merchant)
      g.cents += tx.amount_cents
      g.count += 1
      groups.set(key, g)
    } else if (ms >= prevStartMs && ms < prevEndMs) {
      const g = groups.get(key) ?? { merchantKey: key, names: [], cents: 0, count: 0, prevCents: 0 }
      g.prevCents += tx.amount_cents
      groups.set(key, g)
    }
  }

  const hasPriorPeriod = transactions.some((tx) => {
    if (tx.kind !== 'expense') return false
    const ms = parseTxDate(tx.date).getTime()
    return ms >= prevStartMs && ms < prevEndMs
  })

  const routines = detectRoutines(transactions, now).filter((r) => r.kind === 'recurring_charge')
  const routineByKey = new Map(routines.map((r) => [r.merchantKey, r]))
  const active = routines.filter((r) => r.derivedStatus !== 'lapsed')
  const standingMonthlyCents = active.reduce((sum, r) => sum + r.typicalAmountCents, 0)

  const entries: MerchantEntry[] = [...groups.values()]
    .filter((g) => g.cents > 0)
    .map((g) => ({
      merchantKey: g.merchantKey,
      merchant: mode(g.names),
      cents: g.cents,
      count: g.count,
      deltaCents: g.cents - g.prevCents,
      recurring: routineByKey.has(g.merchantKey),
    }))
    .sort((a, b) => b.cents - a.cents)

  const periodTotalCents = entries.reduce((sum, e) => sum + e.cents, 0)

  // Zone 2: one dot per recurring charge's calendar-day landing within the
  // window (folds naturally across multiple months — only day-of-month is
  // tracked), plus an "ahead" dot for each active charge that hasn't landed
  // this cycle, when the window contains today.
  const rawDots: CycleDot[] = []
  const landedKeysThisCycle = new Set<string>()
  for (const tx of transactions) {
    if (tx.kind !== 'expense') continue
    const ms = parseTxDate(tx.date).getTime()
    if (ms < startMs || ms >= endMs) continue
    const key = normalizeMerchantKey(tx.merchant)
    const routine = routineByKey.get(key)
    if (!routine) continue
    const day = parseTxDate(tx.date).getDate()
    rawDots.push({
      key: `${key}:${tx.id}`,
      merchantKey: key,
      merchantLabel: routine.merchantLabel,
      day,
      amountCents: tx.amount_cents,
      landed: true,
      stackIndex: 0,
      landedDate: tx.date,
    })
    landedKeysThisCycle.add(key)
  }
  if (containsToday) {
    for (const r of active) {
      if (landedKeysThisCycle.has(r.merchantKey)) continue
      const day = new Date(r.lastSeenAt).getDate()
      rawDots.push({
        key: `${r.merchantKey}:ahead`,
        merchantKey: r.merchantKey,
        merchantLabel: r.merchantLabel,
        day,
        amountCents: r.typicalAmountCents,
        landed: false,
        stackIndex: 0,
        landedDate: null,
      })
    }
  }

  const landedCount = rawDots.filter((d) => d.landed).length
  const landedCents = rawDots.filter((d) => d.landed).reduce((sum, d) => sum + d.amountCents, 0)
  const aheadDots = rawDots.filter((d) => !d.landed)
  const aheadCount = aheadDots.length
  const aheadCents = aheadDots.reduce((sum, d) => sum + d.amountCents, 0)

  const byDay = new Map<number, CycleDot[]>()
  for (const d of rawDots) {
    const arr = byDay.get(d.day) ?? []
    arr.push(d)
    byDay.set(d.day, arr)
  }
  const dots: CycleDot[] = []
  for (const arr of byDay.values()) {
    const capped = [...arr].sort((a, b) => b.amountCents - a.amountCents).slice(0, MAX_STACK_PER_DAY)
    capped.forEach((d, i) => dots.push({ ...d, stackIndex: i }))
  }
  dots.sort((a, b) => a.day - b.day)

  let nextCharge: TopMerchantsSummary['nextCharge'] = null
  if (aheadDots.length > 0) {
    const todayDay = now.getDate()
    const daysUntil = (day: number) => (day >= todayDay ? day - todayDay : day - todayDay + 31)
    const soonest = [...aheadDots].sort((a, b) => daysUntil(a.day) - daysUntil(b.day))[0]
    nextCharge = { merchantLabel: soonest.merchantLabel, day: soonest.day, amountCents: soonest.amountCents }
  }

  return {
    entries,
    routines,
    hasPriorPeriod,
    periodTotalCents,
    standingMonthlyCents,
    activeRecurringCount: active.length,
    recurringInPeriodCents: landedCents,
    share: periodTotalCents > 0 ? landedCents / periodTotalCents : null,
    dots,
    landedCount,
    landedCents,
    aheadCount,
    aheadCents,
    containsToday,
    todayDay: containsToday ? now.getDate() : null,
    isLongWindow,
    windowMonths: Math.max(1, Math.round(windowDays / 30)),
    nextCharge,
  }
}

export function isBigDot(amountCents: number): boolean {
  return amountCents >= BIG_DOT_THRESHOLD_CENTS
}
