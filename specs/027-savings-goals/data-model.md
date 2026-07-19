# Phase 1 Data Model: Savings & Debt-Payoff Goals

All money is integer **USD cents** (`bigint`). Migration:
`supabase/migrations/20260718120000_savings_goals.sql`. Client mirrors in
`web/lib/types.ts` (domain) and `web/lib/supabase/rows.ts` (load-boundary `*Row`).

## Enum: `goal_kind`

```
goal_kind = 'savings' | 'debt_payoff'
```

New enum, created and used in the same migration (allowed for `CREATE TYPE`; only
`ALTER TYPE ... ADD VALUE` is forbidden same-migration). Mirrored as a TS union
`GoalKind`.

## Table: `goals`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `household_id` | `uuid` NOT NULL | → `households(id) on delete cascade` |
| `name` | `text` NOT NULL | `check (length(trim(name)) > 0)` |
| `kind` | `goal_kind` NOT NULL | `default 'savings'` |
| `target_cents` | `bigint` NOT NULL | `check (target_cents > 0)` — positive target required (FR-001) |
| `target_date` | `date` NULL | optional; local calendar day |
| `linked_account_id` | `uuid` NULL | → `linked_accounts(id) on delete set null` (context only) |
| `linked_category` | `transaction_category` NULL | context only |
| `created_by` | `uuid` NOT NULL | → `users(id)` (attribution) |
| `created_at` | `timestamptz` NOT NULL | `default now()` — the pace **start** reference |
| `updated_at` | `timestamptz` NOT NULL | `default now()`, `touch_updated_at` trigger |

**Constraints**
- `check (linked_account_id is null or linked_category is null)` — at most one
  association (FR-002).
- Index `goals_household_idx on (household_id)`.

**RLS** (budgets pattern, `is_household_member` helper): member `select` / `insert`
(`with check`) / `update` (`using` + `with check`) / `delete`, all on
`is_household_member(household_id)`.

**Grants**: `grant select, insert, update, delete on public.goals to authenticated;`
(explicit — spec-024 ACL rule).

## Table: `goal_contributions`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `goal_id` | `uuid` NOT NULL | → `goals(id) on delete cascade` |
| `amount_cents` | `bigint` NOT NULL | `check (amount_cents > 0)` — a positive contribution |
| `date` | `date` NOT NULL | `default current_date` — when it was set aside |
| `note` | `text` NULL | optional |
| `created_by` | `uuid` NOT NULL | → `users(id)` |
| `created_at` | `timestamptz` NOT NULL | `default now()` |

**Constraints**: Index `goal_contributions_goal_idx on (goal_id)`.

**RLS** (`transaction_shares` parent-`EXISTS` pattern): each policy checks the
parent goal is in a household the caller is a member of, e.g.
`using (exists (select 1 from public.goals g where g.id = goal_id and
public.is_household_member(g.household_id)))` for select/update/delete, and the same
as `with check` for insert/update.

**Grants**: `grant select, insert, update, delete on public.goal_contributions to
authenticated;`

**Cascade**: deleting a `goals` row deletes its `goal_contributions` (FR-012);
deleting a `households` row deletes both (existing household cascade).

## Domain types (`web/lib/types.ts`)

```ts
export type GoalKind = 'savings' | 'debt_payoff'

export interface Goal {
  id: string
  household_id: string
  name: string
  kind: GoalKind
  target_cents: number
  target_date: string | null            // 'YYYY-MM-DD' or null
  linked_account_id: string | null      // context only (spec 027 v1)
  linked_category: TransactionCategory | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface GoalContribution {
  id: string
  goal_id: string
  amount_cents: number
  date: string                          // 'YYYY-MM-DD'
  note: string | null
  created_by: string
  created_at: string
}
```

## Derived (never stored) — `GoalProgress` / `GoalPacing`

Computed by the pure engine `web/lib/finance/goals.ts` (see
[contracts/goals-engine.md](./contracts/goals-engine.md)):

```ts
interface GoalProgress {
  saved_cents: number       // exact integer sum of contributions
  target_cents: number
  remaining_cents: number   // max(0, target - saved)
  fraction: number          // clamp(saved / target, 0, 1); 0 when target <= 0
  reached: boolean          // target > 0 && saved >= target
}

interface GoalPacing {
  off_track: boolean
  past_due: boolean
  expected_cents: number            // round(target * clamp(elapsed/span, 0, 1))
  shortfall_cents: number           // max(0, expected - saved)
  suggested_monthly_cents: number   // ceil(remaining / monthsLeft); remaining if past due; 0 if reached/undated
}
```

## Load-boundary rows (`web/lib/supabase/rows.ts`)

`GoalRow` and `GoalContributionRow` mirror the columns above exactly (the untyped
client is asserted to these at the `loadAll` boundary, so a renamed/dropped column
fails `tsc` — spec 023/FR-018). Keep them, the `loadAll` select column lists, and
`lib/types.ts` in lockstep.
