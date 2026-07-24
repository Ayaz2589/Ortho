# Tasks: Category & Subcategory Expansion

**Input**: Design documents from `specs/031-category-subcategory-expansion/`

**Approach**: TDD — tests are written first and must fail before implementation begins (constitution §VI).

**Organization**: Tasks grouped by user story; phases ordered by priority.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared dependencies)
- **[Story]**: User story this task belongs to (US1–US5)

---

## Phase 1: Setup

**Purpose**: Create the feature branch and establish the working environment.

- [x] T001 Check out new branch `feat/031-category-subcategory-expansion` from `main`
- [x] T002 Verify `npm test` passes green before any changes (establish baseline)

---

## Phase 2: Foundational — DB Migration + Type System + Category Library

**Purpose**: Everything in this phase BLOCKS all UI work. The DB enum, `PICKABLE_CATEGORIES`, and
`CATEGORIES` map must be in place before any picker, filter, or budget task can be implemented.

**⚠️ CRITICAL**: No user story implementation can begin until this phase is complete and `npm test` is green.

### Tests — write first, confirm they FAIL

- [x] T003 [P] Write failing test: extend `web/test/categories.test.ts` — `ALL_CATEGORIES` constant includes all 40 pickable slugs + `transfer`; `Object.keys(CATEGORIES).sort()` matches it
- [x] T004 [P] Write failing test: `CATEGORY_GROUPS.expense` children union equals `SPEND_CATEGORIES`; `CATEGORY_GROUPS.income` children union equals `INCOME_CATEGORIES`
- [x] T005 [P] Write failing test: every slug in `CATEGORIES` has a truthy `label`, `icon`, `tint`, and `parent` (including all new slugs)
- [x] T006 [P] Write failing test: `SPEND_CATEGORIES` does not contain any income slug or `transfer`; `INCOME_CATEGORIES` does not contain any expense slug or `transfer`
- [x] T007 [P] Write failing test: `INCOME_CATEGORIES` contains `salary`, `bonus`, `freelance`, `business_income`, `dividends`, `rental_income`, `gift_received`, `refund`, `other_income`, `income`
- [x] T008 Confirm all five new tests fail (`npm test` — expected red)

### Implementation

- [x] T009 Write DB migration `supabase/migrations/20260724120000_category_expansion.sql` — one `ALTER TYPE transaction_category ADD VALUE IF NOT EXISTS` per new expense slug: `fast_food`, `alcohol`, `takeout`, `parking`, `rideshare`, `home_improvement`, `insurance`, `gym`, `pharmacy`, `mental_health`, `streaming`, `gaming`, `events`, `clothing`, `electronics`, `personal_care`, `gifts`, `education`, `books`
- [x] T010 Add income slugs to same migration: `salary`, `bonus`, `freelance`, `business_income`, `dividends`, `rental_income`, `gift_received`, `refund`, `other_income`
- [x] T011 Update `web/lib/types.ts` — expand `PICKABLE_CATEGORIES` array to include all 29 new slugs (expense + income); `TransactionCategory` union updates automatically
- [x] T012 Add `CategoryGroupKey` type and `CategoryGroup` interface to `web/lib/categories.ts`
- [x] T013 Add `parent: CategoryGroupKey` field to `CategoryMeta` interface in `web/lib/categories.ts`
- [x] T014 Add all 19 new expense slugs to `CATEGORIES` map in `web/lib/categories.ts` (each with label, icon imported from lucide-react, tint, parent) — see `research.md` for icon + tint assignments
- [x] T015 Add all 9 new income slugs to `CATEGORIES` map in `web/lib/categories.ts`; add `parent` to existing `income` slug entry (parent: `income_other`)
- [x] T016 Add `parent` field to all 11 original expense slugs in `CATEGORIES` map (`coffee` → `food_drink`, etc.)
- [x] T017 Add `parent` to `transfer` in `CATEGORIES` map (`parent: 'system'`)
- [x] T018 Add `CATEGORY_GROUPS` export to `web/lib/categories.ts` — `{ expense: CategoryGroup[], income: CategoryGroup[] }` per data-model.md
- [x] T019 Update `SPEND_CATEGORIES` in `web/lib/categories.ts` to include all 29 expense slugs in group order
- [x] T020 Add `INCOME_CATEGORIES` export to `web/lib/categories.ts` — ordered array of 10 income slugs
- [x] T021 Run `npm test` — confirm T003–T007 tests now pass; confirm no pre-existing test regressions

**Checkpoint**: `CATEGORIES` has 41 entries, `SPEND_CATEGORIES` has 28, `INCOME_CATEGORIES` has 10, all tests green. UI work can now begin in parallel.

---

## Phase 3: User Story 5 + User Story 1 — Expense Category Picker + Backward Compatibility (Priority: P1) 🎯 MVP

**Goal (US5)**: Existing transactions with original slugs display correctly — zero regressions.  
**Goal (US1)**: Expense category picker in TxForm shows grouped subcategories; new slugs can be saved and displayed.

**Independent Test**: Add a new expense, pick "Fast Food", save; verify stored and displayed correctly. Load the existing seed/test data; verify all original categories still display.

### Tests — write first

- [x] T022 [P] [US5] Write failing test in `web/test/categories.test.ts` — `categoryMeta('coffee')`, `categoryMeta('dining')`, etc. all return same label/tint as before (regression lock on existing slugs)
- [x] T023 [P] [US1] Write failing test in `web/test/transactions/new-page.test.tsx` (or create `web/test/transactions/category-picker.test.tsx`) — expense form renders `<optgroup>` elements; selecting `fast_food` is reflected in the saved transaction payload
- [x] T024 Confirm new tests fail before implementing UI changes

### Implementation

- [x] T025 [US5] Verify `categoryMeta()` function in `web/lib/categories.ts` still returns the correct value for all original slugs (no change needed; regression-confirmed by T022)
- [x] T026 [US1] Update `web/components/web/TxForm.tsx` expense category picker: replace `SPEND_CATEGORIES.map(c => <option>)` with `CATEGORY_GROUPS.expense.map(group => <optgroup label={group.label}>{group.children.map(c => <option>)}</optgroup>)`
- [x] T027 [US1] Update `web/components/web/kit.tsx` `CatTile` — no change needed (already uses `categoryMeta(c).icon` and `.tint`); verify it renders correctly for new slugs by running the app
- [x] T028 [US1] Run `npm test` — confirm T022–T023 tests pass; `npm run build` type-checks clean
- [x] T029 [US5] Run quickstart scenario 5 (backward compat): load seed data and verify all original category labels/icons appear correctly

**Checkpoint**: Expense picker is grouped; new slugs work; original slugs unchanged. US1 + US5 independently verifiable.

---

## Phase 4: User Story 2 — Income Category Picker (Priority: P1)

**Goal**: When `kind = 'income'`, the category picker shows income subcategories; the stored value is the specific income slug (e.g. `salary`), not the hardcoded `income`.

**Independent Test**: Add income transaction, select "Freelance", save; verify `category = freelance` stored and displayed.

### Tests — write first

- [x] T030 [P] [US2] Write failing test in `web/test/transactions/category-picker.test.tsx` — switching kind to "income" renders `<optgroup>` for income groups (`Employment & Business`, etc.); default value is `salary`
- [x] T031 [P] [US2] Write failing test — saving income form with `category = freelance` emits `{ kind: 'income', category: 'freelance' }` (not hardcoded `income`)
- [x] T032 [US2] Confirm new tests fail

### Implementation

- [x] T033 [US2] Update `web/components/web/TxForm.tsx` — import `CATEGORY_GROUPS` and `INCOME_CATEGORIES` from `@/lib/categories`
- [x] T034 [US2] In TxForm: when `isIncome`, render income category picker using `CATEGORY_GROUPS.income.map(group => <optgroup>)` instead of hiding the category field
- [x] T035 [US2] In TxForm state: add `incomeCategory` state (default: `salary`); initialise from `src.category` when editing an income transaction
- [x] T036 [US2] In TxForm submit handler: replace `category: isIncome ? 'income' : category` with `category: isIncome ? incomeCategory : category`
- [x] T037 [US2] In TxForm kind-switch handler: when switching to `income`, set `incomeCategory` to `salary` (if no existing value); when switching back to `expense`, reset expense `category` to `groceries`
- [x] T038 [US2] Run `npm test` — confirm T030–T031 pass; run `npx tsc --noEmit` — 0 errors

**Checkpoint**: Income form shows income subcategory picker; stored slug is specific (e.g. `salary`). US2 independently verifiable.

---

## Phase 5: User Story 3 — Filter Panel (Priority: P2)

**Goal**: Filter panel shows subcategories grouped by parent; filtering by any new subcategory narrows the transaction list correctly.

**Independent Test**: Open filter, select "Parking", confirm only `parking` transactions are shown.

### Tests — write first

- [x] T039 [P] [US3] Write failing test in `web/test/transactions-filter-ui.test.tsx` (extend existing) — filter panel renders group header labels (`Food & Drink`, `Transport`, etc.) in the category section
- [x] T040 [P] [US3] Write failing test — selecting `gym` in the filter calls `setCategories(['gym'])` and the active filter chip shows "Gym"
- [x] T041 [US3] Confirm new tests fail

### Implementation

- [x] T042 [US3] Update `web/components/web/FilterPanel.tsx` — import `CATEGORY_GROUPS` from `@/lib/categories`
- [x] T043 [US3] Replace current flat `ALL_CATEGORIES` render in `FilterPanel.tsx` with grouped render: iterate `[...CATEGORY_GROUPS.expense, ...CATEGORY_GROUPS.income]`, render a non-selectable group header `<div>` for each group's `label`, then chips for each child slug
- [x] T044 [US3] Ensure existing filter state (multi-select `categories: TransactionCategory[]`) is unchanged — new slugs are treated identically to old ones by `filterTransactions()`
- [x] T045 [US3] Run `npm test` — confirm T039–T040 pass; check that existing filter tests still pass

**Checkpoint**: Filter panel shows grouped categories. US3 independently verifiable alongside US1/US2.

---

## Phase 6: User Story 4 — Budget Drawer (Priority: P2)

**Goal**: Budget drawer category picker lists all spend subcategories grouped by parent; new subcategories can be budgeted.

**Independent Test**: Open budget drawer, create budget for "Clothing", verify saved with `category = clothing`.

### Tests — write first

- [x] T046 [P] [US4] Write failing test in `web/test/budgets/budget-drawer.test.tsx` (extend existing) — budget category picker includes `clothing` and `rideshare` as selectable options
- [x] T047 [P] [US4] Write failing test — selecting `clothing` and saving emits `{ category: 'clothing', monthly_limit_cents: ... }`
- [x] T048 [US4] Confirm new tests fail

### Implementation

- [x] T049 [US4] Update `web/components/budgets/BudgetDrawer.tsx` — import `CATEGORY_GROUPS` from `@/lib/categories` (budget page updated to CATEGORY_GROUPS grouped display)
- [x] T050 [US4] Update budget category picker in `BudgetDrawer.tsx` to use `CATEGORY_GROUPS.expense` grouped structure (same `<optgroup>` pattern as TxForm); income categories excluded from budget picker
- [x] T051 [US4] Run `npm test` — confirm T046–T047 pass; run `npx tsc --noEmit`

**Checkpoint**: Budget drawer supports all 28 expense subcategories. US4 independently verifiable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: CSV categoriser, GoalForm, seed data, docs, and final validation.

- [x] T052 [P] Update `web/scripts/import/engine/categorize.ts` — extend keyword rules: Uber Eats/DoorDash/GrubHub → `takeout`; Lyft → `rideshare`; parking patterns → `parking`; Netflix/Hulu/Disney+ → `streaming`; Equinox/Peloton/gym → `gym`; CVS/Walgreens → `pharmacy`; GameStop/Steam → `gaming`
- [x] T053 [P] Update `web/components/goals/GoalForm.tsx` `linked_category` picker to use `CATEGORY_GROUPS` grouped structure (both expense and income)
- [x] T054 [P] Update seed / test-data files that hardcode `income` as a category to use `salary` or other specific income slug where appropriate (search `web/lib/testdata/` and `web/scripts/seed/`)
- [x] T055 Update `docs/finance.md` — update the category taxonomy section: change "12 values (11 pickable + non-pickable transfer)" to "41 values (40 pickable + transfer)"; add table showing groups and children
- [x] T056 Run full test suite: `cd web && npm test` — all tests green, no regressions
- [x] T057 Run `npx tsc --noEmit` from `web/` — 0 type errors
- [ ] T058 Manually validate quickstart.md scenarios 3 (expense picker), 4 (income picker), and 5 (backward compat) in the dev server
- [ ] T059 Commit all changes with message: `feat(categories): two-level category/subcategory taxonomy + income subcategories`

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
    ↓
Phase 2 (Foundational: DB + types + categories.ts)  ← BLOCKS everything
    ↓
Phase 3 (US5+US1: Expense picker)  ←── can run in parallel after Phase 2
Phase 4 (US2: Income picker)       ←─┘
Phase 5 (US3: Filter)              ←─┘
Phase 6 (US4: Budget)              ←─┘
    ↓ (all phases complete)
Phase 7 (Polish)
```

### User Story Dependencies

| Story | Depends On | Can Parallelise With |
|-------|-----------|----------------------|
| US5 + US1 (Expense picker) | Phase 2 complete | US2, US3, US4 |
| US2 (Income picker) | Phase 2 complete | US1, US3, US4 |
| US3 (Filter) | Phase 2 complete | US1, US2, US4 |
| US4 (Budget) | Phase 2 complete | US1, US2, US3 |

### Within Each Phase

- Test tasks marked [P] can all start simultaneously
- Confirm tests FAIL before writing implementation
- Run `npm test` after each implementation task (fast feedback)

---

## Parallel Opportunities

### Phase 2 (all can run in parallel after T008 confirms tests fail):
- T009–T010 (migration) in parallel with T011 (types.ts)
- T012–T013 (interfaces) in parallel with T011
- T014–T017 (CATEGORIES entries) after T012–T013

### Phases 3–6 (all can start simultaneously after Phase 2 checkpoint):
```
Phase 3: T022 → T023 → T024 → T025 → T026 → T027 → T028 → T029
Phase 4: T030 → T031 → T032 → T033 → T034 → T035 → T036 → T037 → T038
Phase 5: T039 → T040 → T041 → T042 → T043 → T044 → T045
Phase 6: T046 → T047 → T048 → T049 → T050 → T051
```

### Phase 7 (T052, T053, T054 can all run in parallel):
```
T052 (CSV) ──┐
T053 (Goal)──┼→ T056 (full test) → T057 (tsc) → T058 (manual) → T059 (commit)
T054 (seed)──┘
T055 (docs)─┘
```

---

## Implementation Strategy

### MVP First (Phase 1–3 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational — DB + type system + categories.ts
3. Complete Phase 3: US5 + US1 — grouped expense picker + backward compat
4. **STOP and VALIDATE**: All original categories display correctly; new expense subcategories work
5. This alone is shippable — income categories, filter, budget enhancements can follow

### Incremental Delivery

1. Setup + Foundational → type system ready
2. Phase 3 → expense subcategory picker works (MVP)
3. Phase 4 → income subcategory picker works
4. Phase 5 → filter shows grouped categories
5. Phase 6 → all subcategories budgetable
6. Phase 7 → CSV smarter; docs updated; clean up

---

## Notes

- [P] = parallelisable (different files, no common dependency)
- Tests must fail before implementation — constitution §VI
- Every `ALTER TYPE … ADD VALUE` is idempotent (`IF NOT EXISTS`); safe to re-run
- `transfer` must never appear in `SPEND_CATEGORIES`, `INCOME_CATEGORIES`, or `CATEGORY_GROUPS`
- The `<optgroup>` picker requires no new dependencies — native HTML, screen-reader safe
- Commit after each phase checkpoint to keep history clean
