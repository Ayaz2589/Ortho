# Tasks: Dashboard specific-month picker

**Input**: Design documents from `/specs/011-dashboard-month-picker/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/dashboard-scope.md, quickstart.md
**Tests**: REQUIRED — Constitution VI (test-driven; date logic locked by golden vectors). Failing tests precede implementation.
**Organization**: by user story (US1 P1 → US2 P2 → US3 P3), after a foundational phase for the shared vectored date logic.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: parallelizable (different files, no incomplete dependency)
- Web and iOS tracks for the same story touch different files → run in parallel.

## Path Conventions

- Web: `web/` (Next.js + React + TS). iOS: `iOS/Ortho-iOS/` (SwiftUI). Shared vectors: `shared/test-vectors/`.

---

## Phase 1: Setup

**Purpose**: baseline green before any change.

- [x] T001 Confirm baseline on branch `011-dashboard-month-picker`: `cd web && npm test` green and `cd iOS && xcodebuild test -scheme Ortho-iOS` green; record current web/iOS test counts for the later PARITY.md bump.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the shared, mirrored, vector-locked pure date logic every story depends on. ⚠️ Complete before Phase 3.

- [x] T002 [P] Add an `availableMonths` vector block to `web/scripts/gen-vectors.ts` (cases: empty; single month; multiple months unsorted; duplicate-day same month; month-end `…T23:59:59Z` and month-start `…T00:00:00Z` boundary keyed by STRING slice; Dec→Jan year boundary) and run `cd web && npm run gen:vectors` to emit `shared/test-vectors/dashboard-month-scope.json`.
- [x] T003 [P] Write FAILING Vitest `web/test/dashboard/scope.test.ts` covering `availableMonths` (asserts every case in `shared/test-vectors/dashboard-month-scope.json`), `monthScopeInterval` (selectedMonth → `monthBounds`; null → `rangeInterval`), `monthReferenceDate` (15th 12:00 UTC), and `stepMonth` (adjacent + null at edges).
- [x] T004 Implement `availableMonths`, `monthScopeInterval`, `monthReferenceDate`, `stepMonth` (pure, reusing `monthBounds`/`rangeInterval`) in `web/components/dashboard/range.ts`; make T003 pass.
- [x] T005 [P] Write FAILING XCTest `iOS/Ortho-iOSTests/DashboardScopeParityTests.swift` asserting `shared/test-vectors/dashboard-month-scope.json` for `availableMonths`, plus mirrored `monthScopeInterval`/`monthReferenceDate`/`stepMonth`.
- [x] T006 Implement `availableMonths`/`monthScopeInterval`/`monthReferenceDate`/`stepMonth` in `iOS/Ortho-iOS/Features/Dashboard/DashboardRange.swift` (string-slice the ISO `date`; reuse `monthBounds`); make T005 pass.

**Checkpoint**: shared month logic identical web↔iOS and vector-locked.

---

## Phase 3: User Story 1 — View a specific month on the dashboard (P1) 🎯 MVP

**Goal**: the user can step/jump to any month the data spans and the dashboard's interval-driven cards show it.
**Independent test**: with multi-month data, pick a past month → net/spend-by-category/per-owner/top-merchants show that month; stepper disables at data edges.

- [x] T007 [P] [US1] Write FAILING Vitest `web/test/dashboard/useDashboardScope.test.tsx`: the scope hook exposes `{ range (persisted), selectedMonth (transient), availableMonths, activeInterval, referenceDate, setMonth, clearMonth }`; `setMonth` sets the interval to `monthBounds`, `clearMonth` returns to the relative interval.
- [x] T008 [P] [US1] Write FAILING Vitest `web/test/dashboard/MonthPicker.test.tsx`: stepper `‹`/`›` disabled at earliest/latest available month, label opens the month list, selecting a list item calls `onSelectMonth`; semantic buttons + accessible prev/next labels.
- [x] T009 [US1] Extend `web/lib/useDashboardRange.ts` into the single dashboard-scope source: keep the persisted `range`, add transient `selectedMonth` (`useState`, NOT localStorage), derive `availableMonths`/`activeInterval`/`referenceDate`, expose `setMonth`/`clearMonth`; make T007 pass.
- [x] T010 [US1] Create `web/components/dashboard/MonthPicker.tsx` — `‹ June 2026 ›` stepper + tap-to-open month list (reuse the filter month-list pattern), tokens-only, disabled edges via `--text-3`, `focus-visible` ring, ≥40px targets; make T008 pass.
- [x] T011 [US1] Render `MonthPicker` in `web/app/(app)/dashboard/page.tsx` (mobile) beside `RangePicker`; pass the hook's `activeInterval` to MonthSummary/SpendByCategory/PerOwnerBreakdown/TopMerchants.
- [x] T012 [US1] Render `MonthPicker` in `web/components/web/DashboardDesktop.tsx` beside the `Seg`; consume the SAME hook and DELETE the independent scope re-derivation (single source).
- [x] T013 [P] [US1] Write FAILING XCTest `iOS/Ortho-iOSTests/DashboardScopeStateTests.swift`: `AppState` exposes transient `dashboardSelectedMonth` + `availableMonths` + `activeInterval`/`referenceDate`; setting a month yields `monthBounds`, clearing returns to the relative interval; month is NOT written to `UserDefaults`.
- [x] T014 [US1] Add `dashboardSelectedMonth` (transient — not persisted) + `availableMonths` + `activeInterval`/`referenceDate` to `iOS/Ortho-iOS/App/AppState.swift`; make T013 pass.
- [x] T015 [US1] Add the iOS month control (`Features/Dashboard/MonthPicker.swift` or inline) — native stepper + `Menu`/list, disabled edges, ≥44px — and render it in `Features/Dashboard/DashboardView.swift` beside `rangePicker`; thread `activeInterval` into the four interval cards.

**Checkpoint**: US1 independently demoable on both surfaces.

---

## Phase 4: User Story 2 — Every month-aware card reflects the chosen month (P2)

**Goal**: Budget and Insights also retarget to the selected month (no card stuck on "this month").
**Independent test**: with a past month selected, Budget + Insights show that month; Daily-trend + Housing unchanged.

- [x] T016 [P] [US2] Write FAILING Vitest `web/test/dashboard/BudgetProgressCard.test.tsx`: with a selected month, the card computes spend over `monthBounds(selectedMonth)` (not the hardcoded current month).
- [x] T017 [P] [US2] Write FAILING Vitest `web/test/dashboard/InsightsCardStack.test.tsx`: with a selected month, `generateInsights` is called with the scoped `referenceDate` (mobile and desktop variants).
- [x] T018 [US2] Rewire `web/components/dashboard/BudgetProgressCard.tsx` to take the scoped month (use `monthBounds(selectedMonth)` when set, else current month); make T016 pass.
- [x] T019 [US2] Rewire `web/components/dashboard/InsightsCardStack.tsx` (and the desktop insights call in `DashboardDesktop.tsx`) to pass the scoped `referenceDate` into `generateInsights`; make T017 pass.
- [x] T020 [P] [US2] iOS: rewire `Features/Dashboard/BudgetProgressCard.swift` to the scoped month and the `InsightEngine(referenceDate:)` call site to the scoped reference date; add/extend XCTest mirroring T016/T017.

**Checkpoint**: dashboard is internally consistent for any selected month on both surfaces.

---

## Phase 5: User Story 3 — Coexist with the relative range, transient, lockstep (P3)

**Goal**: month selection complements the relative range, overrides until cleared, resets on relaunch; web mobile+desktop stay identical.
**Independent test**: choose a range chip → month clears; reload → relative range restored; resize across 1024px → same selection.

- [x] T021 [P] [US3] Write FAILING Vitest `web/test/dashboard/scope-exclusivity.test.tsx`: selecting a relative range clears `selectedMonth`; `clearMonth`/"Latest" returns to the relative view; after a remount (relaunch) `selectedMonth` is null while the persisted `range` is restored.
- [x] T022 [US3] Implement mutual exclusivity in `web/lib/useDashboardRange.ts` + the range picker wiring (choosing a relative range calls `clearMonth`) and a "Latest"/clear affordance in `MonthPicker.tsx`; confirm `selectedMonth` stays `useState` (never written to localStorage); make T021 pass.
- [x] T023 [US3] Verify and assert web lockstep: both `page.tsx` and `DashboardDesktop.tsx` read scope ONLY from the shared hook (no residual independent derivation) — add a test/assertion that both surfaces' selection derives from one source.
- [x] T024 [P] [US3] iOS: selecting a relative range clears `dashboardSelectedMonth`; add the "Latest"/clear affordance; confirm the month is never persisted to `UserDefaults`; XCTest mirroring T021.

**Checkpoint**: all three stories complete and consistent across surfaces.

---

## Phase 6: Polish & Cross-Cutting

- [x] T025 Update `PARITY.md`: add `| Dashboard month selection | ✅ | ✅ | — | components/dashboard/range.ts ↔ DashboardRange.swift (+ monthBounds → transaction-filters.json) |` immediately after the "Transaction filtering / listing" row; amend the "Apps only" surface-specific line (dashboard month/time-scoping is now a parity-locked sub-capability); bump the audit header date and the web/iOS test counts.
- [x] T026 Run `cd web && npm run gen:vectors`; confirm `shared/test-vectors/dashboard-month-scope.json` is the ONLY new/changed vector (no diff to `transaction-filters.json` etc.).
- [x] T027 Run full `cd web && npm test` and `cd iOS && xcodebuild test -scheme Ortho-iOS`; both green; record final counts into PARITY.md.
- [ ] T028 Manual quickstart walkthrough (both surfaces) per `quickstart.md` steps 1–7 (default, pick, step+clamp, return, transient, web lockstep, iOS↔web parity).

---

## Dependencies & Execution

- **Order**: Setup (T001) → Foundational (T002–T006) → US1 (T007–T015) → US2 (T016–T020) → US3 (T021–T024) → Polish (T025–T028).
- **Foundational blocks everything** (shared `availableMonths`/scope/stepper logic). US2 and US3 build on US1's scope state; US2 and US3 are independent of each other.
- **Parallel opportunities**:
  - Foundational: T002 ∥ T003 (then T004); T005 ∥ web track (then T006).
  - Each story runs a **web track ∥ iOS track** (different files): e.g. US1 {T007,T008,T009,T010,T011,T012} ∥ {T013,T014,T015}.
  - Per-card test/impl pairs in US2 are independent: T016/T018 ∥ T017/T019 ∥ T020.

## MVP

**User Story 1 alone** (T001–T015) is a shippable increment: a working month picker that retargets the four interval-driven cards on both surfaces. US2 (Budget/Insights consistency) and US3 (coexistence/transient/lockstep polish) layer on top.
