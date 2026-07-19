# Tasks: Budget rollover & bucket types

**Input**: Design documents from `specs/027-budget-rollover/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: TDD is mandatory here (constitution Principle VI). Money math is
developed test-first: the golden vectors + failing parity test come **before** the
engine. Each subsequent unit writes a failing test first (RED), implements to
green (GREEN), then refactors.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no ordering dependency)
- **[Story]**: US1 (flex rollover), US2 (per-bucket remaining), US3 (bucket types)
- All paths are repo-relative.

---

## Phase 1: Foundational — pure rollover engine (RED → GREEN) [BLOCKS everything]

**Purpose**: The vector-locked math core. Nothing else can compute rollover until
this exists.

- [ ] T001 [US1] **RED** Add the `budget-rollover` vector section to
  `web/scripts/gen-vectors.ts`: define the scenarios from
  `contracts/rollover-math.md` (fixed 3-month, flex accumulate, flex overspend-
  forgiven, flex capped, flex opening-carry, non_monthly build+drawdown,
  non_monthly recover, zero-base, single-month, empty) and a
  `writeFileSync('budget-rollover.json', …)`. Import from
  `../lib/finance/budgets`. (Will fail to run until T003 exists — that's the RED.)
- [ ] T002 [US1] **RED** Write `web/test/budget-rollover.parity.test.ts` mirroring
  `housing-net-rental.parity.test.ts`: read `shared/test-vectors/budget-rollover.json`,
  assert `computeRolloverLedger(input.config, input.monthlySpendCents)` deep-equals
  `expected`, plus the structural invariants (effective = base + carriedIn;
  remaining = effective − spent; fixed ⇒ carry 0; flex carriedOut ≥ 0 and ≤ cap;
  non_monthly carriedOut === remaining; all integers). Fails: module missing.
- [ ] T003 [US1] **GREEN** Implement `web/lib/finance/budgets.ts`:
  `BudgetType`, `RolloverConfig`, `RolloverMonth`, `computeRolloverLedger` per the
  recurrence. Pure, integer-cents, no rounding. Doc-comment names the vector file.
- [ ] T004 [US1] Run `cd web && npm run gen:vectors` to write
  `shared/test-vectors/budget-rollover.json`; review the JSON diff as a behavior
  diff; `npm test` → the parity test goes green.
- [ ] T005 [US2] **RED→GREEN** Add `budgetStatusForMonth(budget, transactions,
  referenceMonth)` + `BudgetStatus` to `budgets.ts` and
  `web/test/budgets/budget-status.test.ts`: unit-test the ledger→monthly-spend
  reduction (anchor = `created_at` month; local-calendar bucketing; delegates math
  to `computeRolloverLedger`). Cover fixed (== base − spent), flex carry-in,
  non_monthly signed carry, pre-anchor months contribute 0.

**Checkpoint**: pure engine locked by vectors + unit tests; `npm test` green.

---

## Phase 2: Schema + data layer [depends on Phase 1 types]

- [ ] T006 [US3] Add migration
  `supabase/migrations/20260718NNNNNN_budget_rollover.sql` per
  `contracts/budgets-schema.md` (enum `budget_type` default `fixed`;
  `rollover_cap_cents bigint null` + check). `supabase db reset` to replay.
- [ ] T007 [US3] Extend `web/lib/types.ts`: export `BudgetType`; add
  `budget_type`, `rollover_cap_cents`, optional `created_at` to `Budget`.
- [ ] T008 [US3] Mirror the columns in `web/lib/supabase/rows.ts` `BudgetRow`
  (`budget_type`, `rollover_cap_cents`, `created_at`).
- [ ] T009 [US3] Store (`web/lib/store.tsx`): `addOrUpdateBudget` upsert includes
  `budget_type` + `rollover_cap_cents`; `loadAll` maps the new columns (keep the
  `select('*')` or project them). Default missing `budget_type` to `'fixed'` and
  cap to `null` at the row→domain boundary for deploy-before-migrate tolerance.
- [ ] T010 [P] [US3] `web/lib/testdata/seed.ts`: give the sample budgets explicit
  `budget_type` (make the groceries one `flex` with a small cap to exercise the
  path in test-data mode) and `created_at`.

**Checkpoint**: budgets round-trip type + cap through the store.

---

## Phase 3: Rollover-aware surfaces (test-first)

### US2 — Dashboard per-bucket remaining (P1)

- [ ] T011 [US2] **RED** `web/test/budgets/budget-progress-card.test.tsx` (jsdom):
  a flex budget with prior-month surplus renders effective limit + remaining incl.
  carry and a "rolled over" caption; an overspent bucket shows a negative remaining
  with Unicode minus (not red) and a full bar; no budgets ⇒ card hidden.
- [ ] T012 [US2] **GREEN** Update `web/components/dashboard/BudgetProgressCard.tsx`
  to compute each row via `budgetStatusForMonth` (selected month from `interval`),
  showing spent / effective limit / remaining + the carried caption. Keep the
  memoized single-pass structure; tokens only; loss never red.

### US3 — Insights use the effective limit (P2)

- [ ] T013 [US3] **RED** Extend `web/scripts/gen-vectors.ts` insight scenarios with
  a `flex` budget whose carry changes the over/near/under branch, and a
  `non_monthly` case; add matching expectations. Existing (fixed) cases MUST stay
  byte-identical.
- [ ] T014 [US3] **GREEN** `web/lib/finance/insights.ts` Rule 3: compute each
  budget's effective limit + carriedIn via the shared engine (needs the full
  `transactions` it already receives) and compare `spent` against the effective
  limit. Verify `fixed` output unchanged, then `npm run gen:vectors` and review the
  `insights.json` diff (only the new cases should appear).

### US3 — Bucket type selector + cap (P2)

- [ ] T015 [US3] **RED** `web/test/budgets/budget-drawer.test.tsx` (jsdom):
  the drawer shows a Fixed/Flex/Non-monthly selector with descriptions; choosing
  Flex reveals the optional cap field; Save persists `budget_type` +
  `rollover_cap_cents`; reopening reflects the saved values.
- [ ] T016 [US3] **GREEN** Update `web/components/budgets/BudgetDrawer.tsx`: add the
  type selector (existing choice-row/segment pattern, tokens only, a11y) + a
  flex-only cap `MoneyInput`; thread into the saved `Budget`. Update the mobile
  `web/app/(app)/budgets/page.tsx` row to show the type label alongside the limit.
- [ ] T017 [P] [US3] Add the new UI strings to all five catalogs
  `web/lib/i18n/{es,ja,zh,ko,bn}.ts` (en is identity): type names + descriptions,
  "Rollover cap", "Uncapped", "{0} rolled over", "remaining", "available".
  Keep `test/i18n/catalog-reachability` + `render-locale` green.

**Checkpoint**: dashboard + insights + editor are rollover-aware.

---

## Phase 4: Verify & reconcile

- [ ] T018 Run `cd web && npx tsc --noEmit` (clean) and `npm test` (all green,
  incl. vector-drift); `npm run test:tz` if any month-boundary logic touched.
- [ ] T019 Reconcile `PARITY.md`: add a "Budget rollover" row to the parity matrix
  (web ✅ / CLI — / source `lib/finance/budgets.ts` → `budget-rollover.json`); note
  it in the regression-core list; bump the "Last reconciled" line.
- [ ] T020 [P] Update docs: `docs/web.md` (pure-finance-core list + budgets card),
  `docs/shared.md` (12th vector file), `docs/index.md` (vector count / budgets),
  `docs/supabase.md` (budgets columns). Update
  `docs/future_tasks/4.1-flexible-budgeting.md` to mark the rollover slice shipped.
- [ ] T021 Commit, push to `feat/budget-rollover`, open the PR.

---

## Dependencies

- **Phase 1 (T001–T005) blocks all others** — it defines `budgets.ts` types the
  data layer and surfaces import.
- T006 (migration) is independent of the engine but blocks a live smoke test;
  T007–T009 depend on T003's types.
- T011–T012 (card) and T013–T014 (insights) both depend on T005
  (`budgetStatusForMonth`) / T003.
- T015–T017 (editor + i18n) depend on T007–T009 (types + store).
- Phase 4 depends on all implementation tasks.

## Parallel opportunities

- T010, T017, T020 are `[P]` (independent files).
- Within Phase 3, the card (US2) and insights (US3) tracks can proceed in
  parallel once Phase 1 is green.

## TDD note

Every `GREEN` task has a preceding `RED` task in the same story. Do not write
implementation before its failing test exists (Principle VI, NON-NEGOTIABLE).
