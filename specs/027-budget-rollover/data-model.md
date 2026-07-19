# Phase 1 Data Model: Budget rollover

## Persisted: `budgets` (Supabase)

Existing columns unchanged: `id`, `household_id`, `category`,
`monthly_limit_cents` (= **base** limit), `created_at`, `updated_at`.

New columns (additive migration):

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `budget_type` | enum `budget_type` (`fixed`\|`flex`\|`non_monthly`) | not null | `'fixed'` | Behavior selector. Existing rows → `fixed` (no behavior change). |
| `rollover_cap_cents` | `bigint` | null | `null` | Flex-only cap on accumulated carry; `null` = uncapped. `check (rollover_cap_cents is null or rollover_cap_cents >= 0)`. |

Unchanged: `unique (household_id, category)`, `budgets_household_idx`, the
`touch_updated_at` trigger, and all four RLS policies (`is_household_member`).

`created_at` doubles as the **carry anchor** — carry accrues from the month a
budget was created. No new column is needed for the anchor.

## TS domain types (`web/lib/types.ts`)

```ts
export type BudgetType = 'fixed' | 'flex' | 'non_monthly'

export interface Budget {
  id: string
  household_id: string
  category: TransactionCategory
  monthly_limit_cents: number     // base limit
  budget_type: BudgetType         // NEW
  rollover_cap_cents: number | null // NEW (flex-only; null = uncapped)
  created_at?: string             // carry anchor (optional in-memory; present from DB)
}
```

`web/lib/supabase/rows.ts` `BudgetRow` mirrors the DB columns exactly
(`budget_type`, `rollover_cap_cents`, `created_at`) so a schema/enum drift fails
`tsc` at the load boundary.

## Pure engine types (`web/lib/finance/budgets.ts`)

```ts
export interface RolloverConfig {
  type: BudgetType
  baseLimitCents: number          // >= 0
  rolloverCapCents: number | null  // flex-only; null = uncapped
  openingCarryCents?: number       // carry into month 0 (default 0)
}

export interface RolloverMonth {
  carriedInCents: number
  baseLimitCents: number
  effectiveLimitCents: number      // base + carriedIn
  spentCents: number
  remainingCents: number           // effective − spent (may be negative)
  carriedOutCents: number
}

// Vectored (golden): the recurrence over an explicit, ordered monthly-spend series.
export function computeRolloverLedger(
  config: RolloverConfig,
  monthlySpendCents: number[],
): RolloverMonth[]

// Adapter (unit-tested, not a golden vector): reduce a transaction ledger to the
// monthly-spend series from the anchor to `referenceMonth`, then return that
// month's status. Delegates all arithmetic to computeRolloverLedger.
export interface BudgetStatus {
  effectiveLimitCents: number
  spentCents: number
  remainingCents: number
  carriedInCents: number
}
export function budgetStatusForMonth(
  budget: Budget,
  transactions: Transaction[],
  referenceMonth: Date,
): BudgetStatus
```

### Recurrence (per month `m`, spend `s`)

```
carriedIn = (type === 'fixed') ? 0
          : (m === 0 ? openingCarry : prev.carriedOut)
effective = base + carriedIn
remaining = effective − s
carriedOut = type === 'fixed'      ? 0
           : type === 'flex'       ? min(cap ?? +∞, max(0, remaining))
           : /* non_monthly */       remaining
```

All values integer cents. `fixed` ⇒ `effective === base`, `remaining === base − s`
(identical to today). Cap applies to the **accumulated** carried-out (so surplus
never exceeds the cap).

## Derived (not persisted)

The rollover ledger and `BudgetStatus` are recomputed on demand from
`transactions` + the budget row. Nothing is written back; there is no month-close
state.

## Consumers

- `BudgetProgressCard` — for the selected month, shows `spent`,
  `effectiveLimitCents`, `remainingCents`, and a "rolled over" caption when
  `carriedInCents !== 0`.
- `insights.ts` Rule 3 — compares `spent` against `effectiveLimitCents` (was the
  raw base). `fixed` output is byte-identical.
- `BudgetDrawer` — reads/writes `budget_type` + `rollover_cap_cents`.
- `store.tsx` `addOrUpdateBudget` — upsert includes the two new columns;
  `loadAll` projects them.
