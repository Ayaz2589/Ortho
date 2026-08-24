// Financial Health engine (spec 041). Pure, deterministic, side-effect-free;
// integer USD cents in, 0–100 scores out; the reference "today" is injected.
// Mirrors insights.ts / goals.ts / planSummary.ts (no React, no DB) so the future
// Purchase Advisor can import it directly. Pinned by unit + property tests
// (web/test/financial-health.test.ts), not a golden vector — the precedent for newer
// pure roll-ups (housing-summary.ts, spendHeatmap.ts). Contract:
// specs/041-financial-health/contracts/health-scoring.md.

import type {
  Budget,
  DimensionWeight,
  EmergencyFundLevel,
  FinancialProfile,
  FixedCost,
  Goal,
  GoalContribution,
  HealthBand,
  HealthDimension,
  Transaction,
} from '../types'
import type { RoutineWithState } from './routines'
import { roundHalfAwayFromZero } from './money'
import { parseTxDate } from '../format'
import { budgetStatusForMonth } from './budgets'
import { goalPacing } from './goals'
import { savingsRate } from '../reports/savings'
import { FINANCIAL_HEALTH_THRESHOLDS as T } from './financial-health-thresholds'

export interface DerivedFinancialProfile {
  /** Low estimate when income varies, else monthly income. Used for all ratios. */
  incomeForRatiosCents: number
  /** housing_cost · housing_share_fraction + Σ fixed costs. */
  committedCents: number
  /** incomeForRatiosCents − committedCents (may be negative). */
  netAvailableCents: number
  /** round(monthly_income · savings_target_fraction). */
  savingsTargetCents: number
  savingsTargetFraction: number
  emergencyFundLevel: EmergencyFundLevel
}

export interface DimensionScore {
  key: HealthDimension
  score: number
  weight: number
  /** spec 044 — set only for key === 'routine_awareness'; the routines contributing to its score,
   *  sorted by windowed spend descending. */
  contributingRoutineKeys?: string[]
}

export interface HealthAction {
  dimension: HealthDimension
  /** English tr() template key (see ACTION_TEMPLATES). */
  key: string
  args: Array<string | number>
}

export interface FinancialHealthInput {
  profile: DerivedFinancialProfile | null
  /** HOUSEHOLD-scoped ledger. Feeds the dimensions that are household facts by nature:
   *  plan_engagement (budgets/goals belong to the household) and routine_awareness. */
  transactions: Transaction[]
  /** spec 052 — the PROFILE OWNER's share of `transactions`, used by the spend-driven
   *  dimensions (cash_flow, savings_momentum). The profile is user-private (one adult's
   *  income, their share of housing, their fixed costs), so scoring it against the whole
   *  household's spend gave a ratio with mismatched numerator and denominator — two earners
   *  in a comfortable household were both told they were in deficit.
   *
   *  Omitted ⇒ falls back to `transactions`, which is exactly the spec 041/044 behavior and
   *  is identical by construction for a one-person household. */
  scopedTransactions?: Transaction[]
  budgets: Budget[]
  goals: Goal[]
  contributionsByGoal: Record<string, GoalContribution[]>
  /** spec 044 — recognized routines feeding the `routine_awareness` dimension. Optional; an
   *  omitted/empty array scores that dimension as neutral (see routineAwarenessScore). */
  routines?: RoutineWithState[]
  weights: Partial<Record<HealthDimension, number>>
  now: Date
}

export interface FinancialHealthResult {
  score: number
  band: HealthBand
  dimensions: DimensionScore[]
  topAction: HealthAction
  hasProfile: boolean
}

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x)
/** Dimension scores are whole numbers in [0,100] (rounded to kill lerp FP wobble). */
const clampScore = (x: number): number => Math.round(clamp(x, 0, 100))

/** Linear map of `x∈[x0,x1]` onto `[y0,y1]`, clamped to that output range. */
function lerp(x: number, x0: number, x1: number, y0: number, y1: number): number {
  if (x1 === x0) return y0
  const t = clamp((x - x0) / (x1 - x0), 0, 1)
  return y0 + t * (y1 - y0)
}

/** Action copy (English keys; positional {0} args resolved via tr() in the UI). */
export const ACTION_TEMPLATES: Record<HealthDimension, { key: string; args: Array<string | number> }> = {
  cash_flow: {
    key: 'Your spending is close to your income — trimming one recurring cost frees up room.',
    args: [],
  },
  safety_net: {
    // No embedded currency: a display-currency amount can't be formatted from a
    // pure engine (Constitution IV — money must read as money, converted).
    key: 'Start a small emergency fund — a little each week builds a cushion.',
    args: [],
  },
  commitment_load: {
    key: 'A lot of your income is committed — see if one fixed cost can be reduced or shared.',
    args: [],
  },
  savings_momentum: {
    key: 'Set aside a little each month — even a {0}% goal is a solid start.',
    args: [5],
  },
  plan_engagement: {
    key: 'Set a budget for one category — it makes the rest easier to see.',
    args: [],
  },
  routine_awareness: {
    key: 'A few more recognized routines would make your spending easier to predict — review what’s been detected.',
    args: [],
  },
}

/** Derive the query-time profile from the stored raw answers (never persisted). */
export function deriveProfile(
  profile: FinancialProfile | null,
  fixedCosts: readonly FixedCost[]
): DerivedFinancialProfile | null {
  if (!profile) return null
  const incomeForRatios = profile.income_is_variable
    ? (profile.income_low_estimate_cents ?? profile.monthly_income_cents)
    : profile.monthly_income_cents
  const housing = roundHalfAwayFromZero(
    (profile.housing_cost_cents ?? 0) * profile.housing_share_fraction
  )
  const fixedTotal = fixedCosts.reduce((s, c) => s + c.amount_cents, 0)
  const committed = housing + fixedTotal
  return {
    incomeForRatiosCents: incomeForRatios,
    committedCents: committed,
    netAvailableCents: incomeForRatios - committed,
    savingsTargetCents: roundHalfAwayFromZero(
      profile.monthly_income_cents * profile.savings_target_fraction
    ),
    savingsTargetFraction: profile.savings_target_fraction,
    emergencyFundLevel: profile.emergency_fund_level,
  }
}

/** Sum of `expense` cents in the LOCAL-calendar month of `now` (budgets.ts regime). */
export function monthSpendCents(transactions: readonly Transaction[], now: Date): number {
  const y = now.getFullYear()
  const m = now.getMonth()
  let total = 0
  for (const tx of transactions) {
    if (tx.kind !== 'expense') continue
    const d = parseTxDate(tx.date)
    if (d.getFullYear() === y && d.getMonth() === m) total += tx.amount_cents
  }
  return total
}

function intentionBase(f: number): number {
  const knots = T.SAVINGS_INTENT_KNOTS
  if (f <= knots[0].f) return knots[0].score
  const last = knots[knots.length - 1]
  if (f >= last.f) return last.score
  for (let i = 1; i < knots.length; i++) {
    if (f <= knots[i].f) {
      return lerp(f, knots[i - 1].f, knots[i].f, knots[i - 1].score, knots[i].score)
    }
  }
  return last.score
}

/** Whether a goal is funded and on pace (undated funded goals count as on pace). */
function goalOnPaceFunded(
  goal: Goal,
  contributionsByGoal: Record<string, GoalContribution[]>,
  now: Date
): boolean {
  const contribs = contributionsByGoal[goal.id] ?? []
  const saved = contribs.reduce((s, c) => s + c.amount_cents, 0)
  if (saved <= 0) return false
  return !goalPacing(goal.target_cents, goal.target_date, goal.created_at, saved, now).off_track
}

// --- Dimension scorers (each → 0..100). Profile-null neutral handled in scoreFinancialHealth. ---

function cashFlowScore(p: DerivedFinancialProfile, monthSpend: number): number {
  // Spend is at least the committed fixed costs (rent is paid whether or not it's
  // logged yet), plus any variable spend already logged this month — `max`, not
  // sum, so logging a fixed cost never double-counts it. This also stops the
  // score reading an artificial 100 early in a new month before spend accrues.
  const spend = Math.max(monthSpend, p.committedCents)
  const income = p.incomeForRatiosCents
  const ratio = income > 0 ? (income - spend) / income : 0
  return clampScore(lerp(ratio, 0, T.CASHFLOW_FULL_RATIO, T.CASHFLOW_FLOOR, 100))
}

function safetyNetScore(
  p: DerivedFinancialProfile,
  goals: readonly Goal[],
  contributionsByGoal: Record<string, GoalContribution[]>,
  now: Date
): number {
  const base = T.EMERGENCY_BASE[p.emergencyFundLevel] ?? T.NEUTRAL
  const bonus = goals.some((g) => goalOnPaceFunded(g, contributionsByGoal, now)) ? T.SAFETY_GOAL_BONUS : 0
  return clampScore(base + bonus)
}

function commitmentLoadScore(p: DerivedFinancialProfile): number {
  const income = p.incomeForRatiosCents
  const committedFraction = income > 0 ? p.committedCents / income : 1
  return clampScore(lerp(committedFraction, T.COMMIT_LOW, T.COMMIT_HIGH, 100, T.COMMIT_FLOOR))
}

function savingsMomentumScore(
  p: DerivedFinancialProfile,
  monthSpend: number,
  hasHistory: boolean
): number {
  const base = intentionBase(p.savingsTargetFraction)
  const income = p.incomeForRatiosCents
  if (!hasHistory || income <= 0) return clampScore(base)
  const rate = savingsRate(income, Math.max(monthSpend, p.committedCents))
  if (rate == null) return clampScore(base)
  const fEff = Math.max(p.savingsTargetFraction, T.SAVINGS_ACTUAL_MIN_TARGET)
  const actual = lerp(rate, 0, fEff, T.SAVINGS_ACTUAL_FLOOR, 100)
  return clampScore(Math.max(base, actual))
}

function planEngagementScore(
  budgets: readonly Budget[],
  goals: readonly Goal[],
  transactions: readonly Transaction[],
  contributionsByGoal: Record<string, GoalContribution[]>,
  now: Date
): number {
  const active = budgets.filter((b) => b.monthly_limit_cents > 0)
  let s = T.PLAN_BASE
  if (active.length > 0) {
    s += T.PLAN_HAS_BUDGET
    const allOnTrack = active.every(
      (b) => budgetStatusForMonth(b, transactions as Transaction[], now).remainingCents >= 0
    )
    if (allOnTrack) s += T.PLAN_BUDGETS_ONTRACK
  }
  if (goals.length > 0) {
    s += T.PLAN_HAS_GOAL
    const allOnTrack = goals.every((g) => {
      const saved = (contributionsByGoal[g.id] ?? []).reduce((a, c) => a + c.amount_cents, 0)
      return !goalPacing(g.target_cents, g.target_date, g.created_at, saved, now).off_track
    })
    if (allOnTrack) s += T.PLAN_GOALS_ONTRACK
  }
  return clampScore(s)
}

/** Sum of `expense` cents in the trailing `months` from `now` (half-open-ish: inclusive both ends,
 *  matching monthSpendCents's calendar-month sibling). Used only by routineAwarenessScore. */
function windowExpenseCents(transactions: readonly Transaction[], now: Date, months: number): number {
  const start = new Date(now)
  start.setMonth(start.getMonth() - months)
  let total = 0
  for (const t of transactions) {
    if (t.kind !== 'expense') continue
    const d = parseTxDate(t.date)
    if (d >= start && d <= now) total += t.amount_cents
  }
  return total
}

/** Contract: specs/044-financial-routines/contracts/routine-awareness-dimension.md. Coverage =
 *  confirmed/recognized routines' windowed spend ÷ total windowed expense spend. Never uses
 *  `profile` (like plan_engagement) — scores from real transaction/routine data always. */
function routineAwarenessScore(
  routines: readonly RoutineWithState[],
  transactions: readonly Transaction[],
  now: Date
): {
  score: number
  contributingRoutineKeys: string[]
  /** False while there's no real routine signal yet. When false, the composite/topAction
   *  computation excludes this dimension entirely — a household with zero routines gets the exact
   *  same overall score/band as spec 041 (FR-010), not a diluted one from averaging in a neutral
   *  placeholder. The dimension still appears in `dimensions` for display (calm "not enough
   *  history yet" state) — only its effect on the composite is gated. */
  hasData: boolean
} {
  const active = routines.filter((r) => r.status === 'confirmed' || r.status === 'recognized')
  if (active.length === 0) return { score: T.NEUTRAL, contributingRoutineKeys: [], hasData: false }

  const windowSpend = windowExpenseCents(transactions, now, T.ROUTINE_AWARENESS_WINDOW_MONTHS)
  if (windowSpend <= 0) return { score: T.NEUTRAL, contributingRoutineKeys: [], hasData: false }

  // occurrenceCount is already windowed by the detection engine's own window (recurringWindowMonths
  // / behavioralWindowWeeks), which defaults to the same span as ROUTINE_AWARENESS_WINDOW_MONTHS —
  // reusing it directly avoids re-deriving a cadence-implied count here.
  const contributions = active
    .map((r) => ({ key: r.routineKey, spend: r.typicalAmountCents * r.occurrenceCount }))
    .sort((a, b) => b.spend - a.spend)
  const routineSpend = contributions.reduce((s, c) => s + c.spend, 0)
  const coverage = clamp(routineSpend / windowSpend, 0, 1)
  const score = clampScore(
    lerp(coverage, T.ROUTINE_AWARENESS_LOW, T.ROUTINE_AWARENESS_HIGH, T.ROUTINE_AWARENESS_FLOOR, 100)
  )
  return { score, contributingRoutineKeys: contributions.map((c) => c.key), hasData: true }
}

/** Composite score → calm band. Monotonic; boundaries at 40/60/80. */
export function bandForScore(score: number): HealthBand {
  if (score >= T.BAND.strong) return 'strong'
  if (score >= T.BAND.steady) return 'steady'
  if (score >= T.BAND.building) return 'building'
  return 'getting_started'
}

/** DimensionWeight[] → a plain record the engine consumes (missing → default). */
export function weightsToRecord(
  weights: readonly DimensionWeight[]
): Partial<Record<HealthDimension, number>> {
  const out: Partial<Record<HealthDimension, number>> = {}
  for (const w of weights) out[w.dimension] = w.weight
  return out
}

/** Compute the composite Financial Health result. Pure; `now` injected. */
export function scoreFinancialHealth(input: FinancialHealthInput): FinancialHealthResult {
  const { profile, transactions, budgets, goals, contributionsByGoal, routines, weights, now } = input
  const hasProfile = profile != null

  // spec 052 — the spend figure the PRIVATE profile is compared against must be the profile
  // owner's own share, not the household total. Defaults to the household ledger so every
  // pre-052 caller (and a one-person household) is unchanged.
  const ownScoped = input.scopedTransactions ?? transactions

  // Computed once and shared by cash-flow + savings (both scan expenses this month).
  const monthSpend = monthSpendCents(ownScoped, now)
  const hasHistory = ownScoped.some((t) => t.kind === 'expense')
  const routineAwareness = routineAwarenessScore(routines ?? [], transactions, now)

  const rawScores: Record<HealthDimension, number> = {
    cash_flow: profile ? cashFlowScore(profile, monthSpend) : T.NEUTRAL,
    safety_net: profile ? safetyNetScore(profile, goals, contributionsByGoal, now) : T.NEUTRAL,
    commitment_load: profile ? commitmentLoadScore(profile) : T.NEUTRAL,
    savings_momentum: profile ? savingsMomentumScore(profile, monthSpend, hasHistory) : T.NEUTRAL,
    // Plan engagement never needs the profile — it scores from real data always.
    plan_engagement: planEngagementScore(budgets, goals, transactions, contributionsByGoal, now),
    // Routine awareness never needs the profile either — see routineAwarenessScore.
    routine_awareness: routineAwareness.score,
  }

  const dimensions: DimensionScore[] = T.DIMENSION_ORDER.map((key) => ({
    key,
    score: rawScores[key],
    weight: clamp(weights[key] ?? T.DEFAULT_WEIGHT, 1, 5),
    ...(key === 'routine_awareness'
      ? { contributingRoutineKeys: routineAwareness.contributingRoutineKeys }
      : {}),
  }))

  // FR-010: routine_awareness only counts toward the composite/topAction once it has real signal
  // (routineAwareness.hasData) — otherwise a household with zero routines would get a DIFFERENT
  // overall score than spec 041 produced, just from averaging in a neutral placeholder. The
  // dimension still renders in `dimensions` (calm "not enough history yet" state) either way.
  const scored = dimensions.filter((d) => d.key !== 'routine_awareness' || routineAwareness.hasData)

  const weightSum = scored.reduce((s, d) => s + d.weight, 0)
  const weighted = scored.reduce((s, d) => s + d.score * d.weight, 0)
  const score = clampScore(Math.round(weightSum > 0 ? weighted / weightSum : T.NEUTRAL))

  // Top action: lowest weighted contribution among scored dimensions, tie-broken by fixed order.
  let lowest = scored[0]
  for (const d of scored) {
    if (d.score * d.weight < lowest.score * lowest.weight) lowest = d
  }
  const template = ACTION_TEMPLATES[lowest.key]
  const topAction: HealthAction = { dimension: lowest.key, key: template.key, args: template.args }

  return { score, band: bandForScore(score), dimensions, topAction, hasProfile }
}
