import type { Goal, GoalContribution, Insight } from '../types'
import { parseLocalDate } from '../format'
import { type InsightTranslate, compareInsights } from './insights'
import { GOAL_THRESHOLDS as G } from './goals-thresholds'

// Savings & debt-payoff goals (spec 027). Pure, deterministic, side-effect-free;
// integer USD cents in and out; the reference "today" is injected. Progress is
// the sum of a goal's contributions (bank balances aren't synced — spec 024 is
// connect-only). Savings and debt-payoff share ONE progress model; kind is only
// plain-language framing. Pinned by shared/test-vectors/goals.json.

export interface GoalProgress {
  /** Exact integer-cent sum of the goal's contributions. */
  saved_cents: number
  target_cents: number
  /** max(0, target − saved) — never negative. */
  remaining_cents: number
  /** clamp(saved / target, 0, 1); 0 when target ≤ 0. Never above 1. */
  fraction: number
  /** target > 0 && saved ≥ target. */
  reached: boolean
}

export interface GoalPacing {
  /** Behind the steady pace (beyond tolerance), or past due and unreached. */
  off_track: boolean
  /** Reference day is at or after the target date. */
  past_due: boolean
  /** round(target × clamp(elapsed/span, 0, 1)) — the steady-pace expectation
   *  as of `now`. 0 for an undated goal. */
  expected_cents: number
  /** max(0, expected − saved). */
  shortfall_cents: number
  /** ceil(remaining / monthsLeft) to still reach the target by the date;
   *  = remaining when past due; 0 when reached or undated. */
  suggested_monthly_cents: number
}

/** Calendar-day index built from LOCAL getters (the insights.ts rule) so spans
 *  are timezone-stable — a date's index never flips west of UTC. */
function dayIndex(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000)
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

function sumContributions(contributions: readonly Pick<GoalContribution, 'amount_cents'>[]): number {
  return contributions.reduce((s, c) => s + c.amount_cents, 0)
}

/** Progress toward a goal's target from its contributions (US1). */
export function goalProgress(
  targetCents: number,
  contributions: readonly Pick<GoalContribution, 'amount_cents'>[]
): GoalProgress {
  const saved = sumContributions(contributions)
  const positive = targetCents > 0
  return {
    saved_cents: saved,
    target_cents: targetCents,
    remaining_cents: Math.max(0, targetCents - saved),
    fraction: positive ? clamp01(saved / targetCents) : 0,
    reached: positive && saved >= targetCents,
  }
}

/** Steady-pace assessment of a dated goal as of `now` (US2). Undated goals have
 *  no pace and are never off-track. */
export function goalPacing(
  targetCents: number,
  targetDate: string | null,
  startISO: string,
  savedCents: number,
  now: Date
): GoalPacing {
  if (!targetDate) {
    return {
      off_track: false,
      past_due: false,
      expected_cents: 0,
      shortfall_cents: 0,
      suggested_monthly_cents: 0,
    }
  }

  const startIdx = dayIndex(new Date(startISO))
  const nowIdx = dayIndex(now)
  const targetIdx = dayIndex(parseLocalDate(targetDate))

  const span = targetIdx - startIdx
  const elapsed = nowIdx - startIdx
  const expectedFraction = span <= 0 ? 1 : clamp01(elapsed / span)
  const expected = Math.round(targetCents * expectedFraction)

  const pastDue = nowIdx >= targetIdx
  const reached = targetCents > 0 && savedCents >= targetCents
  const remaining = Math.max(0, targetCents - savedCents)
  const shortfall = Math.max(0, expected - savedCents)

  const daysLeft = targetIdx - nowIdx
  const monthsLeft = daysLeft <= 0 ? 0 : Math.max(1, Math.ceil(daysLeft / G.daysPerMonth))
  const suggestedMonthly = reached
    ? 0
    : monthsLeft <= 0
      ? remaining
      : Math.ceil(remaining / monthsLeft)

  // Tolerance floor (fraction of target), at least 1 cent so a rounding wobble
  // can't trip it. A past-due unreached goal is always off-track (out of time).
  const toleranceFloor = Math.max(1, Math.round(targetCents * G.offTrackToleranceFraction))
  const offTrack = reached ? false : pastDue ? true : shortfall >= toleranceFloor

  return {
    off_track: offTrack,
    past_due: pastDue,
    expected_cents: expected,
    shortfall_cents: shortfall,
    suggested_monthly_cents: suggestedMonthly,
  }
}

const identityTr: InsightTranslate = (key, ...args) =>
  args.length ? key.replace(/\{(\d+)\}/g, (m, i) => String(args[Number(i)] ?? m)) : key

const USD_FMT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const usd = (cents: number) => USD_FMT.format(Math.abs(cents) / 100)

/** The one off-track insight rule (spec 027, FR-008). Returns an ordinary
 *  `Insight` (so it renders in the existing Insights card) or null when the goal
 *  is on pace, reached, or undated. Calm severity — behind is NEVER `critical`/red
 *  (Constitution I/II). Body strings are localized via `tr` and are NOT vectored
 *  (display strings, per docs/shared.md); id/severity/category/magnitude are. */
export function goalOffTrackInsight(
  goal: Goal,
  contributions: readonly Pick<GoalContribution, 'amount_cents'>[],
  now: Date,
  tr: InsightTranslate = identityTr,
  locale: string = 'en-US'
): Insight | null {
  const saved = sumContributions(contributions)
  const pacing = goalPacing(goal.target_cents, goal.target_date, goal.created_at, saved, now)
  if (!pacing.off_track) return null

  const when = goal.target_date
    ? new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(
        parseLocalDate(goal.target_date)
      )
    : ''
  return {
    id: `goal-offtrack-${goal.id}`,
    title: tr('{0} is behind pace', goal.name),
    body: tr(
      '{0} of {1} saved — about {2} behind. Set aside {3}/mo to reach it by {4}.',
      usd(saved),
      usd(goal.target_cents),
      usd(pacing.shortfall_cents),
      usd(pacing.suggested_monthly_cents),
      when
    ),
    severity: 'warning',
    icon: 'target',
    category: goal.linked_category ?? null,
    magnitude_cents: pacing.shortfall_cents,
  }
}

/** Group a flat contributions list by `goal_id` — the shape `goalInsights`
 *  wants, and what the store exposes as one array. */
export function contributionsByGoal(
  contributions: readonly GoalContribution[]
): Record<string, GoalContribution[]> {
  const by: Record<string, GoalContribution[]> = {}
  for (const c of contributions) {
    ;(by[c.goal_id] ??= []).push(c)
  }
  return by
}

/** All off-track insights for a household's goals, sorted by the shared insight
 *  ordering. Not sliced — the dashboard consumers merge with `generateInsights`
 *  and slice to the display limit. */
export function goalInsights(
  goals: readonly Goal[],
  contributionsByGoalId: Record<string, GoalContribution[]>,
  now: Date,
  tr: InsightTranslate = identityTr,
  locale: string = 'en-US'
): Insight[] {
  const out: Insight[] = []
  for (const goal of goals) {
    const insight = goalOffTrackInsight(goal, contributionsByGoalId[goal.id] ?? [], now, tr, locale)
    if (insight) out.push(insight)
  }
  out.sort(compareInsights)
  return out
}
