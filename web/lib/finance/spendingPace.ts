import { parseTxDate, startOfDay } from '../format'
import type { Transaction, TransactionCategory } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000

export interface PaceCategoryRow {
  category: TransactionCategory
  cents: number
  deltaCents: number
}

export interface PaceSummary {
  /** Whole days in the active scope period (e.g. 31 for August). */
  daysInPeriod: number
  /** Days of the period that have happened so far, inclusive of today/the anchor day. */
  daysElapsed: number
  /** Σ expense cents from the period's start through the anchor day. */
  mtdCents: number
  avgPerDayCents: number
  /** Linear projection: avgPerDayCents × daysInPeriod. */
  projectedCents: number
  /** Σ expense cents over the immediately preceding period of equal length. */
  priorTotalCents: number
  /** True when the household has any recorded spend before the period start — a
   *  first-ever period must never invent a comparison (spec 057 US4 redesign). */
  hasPriorPeriod: boolean
  /** (avgPerDayCents ÷ priorAvgPerDayCents) − 1. Null when there's no prior period. */
  deltaPct: number | null
  /** What the prior period had accumulated by the same relative day position. */
  priorRateAtTodayCents: number
  /** Current-period cumulative spend, one entry per elapsed day (length daysElapsed). */
  cumulative: number[]
  /** Prior-period cumulative spend, one entry per day of the full period (length daysInPeriod). */
  priorCumulative: number[]
  /** This period's categories with spend > 0, sorted by amount descending. */
  categoryRows: PaceCategoryRow[]
}

function runningTotal(daily: number[]): number[] {
  const out = new Array<number>(daily.length)
  let sum = 0
  for (let i = 0; i < daily.length; i++) {
    sum += daily[i]
    out[i] = sum
  }
  return out
}

/**
 * The spending-pace panel's redesigned engine (spec 057 US4 follow-up). Replaces
 * the trailing-30-vs-prior-30 model with a period-relative one: "period" is the
 * active dashboard scope's own interval (a calendar month under the default "this
 * month" range, but any interval honours the same math), and "last period" is the
 * immediately preceding window of equal length — so a household on a custom range
 * gets an honest "last period" comparison rather than a hardcoded "last month".
 *
 * Pure and derived-only: nothing here is persisted, mirroring `insights.ts` /
 * `personSummary.ts`. Callers pass already-scoped transactions (both scope axes
 * honoured by the caller, exactly as the panel does today).
 */
export function computeSpendingPace(transactions: Transaction[], interval: { start: Date; end: Date }, now: Date): PaceSummary {
  // The interval arrives in one of two frames: LOCAL month boundaries (range
  // mode, components/dashboard/range.ts) or UTC instants (a selected month,
  // via the vectored monthBounds). Flooring the bounds with local startOfDay
  // shifted a UTC-frame month one day early in negative-UTC zones (review
  // 2026-08-24, B1) — so the bounds are taken as-is and each transaction is
  // placed by its millisecond offset from the period start. Noon-UTC rows
  // land exactly in either frame within ±11 offsets; date-only legacy rows
  // go through the spec-027 A2 guard (parseTxDate).
  const periodStart = interval.start.getTime()
  const periodEndExclusive = interval.end.getTime()
  const daysInPeriod = Math.max(1, Math.round((periodEndExclusive - periodStart) / DAY_MS))

  const anchorDayMs = Math.min(periodEndExclusive - DAY_MS, startOfDay(now).getTime())
  const daysElapsed = Math.min(daysInPeriod, Math.max(1, Math.round((anchorDayMs - periodStart) / DAY_MS) + 1))

  const priorPeriodStart = periodStart - daysInPeriod * DAY_MS

  const currentDaily = new Array<number>(daysInPeriod).fill(0)
  const priorDaily = new Array<number>(daysInPeriod).fill(0)
  const currentByCategory = new Map<TransactionCategory, number>()
  const priorByCategory = new Map<TransactionCategory, number>()
  let anyPriorHistory = false

  for (const tx of transactions) {
    if (tx.kind !== 'expense') continue
    const d = parseTxDate(tx.date).getTime()
    if (d >= periodStart && d < periodEndExclusive) {
      const idx = Math.floor((d - periodStart) / DAY_MS)
      if (idx >= 0 && idx < daysInPeriod) currentDaily[idx] += tx.amount_cents
      currentByCategory.set(tx.category, (currentByCategory.get(tx.category) ?? 0) + tx.amount_cents)
    } else if (d >= priorPeriodStart && d < periodStart) {
      anyPriorHistory = true
      const idx = Math.floor((d - priorPeriodStart) / DAY_MS)
      if (idx >= 0 && idx < daysInPeriod) priorDaily[idx] += tx.amount_cents
      priorByCategory.set(tx.category, (priorByCategory.get(tx.category) ?? 0) + tx.amount_cents)
    } else if (d < periodStart) {
      anyPriorHistory = true
    }
  }

  const cumulativeAll = runningTotal(currentDaily)
  const priorCumulative = runningTotal(priorDaily)
  const cumulative = cumulativeAll.slice(0, daysElapsed)

  const mtdCents = cumulative[cumulative.length - 1] ?? 0
  const priorTotalCents = priorCumulative[priorCumulative.length - 1] ?? 0
  const hasPriorPeriod = anyPriorHistory && priorTotalCents > 0

  const avgPerDayCents = mtdCents / daysElapsed
  const projectedCents = Math.round(avgPerDayCents * daysInPeriod)
  const priorAvgPerDayCents = priorTotalCents / daysInPeriod
  const priorRateAtTodayCents = Math.round(priorAvgPerDayCents * daysElapsed)
  const deltaPct = hasPriorPeriod && priorAvgPerDayCents > 0 ? avgPerDayCents / priorAvgPerDayCents - 1 : null

  const categories = new Set([...currentByCategory.keys(), ...priorByCategory.keys()])
  const categoryRows: PaceCategoryRow[] = [...categories]
    .map((category) => ({
      category,
      cents: currentByCategory.get(category) ?? 0,
      deltaCents: (currentByCategory.get(category) ?? 0) - (priorByCategory.get(category) ?? 0),
    }))
    .filter((r) => r.cents > 0)
    .sort((a, b) => b.cents - a.cents)

  return {
    daysInPeriod,
    daysElapsed,
    mtdCents,
    avgPerDayCents,
    projectedCents,
    priorTotalCents,
    hasPriorPeriod,
    deltaPct,
    priorRateAtTodayCents,
    cumulative,
    priorCumulative,
    categoryRows,
  }
}

/** What a total budget would have accumulated by `daysElapsed` of `daysInPeriod`
 *  at an even pace — the budget-aware marker/verdict reference (spec 057 US4). */
export function budgetPaceCents(budgetCents: number, daysElapsed: number, daysInPeriod: number): number {
  if (daysInPeriod <= 0) return 0
  return Math.round((budgetCents * daysElapsed) / daysInPeriod)
}
