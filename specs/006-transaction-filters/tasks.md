---
description: "Task list for Transaction Filters (iOS + web)"
---

# Tasks: Transaction Filters (iOS + web)

**Input**: Design docs in `specs/006-transaction-filters/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: REQUIRED (Constitution Principle VI + SC-002/006). The pure filter function is golden-vector-locked and unit-tested test-first; date/month boundaries deterministic; web filter components tested for behavior. iOS parity test ships ready-to-run (verified in Xcode).

**Organization**: By user story (US1 category P1 → US2 kind+source P2 → US3 owner+date P3), on a vector-locked shared core. Paths relative to repo root.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: parallelizable (different file, no incomplete dependency)

---

## Phase 1: Setup
- [x] T001 Confirm no new deps; create `web/test/import`-style siblings aren't needed. Read `web/scripts/gen-vectors.ts` head + `shared/test-vectors/README.md` to match the existing vector-gen + parity-test conventions before writing the core.

---

## Phase 2: Foundational (Blocking — the vector-locked core)

**⚠️ Blocks all user stories.**

- [x] T002 [P] Write `web/test/transaction-filters.test.ts` FIRST (failing): unit-cover `filterTransactions` per data-model predicate — scope, search (merchant/source/category/owner-name hit+miss), category single+multi(OR), kind, source single+multi, owner single+multi(∩), date half-open `[from,to)`, AND across dims; plus `activeFilterCount`, `availableSources`, `monthBounds('2026-05')`. Deterministic (fixed dates).
- [x] T003 Create `web/lib/transactionFilters.ts` — `FilterCriteria`, `FilterContext`, `emptyCriteria()`, `filterTransactions(txs, c, ctx)`, `activeFilterCount(c)`, `availableSources(txs)`, `monthBounds(yyyymm)`. Pure (no store/clock). Make T002 pass.
- [x] T004 Extend `web/scripts/gen-vectors.ts` to emit `shared/test-vectors/transaction-filters.json` with the cases listed in `contracts/filter-function.md` (each dimension, combinations, edge: empty result / emptyCriteria-returns-all / absent-source-or-owner / month boundary). Run `npm run gen:vectors`; commit the JSON.
- [x] T005 Create `web/test/transaction-filters.parity.test.ts` — load the JSON; for each case assert `filterTransactions(case.transactions, case.criteria, case.context).map(t=>t.id) === case.expectedIds`.
- [x] T006 [P] Create `iOS/Ortho-iOS/Features/Transactions/TransactionFilters.swift` — mirror `FilterCriteria`/`FilterContext`/`filterTransactions`/`activeFilterCount`/`availableSources`/`monthBounds` exactly (same predicate, same order).
- [x] T007 [P] Create `iOS/Ortho-iOSTests/TransactionFilterParityTests.swift` — decode the bundled `transaction-filters.json` and assert each case (mirror the web parity test). Note in the file header: add the JSON to the test target's Copy Bundle Resources.
- [x] T008 Create `web/lib/useTransactionFilters.ts` — hook holding `FilterCriteria` state + per-dimension setters + clear-all + derived option lists (`availableSources(transactions)`, owner options from store members+self, category list). Shared by both web surfaces.

**Checkpoint**: behavior locked by vectors on both platforms; UI can build on it.

---

## Phase 3: User Story 1 - Category filter + framework UI (Priority: P1) 🎯 MVP

**Goal**: A working filter surface with category multi-select, active chips + count badge + clear-all, AND-combining with scope/search, and a distinct no-matches state — on web (compact + desktop) and iOS.

**Independent Test**: select two categories → only those show (grouped/totalled); badge=2; clear-all restores; no-match combo shows the no-matches state; same selection → same set on iOS & web (vectors).

### Tests (write first) ⚠️
- [x] T009 [P] [US1] `web/test/transactions-filter-ui.test.tsx` (jsdom): mount the Transactions page with a mocked store; open filters, toggle a category, assert only matching rows render; badge count; clear-all restores; a no-match selection shows "No transactions match your filters".

### Implementation
- [x] T010 [P] [US1] `web/components/web/ActiveFilterChips.tsx` — removable chip per active dimension + count badge + Clear all (uses `activeFilterCount` + the hook setters).
- [x] T011 [P] [US1] `web/components/web/FilterPanel.tsx` — surface body shell with the **Category** multi-select (existing `CatTile` + `CATEGORIES`); placeholders/sections for kind/source/owner/date added in US2/US3.
- [x] T012 [US1] Edit `web/app/(app)/transactions/page.tsx` — replace inline `inScope`/`matches`/`months` with `useTransactionFilters` + `filterTransactions` → `groupByDay`/`groupDaysByMonth`; add a Filters button (badge), the compact `FilterPanel` reveal + `ActiveFilterChips`, and the no-matches `EmptyState`. Keep scope segmented + search.
- [x] T013 [US1] Edit `web/components/web/TransactionsDesktop.tsx` — same criteria/hook; Filters button opens the right `Drawer` with `FilterPanel`; `ActiveFilterChips` under the title; no-matches state.
- [x] T014 [P] [US1] iOS: create `iOS/Ortho-iOS/Features/Transactions/FilterSheet.swift` (category section) and edit `TransactionsView.swift` to hold `FilterCriteria`, add a filter button → bottom sheet, active chips + clear-all, no-matches state; preserve scope pills + `SearchField`; filter via `filterTransactions`.
- [x] T015 [US1] Run `cd web && npm test` (unit+parity+UI green) + `npx tsc --noEmit`; manual desktop/compact check per quickstart. Fix until green.

**Checkpoint**: category filtering end-to-end + the whole framework. **MVP.**

---

## Phase 4: User Story 2 - Kind + Source (Priority: P2)

**Goal**: Filter by kind (All/Expenses/Income) and by source (multi-select of present sources), combining with category/scope/search.

**Independent Test**: Income-only shows only income; two sources show only those (OR); kind∧category AND holds.

### Tests (write first) ⚠️
- [x] T016 [P] [US2] Extend `web/test/transactions-filter-ui.test.tsx` — kind segmented narrows to income/expense; source multi-select narrows; chips reflect both.

### Implementation
- [x] T017 [US2] Edit `web/components/web/FilterPanel.tsx` — add the **Kind** segmented (`Seg`: All/Expenses/Income) and the **Source** multi-select (from `availableSources`).
- [x] T018 [P] [US2] Edit `iOS/.../FilterSheet.swift` — add Kind pills + Source multi-select.
- [x] T019 [US2] Verify: `npm test` + tsc; kind/source narrow correctly and chips/clear-all include them.

**Checkpoint**: kind + source work on both platforms.

---

## Phase 5: User Story 3 - Owner + Month/Date range (Priority: P3)

**Goal**: Filter by owner (members + self, multi-select) and by month / from–to date range, combining with all else.

**Independent Test**: owner shows only their txs (OR); month shows only that month's txs (boundary correct); owner∧month∧category AND holds.

### Tests (write first) ⚠️
- [x] T020 [P] [US3] Extend `web/test/transactions-filter-ui.test.tsx` — owner select narrows; month select narrows to that month (inject reference date); combined AND.

### Implementation
- [x] T021 [US3] Edit `web/components/web/FilterPanel.tsx` — add the **Owner** multi-select (member avatars + self) and the **Date** controls (month picker + optional from–to), using `monthBounds`.
- [x] T022 [P] [US3] Edit `iOS/.../FilterSheet.swift` — add Owner multi-select + month/date controls.
- [x] T023 [US3] Verify: `npm test` + tsc; owner/date narrow correctly, chips/clear-all complete; full quickstart steps 2–4 pass.

**Checkpoint**: all six dimensions; full feature on both platforms.

---

## Phase 6: Polish & Cross-Cutting
- [x] T024 [P] Update `shared/test-vectors/README.md` to list `transaction-filters.json` (inputs/outputs, regen note) alongside mortgage/insights.
- [x] T025 [P] Accessibility pass on web filter controls (keyboard order, `focus-visible` ring, ≥40/44px targets, AA, `prefers-reduced-motion` on drawer/sheet) per constitution V.
- [x] T026 Run full `quickstart.md` (web steps 1–4, 6) + `cd web && npm test` + `tsc --noEmit` green; confirm cleared-filters = pre-feature behavior (SC-007). Document the iOS Xcode steps (step 5) for the operator.

---

## Dependencies & Execution Order
- **Setup (T001)** → none. **Foundational (T002–T008)** → after setup; **blocks all stories** (UI depends on the pure fn + hook). T002 before T003; T003 before T004→T005; T006/T007 [P] (iOS, independent files); T008 after T003.
- **US1 (T009–T015)** → after foundational. Components T010/T011 [P]; page/desktop (T012/T013) after them; iOS T014 [P]. **MVP.**
- **US2 (T016–T019)** → after US1 (extends FilterPanel/FilterSheet — same files, sequential within platform).
- **US3 (T020–T023)** → after US2 (same files).
- **Polish (T024–T026)** → last.
- Note: `FilterPanel.tsx` and `FilterSheet.swift` are edited across US1→US2→US3 (sequential, not parallel with each other); `transactions-filter-ui.test.tsx` likewise grows per story.

### Parallel example (Foundational)
```
T002 transaction-filters.test.ts   T006 TransactionFilters.swift   T007 parity Swift   (distinct files)
then T003 transactionFilters.ts → T004 gen vectors → T005 web parity test ; T008 hook
```

## Implementation Strategy
- **MVP = Phases 1–3 (US1)**: vector-locked core + category filter + the full framework (chips, count, clear-all, no-matches) on web + iOS. Stop and validate.
- **Increment 2 (US2)**: kind + source. **Increment 3 (US3)**: owner + date.
- iOS UI ships verified-in-Xcode (parity vectors + structural mirror of the web fn); the TS core + vectors are fully CI-verified.

## Notes
- Reuse, don't reinvent: `@/lib/format` (`groupByDay`/`groupDaysByMonth`/`expenseTotal`/`startOfMonth`), `@/lib/categories` (`CATEGORIES`/`SPEND_CATEGORIES`/`CatTile`), `components/ui.tsx` (`Segmented`/`EmptyState`), `components/web/kit.tsx` (`Seg`/`WebSearchInput`/`ChipIconButton`), `components/web/Drawer.tsx`. iOS reuses the pill + `SearchField` patterns.
- Total: 26 tasks (Setup 1, Foundational 7, US1 7, US2 4, US3 4, Polish 3).
