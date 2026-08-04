# Data Model: Planning Hub

**No stored data and no schema changes.** Every type below is a *derived view* computed on render
from existing store collections (`budgets`, `goals`, `goalContributions`, `transactions`) via the
pure module `lib/planning/planSummary.ts`. All amounts are integer USD cents; the reference date is
injected.

## Inputs (existing domain types, unchanged)

- `Budget` — `{ id, category, budget_type: 'fixed'|'flex'|'non_monthly', monthly_limit_cents,
  rollover_cap_cents, created_at }`
- `Goal` — `{ id, name, kind: 'savings'|'debt_payoff', target_cents, target_date: string|null,
  created_at, linked_category?, ... }`
- `GoalContribution` — `{ goal_id, amount_cents, ... }`
- `Transaction` — `{ kind, category, amount_cents, date }`

## Derived types (new, in `lib/planning/planSummary.ts`)

```ts
export type PaceState = 'under' | 'attention' | 'over'

export interface PlanHealth {
  incomeCents: number              // Σ income tx in the month window
  budgetedCents: number            // Σ base monthly_limit_cents (all budgets, limit > 0)
  goalContributionsCents: number   // Σ suggested_monthly_cents (dated, unreached goals)
  leftToPlanCents: number          // income − budgeted − goalContributions (may be negative)
}

export interface AtRiskBudget {
  budgetId: string
  category: TransactionCategory
  effectiveLimitCents: number
  spentCents: number
  remainingCents: number           // effective − spent (may be negative → "over")
  carriedInCents: number           // shown when != 0
  fraction: number                 // spent / effectiveLimit (0 when limit ≤ 0)
  pace: PaceState
}

export interface BudgetSummary {
  totalSpentCents: number
  totalLimitCents: number          // Σ effective limits of fixed+flex budgets
  overallPace: PaceState
  atRisk: AtRiskBudget[]           // bounded top-N, most-ahead-of-pace first
  budgetCount: number              // 0 → empty state
}

export interface GoalRowSummary {
  goalId: string
  name: string
  savedCents: number
  targetCents: number
  fraction: number                 // 0..1
  reached: boolean
  dated: boolean
  offTrack: boolean                // false for undated/reached
  suggestedMonthlyCents: number    // catch-up when behind; 0 otherwise
  targetDate: string | null        // for the projected-completion / due label
}

export interface GoalsSummary {
  rows: GoalRowSummary[]           // off-track first, then by shortfall desc
  goalCount: number                // 0 → empty state
}

export interface SinkingFund {
  budgetId: string
  category: TransactionCategory
  setAsideCents: number            // carriedInCents for the month (may be negative)
  baseLimitCents: number
}

export interface PlanSummary {
  monthKey: string                 // 'YYYY-MM'
  referenceDate: Date
  health: PlanHealth
  budgets: BudgetSummary
  goals: GoalsSummary
  sinkingFunds: SinkingFund[]      // empty → panel omitted
}
```

## Entry point

```ts
buildPlanSummary(
  input: {
    budgets: Budget[]
    goals: Goal[]
    goalContributions: GoalContribution[]
    transactions: Transaction[]
    monthKey: string               // selected month
  },
  now: Date,                       // injected reference "today"
): PlanSummary
```

## Invariants

- `leftToPlanCents === incomeCents − budgetedCents − goalContributionsCents`, exactly (integer cents).
- `overallPace`/`pace` are `over` iff spent ≥ effective limit; never derived from color.
- `atRisk` length ≤ `TOP_N` (see `thresholds.ts`); only `fixed`/`flex` budgets with limit > 0.
- `goals.rows` order: all `offTrack` before non-off-track; within a group, larger shortfall first;
  undated goals are never `offTrack`.
- `sinkingFunds` contains only `non_monthly` budgets; empty array → the panel is not rendered.
- Pure & deterministic: identical inputs + `now` ⇒ identical output; no clock/network/`Math.random`.
