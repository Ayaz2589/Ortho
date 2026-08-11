// Financial Routines detection engine (spec 044). Pure, deterministic, side-effect-free — mirrors
// insights.ts / personSummary.ts (no React, no DB). Routine *detection* is always recomputed live
// from transactions (README's "derived, never stored" principle); only a user's confirm/dismiss/
// rename decision is persisted (recognized_routine_states), applied on top via applyRoutineStates().
// Pinned by unit + property tests (web/test/finance/routines*.test.ts), not a golden vector — same
// precedent as financialHealth.ts. Contract: specs/044-financial-routines/contracts/routines-engine.md.

import type { RecognizedRoutineState, Transaction, TransactionCategory } from '../types'
import { ROUTINE_THRESHOLDS as T } from './routines-thresholds'

export type RoutineKind = 'recurring_charge' | 'behavioral_habit'
export type RoutineDerivedStatus = 'recognized' | 'lapsed'
export type RoutineStatus = RoutineDerivedStatus | 'confirmed' | 'dismissed'

export interface DetectedRoutine {
  routineKey: string
  kind: RoutineKind
  merchantKey: string
  merchantLabel: string
  category: TransactionCategory | null
  weekday: number | null
  hourBucket: number | null
  personId: string | null
  typicalAmountCents: number
  amountVarianceCents: number
  occurrenceCount: number
  firstSeenAt: string
  lastSeenAt: string
  confidence: number
  derivedStatus: RoutineDerivedStatus
  evidenceTransactionIds: string[]
}

export interface RoutineWithState extends DetectedRoutine {
  status: RoutineStatus
  label: string | null
}

/** Normalize a raw merchant string into a stable grouping key (FR-007). Lowercase, strip a
 *  trailing POS/store-location numeric suffix, collapse whitespace/punctuation. Heuristic, tunable
 *  via routines-thresholds.ts without touching detection logic. */
export function normalizeMerchantKey(merchant: string): string {
  const cleaned = merchant
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const storeCodePattern = new RegExp(
    `\\s\\d{${T.merchantStoreCodeMinDigits},${T.merchantStoreCodeMaxDigits}}$`
  )
  return cleaned.replace(storeCodePattern, '').trim()
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function daysBetween(a: Date, b: Date): number {
  return Math.abs(b.getTime() - a.getTime()) / MS_PER_DAY
}

/** Median of a non-empty numeric array (average of the two middle values when even-length). */
function median(nums: readonly number[]): number {
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid]
}

/** Most-frequent value in a non-empty array (first-seen wins a tie, for determinism). */
function mode<V>(values: readonly V[]): V {
  const counts = new Map<V, number>()
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

/** Single owner across every evidence transaction → that person's routine; any split/shared
 *  evidence, or transactions with different single owners, → household-wide (null) (FR-008/016). */
function attributedPerson(evidence: readonly Transaction[]): string | null {
  let person: string | null = null
  for (const t of evidence) {
    if (t.owner_ids.length !== 1) return null
    const owner = t.owner_ids[0]
    if (person === null) person = owner
    else if (person !== owner) return null
  }
  return person
}

interface MerchantGroup {
  merchantKey: string
  transactions: Transaction[]
}

function groupByMerchant(transactions: readonly Transaction[]): MerchantGroup[] {
  const groups = new Map<string, Transaction[]>()
  for (const t of transactions) {
    const key = normalizeMerchantKey(t.merchant)
    const arr = groups.get(key) ?? []
    arr.push(t)
    groups.set(key, arr)
  }
  return [...groups.entries()].map(([merchantKey, txns]) => ({ merchantKey, transactions: txns }))
}

function detectRecurringCharges(transactions: readonly Transaction[], now: Date): DetectedRoutine[] {
  const windowStart = new Date(now)
  windowStart.setMonth(windowStart.getMonth() - T.recurringWindowMonths)
  const inWindow = transactions.filter(
    (t) => t.kind === 'expense' && new Date(t.date) >= windowStart && new Date(t.date) <= now
  )

  const out: DetectedRoutine[] = []
  for (const group of groupByMerchant(inWindow)) {
    const evidence = [...group.transactions].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )
    if (evidence.length < T.recurringMinCount) continue

    const amounts = evidence.map((t) => t.amount_cents)
    const typicalAmountCents = median(amounts)
    const tolerance = typicalAmountCents * T.recurringAmountTolerance
    const amountHits = amounts.filter((a) => Math.abs(a - typicalAmountCents) <= tolerance).length
    if (amountHits / evidence.length < T.recurringHitRatio) continue

    const gaps: number[] = []
    for (let i = 1; i < evidence.length; i++) {
      gaps.push(daysBetween(new Date(evidence[i - 1].date), new Date(evidence[i].date)))
    }
    const cadenceHits = gaps.filter(
      (g) => g >= T.recurringCadenceMinDays && g <= T.recurringCadenceMaxDays
    ).length
    const cadenceHitRatio = gaps.length > 0 ? cadenceHits / gaps.length : 0
    if (cadenceHitRatio < T.recurringHitRatio) continue

    const amountVarianceCents = Math.max(...amounts.map((a) => Math.abs(a - typicalAmountCents)))
    const firstSeenAt = evidence[0].date
    const lastSeenAt = evidence[evidence.length - 1].date
    const medianGapDays = gaps.length > 0 ? median(gaps) : T.recurringCadenceMinDays
    const daysSinceLastSeen = daysBetween(new Date(lastSeenAt), now)
    const derivedStatus: RoutineDerivedStatus =
      daysSinceLastSeen > medianGapDays * T.lapseAfterMissedCycles ? 'lapsed' : 'recognized'
    const confidence = clampConfidence(
      100 * Math.min(1, evidence.length / (T.recurringMinCount * 2)) * cadenceHitRatio
    )

    out.push({
      routineKey: `rc:${group.merchantKey}`,
      kind: 'recurring_charge',
      merchantKey: group.merchantKey,
      merchantLabel: mode(evidence.map((t) => t.merchant)),
      category: mode(evidence.map((t) => t.category)),
      weekday: null,
      hourBucket: null,
      personId: attributedPerson(evidence),
      typicalAmountCents,
      amountVarianceCents,
      occurrenceCount: evidence.length,
      firstSeenAt,
      lastSeenAt,
      confidence,
      derivedStatus,
      evidenceTransactionIds: evidence.map((t) => t.id),
    })
  }
  return out
}

function clampConfidence(x: number): number {
  return Math.round(Math.max(0, Math.min(100, x)))
}

/** Detect every routine candidate from a household's transactions (FR-001-003). Pure; `now`
 *  injected. Order of the returned array is not significant — callers group/sort for display. */
export function detectRoutines(transactions: Transaction[], now: Date): DetectedRoutine[] {
  return [...detectRecurringCharges(transactions, now)]
}

/** Overlay persisted confirm/dismiss/rename state onto detected routines (FR-005/006). Never drops
 *  a routine; a `dismissed` state row always wins, a `confirmed` one wins unless the routine has
 *  independently gone `lapsed`. */
export function applyRoutineStates(
  detected: readonly DetectedRoutine[],
  states: readonly RecognizedRoutineState[]
): RoutineWithState[] {
  const byKey = new Map(states.map((s) => [s.routine_key, s]))
  return detected.map((routine) => {
    const state = byKey.get(routine.routineKey)
    let status: RoutineStatus = routine.derivedStatus
    if (state?.status === 'dismissed') status = 'dismissed'
    else if (state?.status === 'confirmed') status = routine.derivedStatus === 'lapsed' ? 'lapsed' : 'confirmed'
    return { ...routine, status, label: state?.label ?? null }
  })
}
