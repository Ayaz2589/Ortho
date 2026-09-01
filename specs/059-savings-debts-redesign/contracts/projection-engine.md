# Contract: `lib/finance/goalProjection.ts`

**Feature**: `specs/059-savings-debts-redesign`

The pure engine every surface in this feature reads. New module; `lib/finance/goals.ts` is untouched
(research R1), so `shared/test-vectors/goals.json` stays byte-identical.

## Exported surface

```ts
export interface GoalCadence { amountCents: number; dayOfMonth: number; firstMonthKey: string; contributionCount: number }
export type PaceStatus = 'on_plan' | 'under' | 'over' | 'missed'
export interface GoalPaceMonth { monthKey: string; cents: number; status: PaceStatus }
export type ProjectionBasis = 'cadence' | 'recent_average'
export type UnavailableReason = 'insufficient_history' | 'no_pace' | 'reached'
export interface GoalProjection { /* see data-model.md */ }
export interface WhatIfScenario { kind: 'current' | 'planned' | 'increase' | 'skip'; monthlyCents: number; finishDate: Date; deltaMonths: number }
export interface SavingsDebtsSummary { /* see data-model.md */ }

export function goalCadence(contributions: readonly GoalContribution[]): GoalCadence | null
export function goalPaceMonths(contributions: readonly GoalContribution[], cadence: GoalCadence | null, now: Date): GoalPaceMonth[]
export function goalProjection(goal: Goal, contributions: readonly GoalContribution[], now: Date): GoalProjection
export function whatIfScenarios(projection: GoalProjection, remainingCents: number, now: Date): WhatIfScenario[]
export function savingsDebtsSummary(goals: readonly Goal[], byGoal: Record<string, GoalContribution[]>, now: Date): SavingsDebtsSummary
export const GOAL_PROJECTION_THRESHOLDS: { onPlanTolerance: number; minContributionsToProject: number; recentAverageWindow: number; increaseSteps: readonly number[] }
```

## Behavioural contract

### C1 — Purity
No `Date.now()`, no `new Date()` without an argument, no I/O, no mutation of any input. Every function
returns a fresh value. Same inputs ⇒ same outputs, forever.

### C2 — Integer cents in, integer cents out
Every `*Cents` field is an integer. Division rounds explicitly at the point it happens; no float leaks
into a returned cents field.

### C3 — Local-calendar dates only
Month and day arithmetic uses local getters (`getFullYear`/`getMonth`/`getDate`), matching the
`dayIndex` rule already in `goals.ts` and `goalSeries.ts`. A projected finish month must not shift
when the process timezone moves. Pinned by a `.tz.test.ts` suite run under `TZ=America/New_York`.

### C4 — The refusal is part of the return value
`goalProjection` never throws and never guesses. When it cannot honestly project it returns
`{ available: false, unavailableReason, basis: null, pacePerMonthCents: null, paymentsToGo: null,
finishDate: null, … }`. **Callers must not compute a date of their own when `available` is false** —
this is the single enforcement point for SC-008.

### C5 — `null` cadence is legal
`goalCadence` returns `null` for zero contributions. Every downstream function accepts `null` and
degrades: `goalPaceMonths` returns `[]`, `goalProjection` returns unavailable, `savingsDebtsSummary`
omits the item from `monthlyCommitmentCents` while still counting its target.

### C6 — Consistency with the vectored engine
For every input, `goalProjection(...).paymentsToGo`, when multiplied by `pacePerMonthCents`, is
≥ `goalProgress(goal.target_cents, contributions).remaining_cents`. The two engines may use different
models but must never contradict each other on whether money is still owed. Property-pinned.

### C7 — Determinism across surfaces
`goalProjection(g, c, now)` called from the Planning card, the detail page, the widget body, and the
detail panel with the same `now` returns deeply-equal values. This is SC-006, and it holds by
construction because all four call this function rather than deriving locally.

## Threshold values

| Field | Value | Why |
|---|---|---|
| `onPlanTolerance` | `0.02` | Stated by the handoff. Floored at 1 cent so a small cadence isn't off-plan by rounding |
| `minContributionsToProject` | `3` | The handoff's projection floor — never extrapolate from one payment |
| `recentAverageWindow` | `3` | "mean of the last 3 contributions" |
| `increaseSteps` | `[0.25, 0.67]` | The what-if table's +25% / +67%, rounded to a clean figure |

## Test obligations (red first, per Constitution VI)

1. **Cadence**: modal selection; tie → larger amount; tie → earlier day; `null` at zero contributions.
2. **Pace months**: contiguous with gaps filled; `missed` for a zero month; `over` for a month above
   tolerance; `on_plan` inside ±2%; boundary exactly at 2%.
3. **Projection guards**: 0, 1, 2 contributions ⇒ `insufficient_history`; zero pace ⇒ `no_pace`;
   reached target ⇒ `reached`. In every case, every date field is `null`.
4. **Basis switch**: all-on-plan ⇒ `basis: 'cadence'`; any off-plan ⇒ `basis: 'recent_average'`.
5. **Rounding**: `remaining / pace = 22.17` ⇒ `paymentsToGo === 23`.
6. **What-if**: on-plan produces current/+25%/+67%/skip; off-plan produces current/planned/increase
   with `planned` carrying a negative `deltaMonths`; a `skip` row's `deltaMonths` is exactly `+1`.
7. **Summary**: sums; one projectable item ⇒ `nextToFinish === lastToFinish`; none ⇒ both `null`.
8. **Property (C6)**: over generated contribution sets, the projection never claims completion while
   `remaining_cents > 0`.
9. **Timezone (C3)**: the full suite re-run under `TZ=America/New_York` yields identical month keys and
   finish months.
