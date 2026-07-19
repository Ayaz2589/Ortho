# Contract: `budgets` schema change

Additive, backward-compatible migration. No existing column, index, trigger, or
RLS policy changes.

## Migration (`supabase/migrations/20260718NNNNNN_budget_rollover.sql`)

```sql
-- Budget bucket type + rollover cap (spec 027).
create type public.budget_type as enum ('fixed', 'flex', 'non_monthly');

alter table public.budgets
  add column budget_type public.budget_type not null default 'fixed',
  add column rollover_cap_cents bigint
    check (rollover_cap_cents is null or rollover_cap_cents >= 0);
```

## Semantics

- `budget_type` — behavior selector; `fixed` (default) = today's reset-monthly
  behavior, so every pre-existing row is unchanged. `flex` = surplus rolls
  forward (overspend forgiven), `non_monthly` = signed sinking fund.
- `rollover_cap_cents` — cap on accumulated carry, **flex-only** and optional
  (`null` = uncapped). The check allows `null` or a non-negative amount. The app
  ignores the value for non-flex types.

## Enum-evolution note

Per the repo's enum convention, adding a future bucket type requires **both** a
migration (`alter type ... add value`) and the `BudgetType` TS union update
(`lib/types.ts` + `lib/supabase/rows.ts`). This closed set of three is stable for
this slice.

## Local replay

```bash
supabase db reset   # replays all migrations incl. this one against the local stack
```

Hosted project: the migration is applied by the normal deploy path; the two
columns are nullable-or-defaulted so a deploy-before-migrate client tolerates
their absence the same way `loadAll` already fails open on missing columns.
