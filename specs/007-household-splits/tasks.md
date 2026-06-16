---
description: "Task list for Simplified Households & Flexible Splits (iOS + web)"
---

# Tasks: Simplified Households & Flexible Splits (iOS + web)

**Input**: Design docs in `specs/007-household-splits/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: REQUIRED (Constitution Principle VI + SC-001/005). The pure split function is
golden-vector-locked and unit-tested test-first; the migration's cent math is verified; web
split-editor + dashboard behavior tested.

**Organization**: By user story (US1 flexible splits P1 → US2 dashboard P2 → US3 people mgmt
P3) on a vector-locked shared core + schema migration. Paths relative to repo root.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: parallelizable (different file, no incomplete dependency)

---

## Phase 1: Setup
- [x] T001 Re-read `web/scripts/gen-vectors.ts` head + `shared/test-vectors/README.md` to match the existing vector-gen + parity conventions; confirm no new deps. Add `lib/splits.ts` to the `coverage.include` list in `web/vitest.config.ts`.

---

## Phase 2: Foundational (Blocking — vector-locked split core, schema, model & scope removal)

**⚠️ Blocks all user stories.**

### Split math (test-first, golden-vector-locked)
- [x] T002 [P] Write `web/test/splits.test.ts` FIRST (failing): unit-cover `computeShares` (single/full, single-ignores-method, even divisible + remainder-1/2 across 2 and 3 owners, percent clean/uneven/remainder-to-first, value exact/uneven, order-matters) and `validateSplit` (`percent_sum`, `value_sum`, `no_owners`, ±0.5 tolerance). Deterministic, integer cents.
- [x] T003 Create `web/lib/splits.ts` — `SplitInput`/`SplitMethod`, `computeShares(amountCents, owners, split)`, `validateSplit(...)` per `contracts/split-function.md` (floor-by-target, distribute leftover in owner order; total). Make T002 pass.
- [x] T004 Extend `web/scripts/gen-vectors.ts` to emit `shared/test-vectors/transaction-splits.json` (`{ cases }`) with every case in `contracts/split-function.md`. Run `npm run gen:vectors`; commit the JSON.
- [x] T005 Create `web/test/splits.parity.test.ts` — load the JSON; assert `computeShares(case)` equals `expected` and sums to `amountCents`.
- [x] T006 [P] Create `iOS/Ortho-iOS/Features/Transactions/TransactionSplits.swift` — mirror `computeShares`/`validateSplit` exactly (Int64 cents; same leftover rule + order).
- [x] T007 [P] Create `iOS/Ortho-iOSTests/TransactionSplitParityTests.swift` — decode `transaction-splits.json` and assert each case (note in header: add JSON to the test target's Copy Bundle Resources).

### Schema migration
- [x] T008 Create `supabase/migrations/<ts>_household_people_and_value_splits.sql` per `contracts/schema.md`: create `household_people` (+ backfill from `household_members`); add `person_id`+`amount_cents` to `transaction_shares` (+ backfill percent→cents and full-amount rows for share-less txns), drop `user_id`/`percent`, set NOT NULL + new PK; backfill `transactions.household_id`, drop `scope` + `scope_matches_household`, set `household_id` NOT NULL; drop `transaction_scope` enum; rewrite `transactions`/`transaction_shares` RLS without scope; update `household_owner_spend` (+ siblings) to sum `amount_cents` per `person_id`.

### Model + scope removal (pure, both platforms)
- [ ] T009 [P] Web data model `web/lib/types.ts`: add `Person`; change `Transaction` to carry `owners: string[]` (person ids) + `shares: Record<string, number>` (cents); remove `scope`; remove `TransactionShare.percent` (→ person_id + amount_cents). Update `web/lib/format.ts` `effectiveSplits`→cents helper.
- [ ] T010 [P] iOS models: create `Models/Person.swift`; change `Transaction` `ownerIDs: Set<Person.ID>` + `shares: [Person.ID: Int64]`; delete `scope`/`TransactionScope.swift` references; stop using `LocalUser` as an owner identity (fold into Person).
- [x] T011 Remove the **scope** dimension from the pure filter on both platforms: `web/lib/transactionFilters.ts` + `iOS/.../TransactionFilters.swift` (drop `scope` from `FilterCriteria`, the predicate, `activeFilterCount`); update `web/test/transaction-filters.test.ts`; regenerate `shared/test-vectors/transaction-filters.json` from `gen-vectors.ts` (remove scope from cases); update both parity tests.
- [ ] T012 Web store `web/lib/store.tsx`: one member list sourced from `household_people`; people CRUD (`addPerson`/`renamePerson`/`removePerson` + `renameHousehold`); `addTransaction`/`updateTransaction` write one `transaction_shares` row per owner with cents from `computeShares`; **delete** `web/lib/personalShares.ts` + its rehydration; `spentBy`/aggregations read cents shares. Update `web/lib/api/aggregates.ts` callers (person_id).
- [ ] T013 iOS `App/AppState.swift`: people list + CRUD; read/write shares as cents; **remove** `personalShares`/`applyPersonalShares` + the local-user-vs-user machinery; aggregations (`spent(by:)`/`monthlySpent`/`expenseShares`) from cents shares.
- [ ] T014 Persistence layer: `web/scripts/import/db/transactions.ts` + the store's transaction writes, and iOS `Services/TransactionsAPI.swift` + a `household_people` CRUD path in `Services/HouseholdsAPI.swift` — read/write `transaction_shares(person_id, amount_cents)` and `household_people`.

**Checkpoint**: split math locked on both platforms; schema migrated; scope gone from the pure filter + data layer.

---

## Phase 3: User Story 1 - Flexible splits in the transaction form (Priority: P1) 🎯 MVP

**Goal**: Pick one or more household people for a transaction and split by even/%/value with exact cents; detail shows per-owner shares; scope toggle/filter removed from the UI.

**Independent Test**: $100 expense, two owners → even $50/$50; 70/30 → $70/$30; value $60/$40 saves; bad totals block save; single owner = full; detail shows shares.

### Tests (write first) ⚠️
- [ ] T015 [P] [US1] `web/test/split-editor.test.tsx` (jsdom): mount `TxForm` with a mocked store; multi-owner shows the editor with an even default; switch to % then value; invalid totals disable Save with the reconcile message; single owner hides the editor; removing to one owner gives full amount.

### Implementation
- [ ] T016 [US1] `web/components/web/TxForm.tsx`: remove the scope toggle + dual pools; owner chips from the one people list; add the split editor (method `Segmented` even/%/value, per-owner inputs, live reconcile via `validateSplit`, even default); save shares as cents via `computeShares`.
- [ ] T017 [US1] `web/components/transactions/TransactionDetailBody.tsx`: per-owner exact cents + derived %; no split for single owner.
- [ ] T018 [P] [US1] iOS `Features/Transactions/AddTransactionSheet.swift`: remove the scope segmented + dual pools; one owner pool; split editor (even/%/value, per-owner fields, reconcile, even default); save cents.
- [ ] T019 [P] [US1] iOS `Features/Transactions/TransactionDetailSheet.swift`: per-owner cents + %.
- [x] T020 [US1] Remove scope from the filter UI both platforms: web `components/web/FilterPanel.tsx`, `ActiveFilterChips.tsx`, `lib/useTransactionFilters.ts`, `app/(app)/transactions/page.tsx` (scope segmented + chip + option); iOS `FilterSheet.swift` + `TransactionsView.swift` (scope pill). Update `web/test/transactions-filter-ui.test.tsx`.
- [ ] T021 [US1] Run `cd web && npm test` (splits + parity + split-editor + updated filter UI green) + `npx tsc --noEmit`; iOS build. Fix until green.

**Checkpoint**: flexible splitting end-to-end on both platforms. **MVP.**

---

## Phase 4: User Story 2 - Per-person totals on the dashboard (Priority: P2)

**Goal**: The dashboard per-person breakdown reflects each person's exact cents share; per-person totals reconcile to the household total.

**Independent Test**: $100 split $70/$30 → dashboard shows $70/$30; per-person sums equal the household total exactly.

### Tests (write first) ⚠️
- [ ] T022 [P] [US2] `web/test/per-owner-breakdown.test.tsx`: per-person amounts come from cents shares; reconcile to the period total; expandable rows show each share.

### Implementation
- [ ] T023 [US2] `web/components/dashboard/PerOwnerBreakdownCard.tsx`: compute per-person from cents shares (drop percent-weighting).
- [ ] T024 [P] [US2] iOS `Features/Dashboard/Widgets/PerOwnerBreakdownCard.swift`: per-person from cents shares.
- [ ] T025 [US2] Confirm the aggregate RPC (`household_owner_spend`) + store aggregation return cents per person; verify dashboard numbers. `npm test` + tsc; iOS build.

**Checkpoint**: dashboard reflects exact per-person shares on both platforms.

---

## Phase 5: User Story 3 - Simplified people management (Priority: P3)

**Goal**: A plain people list — add by name, rename, rename household, remove (soft) — feeding the owner pickers; no accounts/invitations.

**Independent Test**: add "Jordan" → selectable owner; rename → reflected; remove → unselectable but history intact.

### Tests (write first) ⚠️
- [ ] T026 [P] [US3] `web/test/household-people.test.tsx`: add a person → appears in the owner picker; rename → reflected; remove → not selectable, existing transaction still renders the name.

### Implementation
- [ ] T027 [US3] `web/app/(app)/settings/household/page.tsx` + `web/components/settings/HouseholdDrawer.tsx`: one people list (add by name + color, rename person, rename household, soft-remove person). Drop the local-vs-member distinction + scope footnotes.
- [ ] T028 [P] [US3] iOS `Features/Settings/HouseholdView.swift` + `AddUserSheet.swift`: unified people list (add/rename/remove), no local/member split.
- [ ] T029 [US3] Verify `npm test` + tsc; iOS build; quickstart §4 passes.

**Checkpoint**: full feature on both platforms.

---

## Phase 6: Polish & Cross-Cutting
- [ ] T030 [P] Update `shared/test-vectors/README.md`: add `transaction-splits.json` (inputs/outputs, regen note) and note `transaction-filters.json` no longer has a scope dimension.
- [ ] T031 [P] Accessibility pass on the split editor + people list (labelled numeric fields, focus-visible ring, ≥44px targets, AA, `prefers-reduced-motion`) per constitution V.
- [ ] T032 Migration verification: apply the migration to a copy of existing data and run the quickstart §6 sum-check — every transaction `household_id NOT NULL`, ≥1 share row, `Σ shares = amount_cents`; prior single-participant txns owned full by creator's person.
- [ ] T033 Run full `quickstart.md` (web §1–5, + `tsc --noEmit` + `npm test` green; `lib/` coverage incl. `splits.ts` at threshold); confirm scope is gone everywhere (SC-004); document the iOS Xcode steps. Mark tasks complete in this file.

---

## Dependencies & Execution Order
- **Setup (T001)** → none. **Foundational (T002–T014)** → after setup; **blocks all stories**. Split core: T002→T003→T004→T005; T006/T007 [P] (iOS). Schema T008. Models T009/T010 [P]; T011 (filter scope removal) after T009/T010; store/AppState T012/T013 after T008+T009/T010; services T014 after T008.
- **US1 (T015–T021)** → after foundational. Detail/editor web (T016/T017) after T015; iOS (T018/T019) [P]; filter-UI scope removal T020; verify T021. **MVP.**
- **US2 (T022–T025)** → after US1 (dashboard reads the cents shares US1 writes).
- **US3 (T026–T029)** → after foundational; independent of US1/US2 UI but shares the people list/store (sequential with T012/T013).
- **Polish (T030–T033)** → last.

### Parallel example (Foundational)
```
T002 splits.test.ts      T006 TransactionSplits.swift   T007 split parity Swift   (distinct files)
then T003 splits.ts → T004 gen vectors → T005 web parity ; T009/T010 models [P] ; T008 migration
```

## Implementation Strategy
- **MVP = Phases 1–3 (US1)**: vector-locked split math + schema + the form/detail split editor with scope removed. Stop and validate.
- **Increment 2 (US2)**: dashboard per-person. **Increment 3 (US3)**: people management.
- The split math + migration cent math are golden-vector / sum-check verified; iOS UI ships verified-in-Xcode (parity vectors + structural mirror); the TS core + vectors are CI-verified.

## Notes
- Reuse, don't reinvent: `@/lib/format`, `components/ui.tsx` (`Segmented`/`Modal`/`SectionLabel`), `components/web/kit.tsx` (`Seg`/owner chips), `components/web/Drawer.tsx`; iOS segmented pill + `OwnerChipView` + `SearchField`.
- **Removals are tasks too**: deleting `personalShares.ts`, the scope column/enum, the dual owner pools, and the local-user identity are explicit acceptance points (SC-004).
- Total: 33 tasks (Setup 1, Foundational 13, US1 7, US2 4, US3 4, Polish 4).
