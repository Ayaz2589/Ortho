# Tasks — Spec 054, per-person budgets

TDD throughout: every task below wrote its test first and watched it fail for the right reason.

## Engine

- [x] T001 `test/scope/scopeBudgets.test.ts` — household filter, person filter, no fallback,
      reference identity, absent-column tolerance.
- [x] T002 `Budget.person_id: string | null` (required) in `lib/types.ts`;
      `BudgetRow.person_id?: string | null` (optional) in `lib/supabase/rows.ts`.
- [x] T003 `scopeBudgets(budgets, scope)` in `lib/scope/moneyScope.ts`, beside `scopeTransactions`.
- [x] T004 `test/scope/personBudgets-engines.test.ts` — plan summary + insights read the scope's
      budgets; sinking funds too; household unchanged.
- [x] T005 Project budgets at `buildPlanSummary`'s entry point, alongside `scopeTransactions`.
- [x] T006 Same at `generateInsights`'s entry point.

## Database

- [x] T007 `supabase/migrations/20260816120000_person_budgets.sql` — nullable `person_id` FK,
      `budgets_person_idx`, and the old 2-column UNIQUE replaced by
      `unique nulls not distinct (household_id, category, person_id)`.
- [x] T008 Verified against a real Postgres 17: the auto-generated old constraint name drops
      cleanly, a household + two personal rows coexist for one category, a SECOND household row
      is rejected (what `NULLS NOT DISTINCT` buys), a duplicate person row is rejected, and
      `ON CONFLICT (household_id, category, person_id)` upserts both the null and non-null cases.

## Store

- [x] T009 `test/store.integrity.test.tsx` — row mapping (absent column ⇒ household), `person_id`
      in the upsert payload, household + personal rows coexisting, same-person update in place.
- [x] T010 `lib/store.tsx` — map `person_id`; send it; identity key becomes
      (household, category, person); `onConflict: 'household_id,category,person_id'`.

## UI

- [x] T011 `test/budgets/budget-drawer.test.tsx` — saves the right owner, edits/removes the right
      row, never prefills from the household limit, names whose budget it is.
- [x] T012 `BudgetDrawer` gains `personId` + `personName`.
- [x] T013 `test/budgets/budgets-page.test.tsx` — chip bar present/hidden, per-scope limits,
      "Not set" instead of a borrowed household number, drawer wiring.
- [x] T014 `app/(app)/planning/budget/page.tsx` — `PlanScopeBar` + `scopeBudgets` + scope-aware copy.
- [x] T015 `test/widgets/budgets.test.tsx` + `BudgetsBody` — the dashboard widget stays household-only.

## i18n

- [x] T016 `test/i18n/person-budgets-i18n.test.ts`, then the 2 new keys across all 5 catalogs.

## Regression

- [x] T017 `npx tsc --noEmit` clean; ~15 `Budget` literals in existing tests updated to state
      `person_id: null` (the cost of making the field required).
- [x] T018 Full suite: **300 files, 3074 passing, 3 expected-fail**.
- [x] T019 `npm run gen:vectors` → **zero diff** in `shared/test-vectors` (SC-002).
- [x] T020 `npm run gen:corpus` — regenerated; the manifest hash moves because the corpus builder
      now emits `person_id: null`. Scenario and row counts are unchanged.
- [x] T021 `npm run build` clean.

## Amended by this spec

- [x] T022 Two spec-051 assertions said a person's spend is measured against the UNCHANGED
      household limit — the deliberate v1 boundary 054 removes. Updated in place with a comment
      saying so, not deleted: `test/scope/planSummary-scope.test.ts`,
      `test/web/planning-hub.test.tsx` (the latter now sets a household AND a personal budget, so
      it asserts the two are not confused).

## Docs

- [x] T023 `docs/finance.md` (money scope + budget rollover sections), `docs/supabase.md`
      (migration table — also added the two spec-041/044 rows that were missing, and corrected
      the file count 19 → 22), `docs/household-system.md` (§11.7's open question is now answered).

## Not done, on purpose

- Financial health `plan_engagement` still counts every budget in the household — see spec.md
  "Out of scope" for why that is a design boundary, not an oversight.
