import type { Goal, GoalContribution } from '../types'
import { goalProgress } from './goals'
import { GOAL_PROJECTION_THRESHOLDS as T } from './goalProjection-thresholds'

/**
 * The Savings & Debts projection engine (spec 059). Answers the one question a
 * savings target or a debt actually has — *when is this done?* — from the
 * contributions alone. Pure, deterministic, integer USD cents in and out, with
 * the reference "today" injected (Constitution VI).
 *
 * DELIBERATELY SEPARATE from `goals.ts`, which is pinned by
 * `shared/test-vectors/goals.json` and models a different thing: pace against a
 * *target date* the member set. This module models pace against the *cadence*
 * the member has actually been paying. Both ship; do not merge them (spec 059
 * research R1). Money arithmetic still comes from `goalProgress` here, so the
 * two can never disagree about how much is left.
 *
 * Nothing here is persisted — derived on read, like `insights.ts`,
 * `personSummary.ts` and `spendingPace.ts`.
 *
 * All date handling is LOCAL-CALENDAR: month keys and days-of-month are read
 * straight off the stored `YYYY-MM-DD` string, and `now` is read with local
 * getters. A projected finish month must not shift when the process timezone
 * does — pinned by `test/finance/goalProjection-timezone.tz.test.ts`.
 */

export interface GoalCadence {
  /** The modal contribution amount — what gets printed as "$600/mo". */
  amountCents: number
  /** The modal day-of-month, 1–31. */
  dayOfMonth: number
  /** `YYYY-MM` of the earliest contribution — the "since Feb 2026". */
  firstMonthKey: string
  contributionCount: number
}

export type PaceStatus = 'on_plan' | 'under' | 'over' | 'missed'

export interface GoalPaceMonth {
  /** `YYYY-MM`. */
  monthKey: string
  /** That month's contribution total; 0 for a missed month. */
  cents: number
  status: PaceStatus
}

export type ProjectionBasis = 'cadence' | 'recent_average'
export type UnavailableReason = 'insufficient_history' | 'no_pace' | 'reached'

export interface GoalProjection {
  /** False ⇒ every date-shaped field below is null and NOTHING may be rendered.
   *  Callers must not compute a fallback of their own (contract C4). */
  available: boolean
  unavailableReason: UnavailableReason | null
  /** Which pace was used — stated aloud on the detail page, never implied. */
  basis: ProjectionBasis | null
  pacePerMonthCents: number | null
  /** A partial final payment counts as a whole one. */
  paymentsToGo: number | null
  finishDate: Date | null
  onPlanCount: number
  monthCount: number
  missedMonthKeys: string[]
  /** Consecutive non-missed months ending at the most recent counted month. */
  streakMonths: number
  months: GoalPaceMonth[]
  cadence: GoalCadence | null
}

export interface WhatIfScenario {
  kind: 'current' | 'planned' | 'increase' | 'skip'
  monthlyCents: number
  finishDate: Date
  /** Negative = sooner, positive = later, 0 = on plan. */
  deltaMonths: number
}

export interface SavingsDebtsFinisher {
  goalId: string
  name: string
  finishDate: Date
}

export interface SavingsDebtsSummary {
  /** Σ cadence amount over items that have one. */
  monthlyCommitmentCents: number
  contributedCents: number
  targetCents: number
  /** Items not yet reached. */
  activeCount: number
  nextToFinish: SavingsDebtsFinisher | null
  lastToFinish: SavingsDebtsFinisher | null
}

// ── date helpers (local calendar only) ────────────────────────────────────────

/** `YYYY-MM` of a stored `YYYY-MM-DD`. Read off the string so no timezone is
 *  ever involved — the same reasoning as `goalSeries.ts`. */
function monthKeyOf(date: string): string {
  return date.slice(0, 7)
}

/** Day-of-month of a stored `YYYY-MM-DD`, read off the string. */
function dayOfMonthOf(date: string): number {
  return Number(date.slice(8, 10))
}

/** `YYYY-MM` of a Date, using LOCAL getters. */
function monthKeyOfDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** One month later, as `YYYY-MM`. */
function nextMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

/** Whole months from `a` to `b`, both `YYYY-MM`. Negative when `b` precedes `a`. */
function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return (by - ay) * 12 + (bm - am)
}

/** Days in a local calendar month (1-indexed month). */
function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate()
}

/** A local Date on `day` of the given month, clamped to the month's length so a
 *  cadence day of 31 lands on the 30th in a 30-day month rather than spilling
 *  into the next one. */
function dateOnDay(year: number, month1: number, day: number): Date {
  return new Date(year, month1 - 1, Math.min(day, daysInMonth(year, month1)))
}

/** The next occurrence of `day` strictly after `now`. */
function nextCadenceDate(now: Date, day: number): Date {
  const thisMonth = dateOnDay(now.getFullYear(), now.getMonth() + 1, day)
  if (thisMonth.getTime() > now.getTime()) return thisMonth
  const y = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear()
  const m1 = now.getMonth() === 11 ? 1 : now.getMonth() + 2
  return dateOnDay(y, m1, day)
}

function addMonths(d: Date, months: number, day: number): Date {
  const total = d.getMonth() + months
  const y = d.getFullYear() + Math.floor(total / 12)
  const m1 = ((total % 12) + 12) % 12 + 1
  return dateOnDay(y, m1, day)
}

// ── cadence ───────────────────────────────────────────────────────────────────

/**
 * The observed rhythm of past contributions: the modal amount and day.
 *
 * Modal, not mean: one catch-up payment must not drag the figure away from the
 * amount actually paid every month, because that figure is printed on the card.
 * Amount ties break toward the LARGER amount and day ties toward the EARLIER day
 * — both the conservative direction, so a tie can never make a debt look like it
 * clears sooner than it will (research R2).
 *
 * Returns null with no contributions; every function below accepts that.
 */
export function goalCadence(contributions: readonly GoalContribution[]): GoalCadence | null {
  if (contributions.length === 0) return null

  const amountCounts = new Map<number, number>()
  const dayCounts = new Map<number, number>()
  let firstMonthKey = monthKeyOf(contributions[0].date)

  for (const c of contributions) {
    amountCounts.set(c.amount_cents, (amountCounts.get(c.amount_cents) ?? 0) + 1)
    const day = dayOfMonthOf(c.date)
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1)
    const key = monthKeyOf(c.date)
    if (key < firstMonthKey) firstMonthKey = key
  }

  let amountCents = 0
  let bestAmountCount = -1
  for (const [amount, count] of amountCounts) {
    if (count > bestAmountCount || (count === bestAmountCount && amount > amountCents)) {
      amountCents = amount
      bestAmountCount = count
    }
  }

  let dayOfMonth = 31
  let bestDayCount = -1
  for (const [day, count] of dayCounts) {
    if (count > bestDayCount || (count === bestDayCount && day < dayOfMonth)) {
      dayOfMonth = day
      bestDayCount = count
    }
  }

  return { amountCents, dayOfMonth, firstMonthKey, contributionCount: contributions.length }
}

// ── pace months ───────────────────────────────────────────────────────────────

/**
 * One entry per calendar month from the first contribution through the last month
 * that has come due, contiguous with gaps filled at zero — so a quiet stretch
 * reads as a gap rather than making two distant months look adjacent.
 *
 * The current month is only counted once its cadence day has passed. Calling the
 * current month "missed" on the 3rd, when payment is due on the 15th, would be
 * both wrong and alarming (Constitution II).
 */
export function goalPaceMonths(
  contributions: readonly GoalContribution[],
  cadence: GoalCadence | null,
  now: Date
): GoalPaceMonth[] {
  if (!cadence || contributions.length === 0) return []

  const byMonth = new Map<string, number>()
  let lastContributedKey = cadence.firstMonthKey
  for (const c of contributions) {
    const key = monthKeyOf(c.date)
    byMonth.set(key, (byMonth.get(key) ?? 0) + c.amount_cents)
    if (key > lastContributedKey) lastContributedKey = key
  }

  const nowKey = monthKeyOfDate(now)
  const dueThisMonth = now.getDate() >= Math.min(cadence.dayOfMonth, daysInMonth(now.getFullYear(), now.getMonth() + 1))
  // Never end before a month that actually received money — a contribution dated
  // ahead of `now` is still real and must not fall off the end.
  let endKey = dueThisMonth ? nowKey : monthsBetween(cadence.firstMonthKey, nowKey) > 0 ? previousMonthKey(nowKey) : nowKey
  if (endKey < lastContributedKey) endKey = lastContributedKey

  const tolerance = Math.max(1, Math.round(cadence.amountCents * T.onPlanTolerance))

  const out: GoalPaceMonth[] = []
  for (let key = cadence.firstMonthKey; ; key = nextMonthKey(key)) {
    const cents = byMonth.get(key) ?? 0
    let status: PaceStatus
    if (cents === 0) status = 'missed'
    else if (Math.abs(cents - cadence.amountCents) <= tolerance) status = 'on_plan'
    else if (cents > cadence.amountCents) status = 'over'
    else status = 'under'
    out.push({ monthKey: key, cents, status })
    if (key === endKey || monthsBetween(key, endKey) <= 0) break
  }
  return out
}

function previousMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

// ── projection ────────────────────────────────────────────────────────────────

/** A month counts toward "on plan" when it met the cadence OR exceeded it —
 *  paying more than planned is not a deviation to be explained. */
function isOnPlan(status: PaceStatus): boolean {
  return status === 'on_plan' || status === 'over'
}

function unavailable(
  reason: UnavailableReason,
  months: GoalPaceMonth[],
  cadence: GoalCadence | null
): GoalProjection {
  return {
    available: false,
    unavailableReason: reason,
    basis: null,
    pacePerMonthCents: null,
    paymentsToGo: null,
    finishDate: null,
    onPlanCount: months.filter((m) => isOnPlan(m.status)).length,
    monthCount: months.length,
    missedMonthKeys: months.filter((m) => m.status === 'missed').map((m) => m.monthKey),
    streakMonths: streakOf(months),
    months,
    cadence,
  }
}

function streakOf(months: GoalPaceMonth[]): number {
  let streak = 0
  for (let i = months.length - 1; i >= 0; i--) {
    if (months[i].status === 'missed') break
    streak++
  }
  return streak
}

/**
 * The whole answer to "when is this done?", or an explicit refusal to answer.
 *
 * The refusal is part of the RETURN VALUE rather than a rule each surface
 * remembers: four surfaces read this engine, and one of them forgetting the
 * three-contribution floor would put an invented date on screen. `available:
 * false` is the single enforcement point for that (spec SC-008, contract C4).
 */
export function goalProjection(
  goal: Pick<Goal, 'target_cents'>,
  contributions: readonly GoalContribution[],
  now: Date
): GoalProjection {
  const cadence = goalCadence(contributions)
  const months = goalPaceMonths(contributions, cadence, now)
  const progress = goalProgress(goal.target_cents, contributions)

  // Reached first: a finished goal should read as finished, not as "not enough
  // history", even if it got there in one payment.
  if (progress.reached) return unavailable('reached', months, cadence)
  if (!cadence || cadence.contributionCount < T.minContributionsToProject) {
    return unavailable('insufficient_history', months, cadence)
  }

  const allOnPlan = months.every((m) => isOnPlan(m.status))
  const basis: ProjectionBasis = allOnPlan ? 'cadence' : 'recent_average'
  const pace = allOnPlan ? cadence.amountCents : recentAverageCents(contributions)

  if (pace <= 0) return unavailable('no_pace', months, cadence)

  const paymentsToGo = Math.ceil(progress.remaining_cents / pace)
  const start = nextCadenceDate(now, cadence.dayOfMonth)
  const finishDate = addMonths(start, paymentsToGo - 1, cadence.dayOfMonth)

  return {
    available: true,
    unavailableReason: null,
    basis,
    pacePerMonthCents: pace,
    paymentsToGo,
    finishDate,
    onPlanCount: months.filter((m) => isOnPlan(m.status)).length,
    monthCount: months.length,
    missedMonthKeys: months.filter((m) => m.status === 'missed').map((m) => m.monthKey),
    streakMonths: streakOf(months),
    months,
    cadence,
  }
}

/** Mean of the most recent N contributions by date (then by recording order). */
function recentAverageCents(contributions: readonly GoalContribution[]): number {
  const sorted = [...contributions].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0
  })
  const window = sorted.slice(0, T.recentAverageWindow)
  if (window.length === 0) return 0
  return Math.round(window.reduce((s, c) => s + c.amount_cents, 0) / window.length)
}

// ── what-if ───────────────────────────────────────────────────────────────────

/** Round to a figure that reads as a real lever ($750, $1,000 — never $1,002),
 *  but never at or below the pace it is meant to improve on. */
function cleanAmount(cents: number, floorCents: number): number {
  const rounded = Math.round(cents / T.cleanAmountStepCents) * T.cleanAmountStepCents
  return rounded > floorCents ? rounded : Math.ceil(cents)
}

function finishAt(monthlyCents: number, remainingCents: number, now: Date, day: number): { date: Date; payments: number } {
  const payments = Math.max(1, Math.ceil(remainingCents / monthlyCents))
  return { date: addMonths(nextCadenceDate(now, day), payments - 1, day), payments }
}

/**
 * The detail page's what-if rows — derived, never configured (FR-020).
 *
 * On plan: keep the current amount, two higher ones, and skip a month. Off plan:
 * the recent average is the baseline, and the amount the member PLANNED becomes
 * an improvement row rather than the thing they are failing (FR-021). That
 * inversion is the point — the table offers levers and endorses none of them.
 */
export function whatIfScenarios(
  projection: GoalProjection,
  remainingCents: number,
  now: Date
): WhatIfScenario[] {
  if (!projection.available || !projection.cadence || projection.pacePerMonthCents === null) return []

  const day = projection.cadence.dayOfMonth
  const pace = projection.pacePerMonthCents
  const base = finishAt(pace, remainingCents, now, day)

  const row = (kind: WhatIfScenario['kind'], monthlyCents: number): WhatIfScenario => {
    const at = finishAt(monthlyCents, remainingCents, now, day)
    return { kind, monthlyCents, finishDate: at.date, deltaMonths: at.payments - base.payments }
  }

  const rows: WhatIfScenario[] = [
    { kind: 'current', monthlyCents: pace, finishDate: base.date, deltaMonths: 0 },
  ]

  if (projection.basis === 'recent_average' && projection.cadence.amountCents > pace) {
    rows.push(row('planned', projection.cadence.amountCents))
    rows.push(row('increase', cleanAmount(pace * (1 + T.increaseSteps[1]), projection.cadence.amountCents)))
    return rows
  }

  for (const step of T.increaseSteps) {
    rows.push(row('increase', cleanAmount(pace * (1 + step), pace)))
  }
  rows.push({
    kind: 'skip',
    monthlyCents: pace,
    finishDate: addMonths(base.date, 1, day),
    deltaMonths: 1,
  })
  return rows
}

// ── aggregate ─────────────────────────────────────────────────────────────────

/**
 * The section header's one sentence, across every item — the thing no individual
 * card can show. Items without a cadence still count toward the totals; they
 * simply add nothing to the monthly commitment, because there is nothing honest
 * to add.
 */
export function savingsDebtsSummary(
  goals: readonly Goal[],
  contributionsByGoalId: Record<string, GoalContribution[]>,
  now: Date
): SavingsDebtsSummary {
  let monthlyCommitmentCents = 0
  let contributedCents = 0
  let targetCents = 0
  let activeCount = 0
  let nextToFinish: SavingsDebtsFinisher | null = null
  let lastToFinish: SavingsDebtsFinisher | null = null

  for (const goal of goals) {
    const contributions = contributionsByGoalId[goal.id] ?? []
    const progress = goalProgress(goal.target_cents, contributions)
    contributedCents += progress.saved_cents
    targetCents += goal.target_cents
    if (!progress.reached) activeCount++

    const cadence = goalCadence(contributions)
    if (cadence) monthlyCommitmentCents += cadence.amountCents

    const projection = goalProjection(goal, contributions, now)
    if (!projection.available || !projection.finishDate) continue
    const finisher: SavingsDebtsFinisher = { goalId: goal.id, name: goal.name, finishDate: projection.finishDate }
    if (!nextToFinish || finisher.finishDate < nextToFinish.finishDate) nextToFinish = finisher
    if (!lastToFinish || finisher.finishDate > lastToFinish.finishDate) lastToFinish = finisher
  }

  return { monthlyCommitmentCents, contributedCents, targetCents, activeCount, nextToFinish, lastToFinish }
}
