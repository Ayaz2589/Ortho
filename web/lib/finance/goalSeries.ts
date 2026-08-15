// spec 045 — the two chart series behind the goal detail page. Pure, deterministic,
// integer USD cents in and out, reference date injected. Kept OUT of the chart
// components so the numbers can be asserted directly and the recharts leaves stay
// dumb (they are dynamically loaded and never money-aware).
//
// Two identities are property-pinned in test/finance/goalSeries.test.ts:
//   last(cumulativeSeries).cumulativeCents === goalProgress(...).saved_cents
//   sum(monthlySeries.cents)               === goalProgress(...).saved_cents
// They are what stops a chart from quietly disagreeing with the headline figure
// printed directly above it.
//
// NOT promoted to shared/test-vectors/ — these are presentation-support series,
// not a change to the vectored goalProgress/goalPacing contract (research R6).

import type { GoalContribution } from '../types'
import { parseLocalDate } from '../format'

export interface CumulativePoint {
  /** Local calendar day of the point, `YYYY-MM-DD`. */
  day: string
  /** Sum of every contribution dated on or before `day`, in USD cents. */
  cumulativeCents: number
  /** Steady-pace expectation on `day`, in USD cents. Null for an undated goal. */
  paceCents: number | null
}

export interface MonthPoint {
  /** `YYYY-MM`. */
  monthKey: string
  /** That month's contribution total, in USD cents. */
  cents: number
}

export interface CumulativeOptions {
  targetCents: number
  /** `YYYY-MM-DD`, or null for an undated goal (⇒ no pace line). */
  targetDate: string | null
  /** The goal's `created_at` — the pace line's start anchor. */
  createdAt: string
  now: Date
}

/** Calendar-day index from LOCAL getters — the `goals.ts` rule, so spans are
 *  timezone-stable and a date's index never flips west of UTC. */
function dayIndex(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000)
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

/** The `YYYY-MM-DD` day key of a contribution (its stored date's calendar day). */
function dayKey(c: GoalContribution): string {
  return c.date.slice(0, 10)
}

/**
 * How the saved total accumulated, one point per distinct contribution day, plus
 * a leading zero point at the goal's creation day so a single contribution still
 * draws a line rather than an invisible dot.
 *
 * Two contributions on the same day collapse to ONE point carrying both — this is
 * a running total, not a ledger. (The ledger below the chart still lists each row
 * separately, and each stays individually editable.)
 *
 * `paceCents` uses the SAME basis as `goalPacing.expected_cents` —
 * `round(target × clamp(elapsed / span, 0, 1))` over creation→target — so the pace
 * line and the "behind pace" copy can never contradict each other.
 */
export function cumulativeSeries(
  contributions: readonly GoalContribution[],
  opts: CumulativeOptions
): CumulativePoint[] {
  if (contributions.length === 0) return []

  const byDay = new Map<string, number>()
  for (const c of contributions) {
    const k = dayKey(c)
    byDay.set(k, (byDay.get(k) ?? 0) + c.amount_cents)
  }

  const startDay = new Date(opts.createdAt)
  const startKey = `${startDay.getFullYear()}-${String(startDay.getMonth() + 1).padStart(2, '0')}-${String(startDay.getDate()).padStart(2, '0')}`
  // A contribution dated before the goal was created is still real money — keep the
  // anchor at or before the earliest day so no point falls off the left edge.
  if (!byDay.has(startKey)) byDay.set(startKey, 0)

  const startIdx = dayIndex(startDay)
  const targetIdx = opts.targetDate ? dayIndex(parseLocalDate(opts.targetDate)) : null
  const span = targetIdx === null ? 0 : targetIdx - startIdx

  const days = [...byDay.keys()].sort()
  let running = 0
  return days.map((day) => {
    running += byDay.get(day) ?? 0
    let paceCents: number | null = null
    if (targetIdx !== null) {
      const elapsed = dayIndex(parseLocalDate(day)) - startIdx
      const fraction = span <= 0 ? 1 : clamp01(elapsed / span)
      paceCents = Math.round(opts.targetCents * fraction)
    }
    return { day, cumulativeCents: running, paceCents }
  })
}

/** `YYYY-MM` of a contribution's stored date. */
function monthKey(c: GoalContribution): string {
  return c.date.slice(0, 7)
}

/** One month later, as `YYYY-MM`. */
function nextMonth(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

/**
 * Contribution totals per calendar month, ascending, contiguous from the earliest
 * to the latest contributing month with gaps filled at zero — so a quiet stretch
 * reads as a gap rather than making two distant months look adjacent.
 *
 * Deliberately bounded to that span: a goal dormant since 2019 renders its own
 * months, not a hundred empty ones out to today.
 */
export function monthlySeries(contributions: readonly GoalContribution[]): MonthPoint[] {
  if (contributions.length === 0) return []

  const byMonth = new Map<string, number>()
  for (const c of contributions) {
    const k = monthKey(c)
    byMonth.set(k, (byMonth.get(k) ?? 0) + c.amount_cents)
  }

  const keys = [...byMonth.keys()].sort()
  const first = keys[0]
  const last = keys[keys.length - 1]

  const out: MonthPoint[] = []
  for (let k = first; ; k = nextMonth(k)) {
    out.push({ monthKey: k, cents: byMonth.get(k) ?? 0 })
    if (k === last) break
  }
  return out
}
