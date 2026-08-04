# Contract: `lib/planning/planSummary.ts`

Pure, deterministic, integer-USD-cents. Reference date always injected. This is the regression-
locked surface for the Planning Hub (constitution VI). Backed by `test/planning/planSummary.test.ts`.

## Constants — `lib/planning/thresholds.ts`

```ts
export const PLANNING = {
  /** Categories shown in the at-risk budget list. */
  topN: 4,
  /** spent/limit ≥ elapsedFraction × ratio ⇒ "attention" (ahead of pace). */
  attentionRatio: 1.0,
} as const
```

## Month helpers

### `currentMonthKey(now: Date): string`
Local-calendar `'YYYY-MM'` for `now`.

### `stepMonthKey(monthKey: string, dir: 'prev' | 'next'): string`
Adjacent month key; wraps year boundaries. Future keys are allowed (planning ahead).

### `planReferenceDate(monthKey: string, now: Date): Date`
- `monthKey === currentMonthKey(now)` → `now`
- `monthKey < current` → last instant of that month (`new Date(y, m, 0, 23, 59, 59, 999)`)
- `monthKey > current` → first instant of that month (`new Date(y, m-1, 1, 0, 0, 0, 0)`)

### `monthElapsedFraction(monthKey: string, now: Date): number`
- current month → `dayOfMonth / daysInMonth` (in (0, 1])
- past month → `1`
- future month → `0`

## Pace

### `paceState(spentCents, effectiveLimitCents, elapsedFraction): PaceState`
- `effectiveLimitCents <= 0` → `'under'`
- `spentCents >= effectiveLimitCents` → `'over'`
- `elapsedFraction <= 0` → `spentCents > 0 ? 'attention' : 'under'`
- `spent/limit >= elapsedFraction * attentionRatio` → `'attention'`
- else → `'under'`

## Aggregates

### `incomeForMonth(transactions, monthKey): number`
Σ `amount_cents` of `kind === 'income'` transactions whose `date` falls in the month's
`monthBounds` window (UTC half-open, as `NetSummaryHero` buckets).

### `plannedGoalContributions(goals, contributionsByGoalId, referenceDate): number`
Σ `goalPacing(g.target_cents, g.target_date, g.created_at, saved, referenceDate).suggested_monthly_cents`
over goals; undated/reached contribute 0.

### `unbudgetedSpendForMonth(budgets, transactions, monthKey): number`
(Spec 040.) Σ `amount_cents` of `kind === 'expense'` transactions in the month's `monthBounds` window
(UTC half-open, as `incomeForMonth`) whose `category` is NOT one of the household's budgeted
categories — i.e. no budget with `monthly_limit_cents > 0` covers it (all budget types, including
`non_monthly` sinking funds, count as "budgeted"). Spend inside a budgeted category is already
reserved by that category's allowance, so only truly unplanned spend is counted here.

### `planHealth(input, referenceDate): PlanHealth`
`budgetedCents` = Σ `monthly_limit_cents` over budgets with `monthly_limit_cents > 0` (base, not
effective). `unbudgetedSpentCents` = `unbudgetedSpendForMonth(...)`. `leftToPlanCents` = income −
budgeted − goalContributions − unbudgetedSpent — so money already spent outside any budget reduces
what's left to plan (spec 040).

### `rankAtRiskBudgets(budgets, transactions, referenceDate, elapsedFraction): AtRiskBudget[]`
`fixed`/`flex` budgets with limit > 0 only; compute `budgetStatusForMonth`; assign `pace`; sort by
"ahead-of-pace" severity (over first, then higher spent/limit relative to elapsed), take `topN`.

### `rankGoals(goals, contributionsByGoalId, referenceDate): GoalsSummary`
Per goal: `goalProgress` + `goalPacing`. Sort off-track first, then shortfall desc. `goalCount` is
the total number of goals (drives the empty state, not the sliced rows).

### `sinkingFunds(budgets, transactions, referenceDate): SinkingFund[]`
`non_monthly` budgets only; `setAsideCents` = `carriedInCents` from `budgetStatusForMonth`.

### `buildPlanSummary(input, now): PlanSummary`
Composes all of the above using `referenceDate = planReferenceDate(input.monthKey, now)` and
`elapsedFraction = monthElapsedFraction(input.monthKey, now)`.

## Test obligations (write first)

- `leftToPlanCents` equals income − budgeted − goalContributions − unbudgetedSpent for a mixed
  household.
- `unbudgetedSpendForMonth`: an expense in a category with no budget reduces `leftToPlanCents`;
  an expense in a budgeted category (any budget type) does NOT; income/transfers never count;
  out-of-month expenses are excluded.
- Base (not effective) limits used in the hero: a flex budget with rollover surplus does NOT shrink
  `budgetedCents`.
- `paceState`: 60% spent at 10% elapsed → `attention`; 60% at 90% → `under`; ≥100% → `over`; future
  month (elapsed 0) with 0 spend → `under`, with spend → `attention`.
- `monthElapsedFraction`/`planReferenceDate` for past/current/future, with an injected `now`.
- At-risk list excludes `non_monthly`, is capped at `topN`, most-ahead-of-pace first.
- Goals: off-track sorted before on-track; undated goal never off-track and 0 suggested monthly;
  behind goal exposes suggested monthly.
- Sinking funds: only `non_monthly`, `setAsideCents === carriedInCents`; empty when none.
- Determinism: same inputs + `now` ⇒ deep-equal output.
