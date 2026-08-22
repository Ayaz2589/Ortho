# Plan — Spec 054, per-person budgets

One additive migration, one new pure function, and a scope chip bar on a page that already had a
category list. Everything else is threading.

## Data model

```sql
alter table public.budgets
  add column person_id uuid references public.household_people(id) on delete cascade;

alter table public.budgets drop constraint budgets_household_id_category_key;
alter table public.budgets
  add constraint budgets_household_category_person_key
  unique nulls not distinct (household_id, category, person_id);
```

- **Nullable, not a separate table.** A personal budget is the same object with an owner; a
  `person_budgets` table would fork every query, every engine and the rollover carry logic for
  no gain.
- **`NULLS NOT DISTINCT`** (Postgres 15+; the project runs 17) is load-bearing — a plain unique
  constraint treats each `null` as distinct and would let a household accumulate duplicate shared
  budgets. It also keeps the PostgREST upsert working: `on_conflict=household_id,category,person_id`
  infers this constraint for null and non-null person alike, so the store keeps its
  optimistic-with-rollback upsert instead of growing an insert/update branch.
- **`on delete cascade`** matches the row's meaning, though people are soft-deleted
  (`removed_at`) in practice, so a removed person's budgets simply stop being reachable — the same
  degradation `resolveScope` already applies to a stale scope.
- No backfill: every existing row is already a household budget.

## The one new rule

`scopeBudgets(budgets, scope)` in `lib/scope/moneyScope.ts`, beside `scopeTransactions`, because
that module is by construction "THE one place the attribution rule lives" (spec 051). It mirrors
the no-op contract: when no budget in the list has a `person_id`, household scope returns the
**same array reference**, so existing renders and vectors are untouched and a caller can detect
the no-op cheaply.

## Threading

| Surface | Change |
|---|---|
| `lib/planning/planSummary.ts` | Project budgets at the entry point next to `scopeTransactions`; every slice (health, budgetSummary, sinkingFunds) reads the projected list. |
| `lib/finance/insights.ts` | Same, at `generateInsights`'s entry. |
| `components/widgets/bodies/BudgetsBody.tsx` | Household budgets only (FR-006). |
| `app/(app)/planning/budget/page.tsx` | `PlanScopeBar` + per-scope lookup; drawer receives the selected person. |
| `components/budgets/BudgetDrawer.tsx` | New `personId` prop: finds the existing row by (category, person), saves `person_id`, and names whose budget it is. |
| `lib/store.tsx` | Map `person_id`; upsert it; dedupe key becomes (household, category, person). |
| `lib/types.ts` | `Budget.person_id: string | null` — **required**, so every construction site states its answer. A silent default is precisely the failure spec 050 was about. |
| `lib/supabase/rows.ts` | `BudgetRow.person_id?: string | null` — optional at the row boundary, the spec-027 deploy-before-migrate precedent. |

`budgetStatusForMonth` and `computeRolloverLedger` are untouched: a personal budget's carry is
derived from the personal (scoped) ledger by the caller, exactly as the household one is derived
from the household ledger. That keeps `shared/test-vectors/budget-rollover.json` valid unchanged.

## TDD order

1. `scopeBudgets` unit tests (household filter, person filter, no fallback, reference identity).
2. Plan-summary scope tests — a personal budget never enters the household summary and vice versa.
3. Insights scope test.
4. Widget test — personal budgets excluded.
5. Drawer test — saves `person_id`; edits the right row.
6. Budgets-page test — chip bar, per-scope "Not set", drawer wiring.
7. Store test — two budgets, same category, different people, coexist.
8. i18n test for the new keys, then the 5 catalogs.

## Risks

- **Postgres version.** `NULLS NOT DISTINCT` needs 15+. Local + hosted are 17 (docs/supabase.md).
  If a target ever predates 15, the fallback is a stored generated column
  `coalesce(person_id, uuid_nil)` in the unique key.
- **Test churn.** Making `person_id` required updates ~15 literal `Budget` objects in tests.
  Mechanical, and it makes each one say out loud that it is a household budget.
