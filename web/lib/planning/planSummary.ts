// Planning Hub engine (spec 036). Pure, deterministic, integer-USD-cents; the
// reference "today" is always injected. Composes the existing rollover
// (`budgetStatusForMonth`) and goal-pacing (`goalProgress`/`goalPacing`) engines —
// no new stored data, no schema change. Contract + test obligations:
// specs/036-planning-hub/contracts/plan-summary.md, locked by
// test/planning/planSummary.test.ts.

import type { Budget, Goal, GoalContribution, Transaction, TransactionCategory } from '../types'
import { budgetStatusForMonth } from '../finance/budgets'
import { goalProgress, goalPacing } from '../finance/goals'
import { monthBounds } from '../transactionFilters'
import { PLANNING } from './thresholds'

export type PaceState = 'under' | 'attention' | 'over'

export interface PlanHealth {
  incomeCents: number
  budgetedCents: number
  goalContributionsCents: number
  leftToPlanCents: number
}

export interface AtRiskBudget {
  budgetId: string
  category: TransactionCategory
  effectiveLimitCents: number
  spentCents: number
  remainingCents: number
  carriedInCents: number
  fraction: number
  pace: PaceState
}

export interface BudgetSummary {
  totalSpentCents: number
  totalLimitCents: number
  overallPace: PaceState
  atRisk: AtRiskBudget[]
  budgetCount: number
}

export interface GoalRowSummary {
  goalId: string
  name: string
  savedCents: number
  targetCents: number
  fraction: number
  reached: boolean
  dated: boolean
  offTrack: boolean
  suggestedMonthlyCents: number
  targetDate: string | null
}

export interface GoalsSummary {
  rows: GoalRowSummary[]
  goalCount: number
}

export interface SinkingFund {
  budgetId: string
  category: TransactionCategory
  setAsideCents: number
  baseLimitCents: number
}

export interface PlanSummaryInput {
  budgets: Budget[]
  goals: Goal[]
  goalContributions: GoalContribution[]
  transactions: Transaction[]
  monthKey: string
}

export interface PlanSummary {
  monthKey: string
  referenceDate: Date
  health: PlanHealth
  budgets: BudgetSummary
  goals: GoalsSummary
  sinkingFunds: SinkingFund[]
}

// ── Month helpers ─────────────────────────────────────────────────────────────

/** Local-calendar `'YYYY-MM'` for a date. */
export function currentMonthKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function parseKey(monthKey: string): { year: number; month1: number } {
  const [y, m] = monthKey.split('-')
  return { year: Number(y), month1: Number(m) }
}

/** Adjacent month key; wraps the year. Future keys are allowed (planning ahead). */
export function stepMonthKey(monthKey: string, dir: 'prev' | 'next'): string {
  const { year, month1 } = parseKey(monthKey)
  const d = new Date(year, month1 - 1 + (dir === 'next' ? 1 : -1), 1)
  return currentMonthKey(d)
}

/** Compare two `'YYYY-MM'` keys: <0, 0, >0. */
function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Representative instant for month-sensitive math:
 * current month → `now`; a past month → its last instant; a future month → its
 * first instant. This drives every figure so changing the month recomputes all.
 */
export function planReferenceDate(monthKey: string, now: Date): Date {
  const cmp = compareKeys(monthKey, currentMonthKey(now))
  if (cmp === 0) return now
  const { year, month1 } = parseKey(monthKey)
  return cmp < 0
    ? new Date(year, month1, 0, 23, 59, 59, 999) // day 0 of next month = last day of this one
    : new Date(year, month1 - 1, 1, 0, 0, 0, 0)
}

/** Fraction of the month elapsed as of `now`: current → day/daysInMonth (in (0,1]),
 *  past → 1, future → 0. */
export function monthElapsedFraction(monthKey: string, now: Date): number {
  const cmp = compareKeys(monthKey, currentMonthKey(now))
  if (cmp < 0) return 1
  if (cmp > 0) return 0
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return now.getDate() / daysInMonth
}

// ── Pace ─────────────────────────────────────────────────────────────────────

/** Budget health by pace: over at/above the limit; attention when spending is
 *  ahead of the month's elapsed fraction; under otherwise. Never returns a color —
 *  presentation maps this to sand/sage (never red). */
export function paceState(
  spentCents: number,
  effectiveLimitCents: number,
  elapsedFraction: number,
): PaceState {
  if (effectiveLimitCents <= 0) return 'under'
  if (spentCents >= effectiveLimitCents) return 'over'
  const spentFraction = spentCents / effectiveLimitCents
  if (elapsedFraction <= 0) return spentCents > 0 ? 'attention' : 'under'
  return spentFraction >= elapsedFraction * PLANNING.attentionRatio ? 'attention' : 'under'
}

// ── Aggregates ────────────────────────────────────────────────────────────────

/** Σ income transactions inside the month's `monthBounds` window (UTC, half-open). */
export function incomeForMonth(transactions: Transaction[], monthKey: string): number {
  const b = monthBounds(monthKey)
  const startMs = new Date(b.dateFrom).getTime()
  const endMs = new Date(b.dateTo).getTime()
  let sum = 0
  for (const tx of transactions) {
    if (tx.kind !== 'income') continue
    const ms = new Date(tx.date).getTime()
    if (ms < startMs || ms >= endMs) continue
    sum += tx.amount_cents
  }
  return sum
}

/** Σ suggested monthly contribution over goals (dated + unreached contribute;
 *  undated/reached contribute 0), as of `referenceDate`. */
export function plannedGoalContributions(
  goals: Goal[],
  contributionsByGoalId: Record<string, GoalContribution[]>,
  referenceDate: Date,
): number {
  let sum = 0
  for (const g of goals) {
    const saved = sumContribs(contributionsByGoalId[g.id])
    sum += goalPacing(g.target_cents, g.target_date, g.created_at, saved, referenceDate)
      .suggested_monthly_cents
  }
  return sum
}

function sumContribs(list: GoalContribution[] | undefined): number {
  return (list ?? []).reduce((s, c) => s + c.amount_cents, 0)
}

/** The "Left to plan" hero: income − BASE monthly allowances − planned goal
 *  contributions. Base (not rollover-effective) limits are used so a prior surplus
 *  never appears to reduce what's left to plan (FR-008). */
export function planHealth(input: PlanSummaryInput, referenceDate: Date): PlanHealth {
  const incomeCents = incomeForMonth(input.transactions, input.monthKey)
  const budgetedCents = input.budgets
    .filter((b) => b.monthly_limit_cents > 0)
    .reduce((s, b) => s + b.monthly_limit_cents, 0)
  const by = groupContribs(input.goalContributions)
  const goalContributionsCents = plannedGoalContributions(input.goals, by, referenceDate)
  return {
    incomeCents,
    budgetedCents,
    goalContributionsCents,
    leftToPlanCents: incomeCents - budgetedCents - goalContributionsCents,
  }
}

/** Severity used to rank the at-risk list (over > attention > under). */
const PACE_RANK: Record<PaceState, number> = { over: 2, attention: 1, under: 0 }

/** `fixed`/`flex` budgets (with a positive limit) ranked ahead-of-pace first,
 *  capped at `PLANNING.topN`. `non_monthly` budgets are excluded — they appear in
 *  the sinking-funds panel instead. */
export function rankAtRiskBudgets(
  budgets: Budget[],
  transactions: Transaction[],
  referenceDate: Date,
  elapsedFraction: number,
): AtRiskBudget[] {
  return budgets
    .filter((b) => b.budget_type !== 'non_monthly' && b.monthly_limit_cents > 0)
    .map((b) => {
      const status = budgetStatusForMonth(b, transactions, referenceDate)
      const fraction =
        status.effectiveLimitCents > 0 ? status.spentCents / status.effectiveLimitCents : 0
      return {
        budgetId: b.id,
        category: b.category,
        effectiveLimitCents: status.effectiveLimitCents,
        spentCents: status.spentCents,
        remainingCents: status.remainingCents,
        carriedInCents: status.carriedInCents,
        fraction,
        pace: paceState(status.spentCents, status.effectiveLimitCents, elapsedFraction),
      }
    })
    .sort((a, b) => {
      const byPace = PACE_RANK[b.pace] - PACE_RANK[a.pace]
      if (byPace !== 0) return byPace
      return b.fraction - a.fraction
    })
    .slice(0, PLANNING.topN)
}

/** Overall + at-risk budget summary for the month. `budgetCount` counts all
 *  budgets with a positive limit (drives the empty state); `totalLimitCents` /
 *  `totalSpentCents` cover the `fixed`/`flex` set shown in the summary. */
export function budgetSummary(
  budgets: Budget[],
  transactions: Transaction[],
  referenceDate: Date,
  elapsedFraction: number,
): BudgetSummary {
  const atRisk = rankAtRiskBudgets(budgets, transactions, referenceDate, elapsedFraction)
  let totalSpent = 0
  let totalLimit = 0
  for (const b of budgets) {
    if (b.budget_type === 'non_monthly' || b.monthly_limit_cents <= 0) continue
    const status = budgetStatusForMonth(b, transactions, referenceDate)
    totalSpent += status.spentCents
    totalLimit += status.effectiveLimitCents
  }
  return {
    totalSpentCents: totalSpent,
    totalLimitCents: totalLimit,
    overallPace: paceState(totalSpent, totalLimit, elapsedFraction),
    atRisk,
    budgetCount: budgets.filter((b) => b.monthly_limit_cents > 0).length,
  }
}

/** Per-goal progress + pacing, off-track first then largest shortfall. */
export function rankGoals(
  goals: Goal[],
  contributionsByGoalId: Record<string, GoalContribution[]>,
  referenceDate: Date,
): GoalsSummary {
  const rows: (GoalRowSummary & { _shortfall: number })[] = goals.map((g) => {
    const contribs = contributionsByGoalId[g.id] ?? []
    const progress = goalProgress(g.target_cents, contribs)
    const pacing = goalPacing(g.target_cents, g.target_date, g.created_at, progress.saved_cents, referenceDate)
    return {
      goalId: g.id,
      name: g.name,
      savedCents: progress.saved_cents,
      targetCents: g.target_cents,
      fraction: progress.fraction,
      reached: progress.reached,
      dated: g.target_date != null,
      offTrack: pacing.off_track,
      suggestedMonthlyCents: pacing.suggested_monthly_cents,
      targetDate: g.target_date,
      _shortfall: pacing.shortfall_cents,
    }
  })
  rows.sort((a, b) => {
    if (a.offTrack !== b.offTrack) return a.offTrack ? -1 : 1
    return b._shortfall - a._shortfall
  })
  return {
    rows: rows.map(({ _shortfall, ...row }) => row),
    goalCount: goals.length,
  }
}

/** `non_monthly` budgets and how much is currently set aside (carried in). */
export function sinkingFunds(
  budgets: Budget[],
  transactions: Transaction[],
  referenceDate: Date,
): SinkingFund[] {
  return budgets
    .filter((b) => b.budget_type === 'non_monthly')
    .map((b) => ({
      budgetId: b.id,
      category: b.category,
      setAsideCents: budgetStatusForMonth(b, transactions, referenceDate).carriedInCents,
      baseLimitCents: b.monthly_limit_cents,
    }))
}

function groupContribs(contributions: GoalContribution[]): Record<string, GoalContribution[]> {
  const by: Record<string, GoalContribution[]> = {}
  for (const c of contributions) (by[c.goal_id] ??= []).push(c)
  return by
}

/** Assemble the whole hub view for the selected month. */
export function buildPlanSummary(input: PlanSummaryInput, now: Date): PlanSummary {
  const referenceDate = planReferenceDate(input.monthKey, now)
  const elapsed = monthElapsedFraction(input.monthKey, now)
  const by = groupContribs(input.goalContributions)
  return {
    monthKey: input.monthKey,
    referenceDate,
    health: planHealth(input, referenceDate),
    budgets: budgetSummary(input.budgets, input.transactions, referenceDate, elapsed),
    goals: rankGoals(input.goals, by, referenceDate),
    sinkingFunds: sinkingFunds(input.budgets, input.transactions, referenceDate),
  }
}
