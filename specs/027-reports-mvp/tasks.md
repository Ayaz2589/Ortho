---

description: "Task list for Reports MVP implementation"
---

# Tasks: Reports MVP

**Input**: Design documents from `specs/027-reports-mvp/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/reports-views.md

**Tests**: REQUIRED. This feature is developed **fully test-first** (constitution Principle VI
+ requester mandate): for every unit, write a failing test (RED), implement to green (GREEN),
then refactor. Never write implementation before a failing test exists.

**Organization**: Grouped by user story. US1 (savings-rate) is the MVP; US2 (category
deep-dive) is an independent increment.

**Path base**: all paths under `web/` (the single canonical implementation).

## Conventions

- Pure logic → `web/lib/reports/*`, tested in node env (`web/test/reports/*.test.ts`).
- Views/hook → `web/components/dashboard/*`, `web/lib/useReportsData.ts`, tested in jsdom
  (`// @vitest-environment jsdom`), mocking `@/lib/api/aggregates` + `@/lib/store`.
- recharts only inside `web/components/dashboard/charts/*` reached via `next/dynamic`.
- Run `cd web && npm test` and `npx tsc --noEmit` after each GREEN step.

---

## Phase 1: Setup

- [ ] T001 Confirm on branch `feat/reports-mvp`, `web` deps installed, and the local Supabase
  stack has the aggregate RPCs applied (`supabase/migrations/20260611120000_aggregates.sql`);
  baseline `cd web && npm test` green before starting (per quickstart.md).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pure derivation helpers, the on-demand data hook, and the mode toggle — all
shared by both user stories. **⚠️ No user story work begins until this phase is complete.**

### Pure helpers (RED → GREEN)

- [ ] T002 [P] RED: write failing unit tests for `monthsInInterval` in
  `web/test/reports/months.test.ts` — asserts a 1-month interval → one window; a 6-month
  interval → 6 contiguous, non-overlapping, month-aligned windows oldest→newest; last
  window's `end` equals the interval `end` (per contracts/reports-views.md).
- [ ] T003 [P] RED: write failing unit tests for `savingsRate` + `buildSavingsSeries` in
  `web/test/reports/savings.test.ts` — `(income−expense)/income`; negative for shortfall;
  `null` when `income <= 0` (no NaN/Infinity); series has one row per window with a `{0,0,0}`
  summary → `{incomeCents:0, expenseCents:0, rate:null}` (empty month present, not omitted).
- [ ] T004 [P] RED: write failing unit tests for `rankCategories` in
  `web/test/reports/categories.test.ts` — drops non-positive cents; sorts by cents desc;
  `share = cents/total`; empty/all-zero → `[]`; shares sum to 1.0 (± rounding).
- [ ] T005 [P] GREEN: implement `web/lib/reports/months.ts` (`MonthWindow`,
  `monthsInInterval`) — UTC month bounds consistent with `monthBounds` — until T002 passes.
- [ ] T006 [P] GREEN: implement `web/lib/reports/savings.ts` (`SavingsRateRow`, `savingsRate`,
  `buildSavingsSeries`) until T003 passes.
- [ ] T007 [P] GREEN: implement `web/lib/reports/categories.ts` (`RankedCategory`,
  `rankCategories`) until T004 passes.

### On-demand data hook (RED → GREEN)

- [ ] T008 RED: write failing hook test `web/test/reports/useReportsData.test.ts` (jsdom,
  mocking `@/lib/api/aggregates`) — asserts: on given interval it calls `fetchCategoryTotals`
  once + `fetchMonthSummary` once per month; exposes `status:'loading'→'ready'`; a rejected
  fetch → `status:'error'` (never throws); `retry()` re-issues; no fetch when `householdId`
  falsy.
- [ ] T009 GREEN: implement `web/lib/useReportsData.ts` (`useReportsData(householdId,
  interval)` → `{status, savings, categories, retry}`, parallel fetch via `monthsInInterval`)
  until T008 passes. Reuses `fetchMonthSummary`/`fetchCategoryTotals` from
  `web/lib/api/aggregates.ts` (first product consumer — the "wiring").

### Mode toggle (RED → GREEN)

- [ ] T010 RED: write failing component test `web/test/dashboard/mode-switch.test.tsx` —
  `ModeSwitch` renders two real buttons (Overview/Reports), active has
  `aria-pressed`/`aria-current`, keyboard reachable, calls `onChange`.
- [ ] T011 GREEN: implement `web/components/dashboard/ModeSwitch.tsx` (tokens only, sand focus
  ring) until T010 passes.

**Checkpoint**: helpers + hook + toggle exist and are green; user stories can begin.

---

## Phase 3: User Story 1 — Savings-rate over time (Priority: P1) 🎯 MVP

**Goal**: In Reports, show per-month income/expense/savings-rate with a calm dynamic-imported
time-series chart; reachable via the Dashboard mode toggle.

**Independent Test**: With a seeded household, open Dashboard → Reports; the savings-rate view
lists one entry per in-scope month with income, expense, and rate; changing the range
re-scopes; a shortfall reads via sign (never red); a zero-income month shows "—".

### Tests (RED) ⚠️ write first, ensure they FAIL

- [ ] T012 [P] [US1] RED: `web/test/reports/SavingsRateView.test.tsx` — `ready` renders one
  row per month (month · income · expense · rate) with `formatMoney` + tabular figures; a
  negative rate uses sign/label (assert no red/`--destructive` token); `rate===null` → "—";
  `loading`/`empty`/`error` render plainspoken lines (no shimmer, no red) and `error` shows a
  Retry button. Mocks `@/lib/store` (`formatMoney`, `t`) and the chart leaf.
- [ ] T013 [P] [US1] RED: `web/test/reports/ReportsView.test.tsx` — renders the range picker
  from `rangeOptions`, threads `useReportsData` status into `SavingsRateView`, width
  capped/centered; changing range triggers a re-fetch. (Category section asserted in US2.)

### Implementation (GREEN)

- [ ] T014 [US1] GREEN: create `web/components/dashboard/charts/SavingsRateChart.tsx` — a
  recharts time-series leaf (`{label, rate}[]`, tokens: `--positive`/`--text`, no gridlines/
  axes chart-junk, `isAnimationActive={false}`), imported ONLY via `next/dynamic`.
- [ ] T015 [US1] GREEN: implement `web/components/dashboard/SavingsRateView.tsx` — per-month
  rows + dynamic-imported `SavingsRateChart`; loading/empty/error states + Retry — until T012
  passes.
- [ ] T016 [US1] GREEN: implement `web/components/dashboard/ReportsView.tsx` — range picker
  (reuse `RangePicker` + `scope.rangeOptions`) + `useReportsData` + `SavingsRateView`; capped/
  centered width — until T013 passes.
- [ ] T017 [US1] Wire the mode into `web/app/(app)/dashboard/page.tsx`: `mode` state (default
  `'overview'`), render `ModeSwitch`; `mode==='reports'` → `<ReportsView scope=…/>`, else the
  existing mobile stack / `DashboardDesktop` branch unchanged.
- [ ] T018 [US1] Pass the `ModeSwitch` node into `web/components/web/DashboardDesktop.tsx`
  (minimal prop) so the toggle appears on expanded layouts without duplicating the
  composition; `DashboardDesktop` overview content otherwise unchanged.
- [ ] T019 [US1] Extend `web/test/dashboard/mode-switch.test.tsx` (or a page-level test) to
  assert switching Overview↔Reports swaps content in place and returns Overview unchanged
  (FR-002, FR-013); ensure it passes.

**Checkpoint**: US1 fully functional and independently demoable — the MVP.

---

## Phase 4: User Story 2 — Category deep-dive (Priority: P2)

**Goal**: In Reports, show total spend per category for the window as the calm donut + ranked
legend (category · amount · share), highest first.

**Independent Test**: With a seeded household, open Reports; the category view shows one legend
entry per category with spend, ordered by amount desc, with amount + share; a no-expense
window shows a plainspoken empty line, not an empty chart.

### Tests (RED) ⚠️ write first, ensure they FAIL

- [ ] T020 [P] [US2] RED: `web/test/reports/CategoryDeepDiveView.test.tsx` — `ready` renders a
  legend entry per ranked category (label · `formatMoney` amount · share%), highest first,
  reusing `categoryMeta` tint; `empty` (no expense) → plainspoken line, not a chart;
  `loading`/`error` (+Retry) states, no red/shimmer. Mocks `@/lib/store` + the donut leaf.

### Implementation (GREEN)

- [ ] T021 [US2] GREEN: implement `web/components/dashboard/CategoryDeepDiveView.tsx` — reuse
  the existing dynamic-imported `charts/CategoryPie` donut + a ranked legend from
  `rankCategories` (+ optional "Other" bucket beyond top N, mirroring `SpendByCategoryCard`) —
  until T020 passes.
- [ ] T022 [US2] Add `<CategoryDeepDiveView>` to `web/components/dashboard/ReportsView.tsx`
  below the savings-rate view; extend `web/test/reports/ReportsView.test.tsx` to assert both
  views render and both re-scope on range change.

**Checkpoint**: US1 + US2 both work independently within Reports.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T023 [P] Add all new user-facing strings to every i18n catalog
  (`web/lib/i18n/{es,ja,zh,ko,bn}.ts` + English source) so `test/i18n/catalog-reachability`
  and `test/i18n/render-locale` stay green (FR-014); no English leak on the reports surface.
- [ ] T024 Extend `web/test/bundle/no-eager-recharts.test.ts` to confirm the new
  `charts/SavingsRateChart.tsx` is reached only via `next/dynamic` and no eager reports module
  imports recharts (FR-012, SC-006).
- [ ] T025 [P] Reconcile `PARITY.md` (add a Reports-MVP row: `aggregates.ts` now partially
  wired via the reports surface; note the `fetchOwnerSpend` `person_id`/`user_id` mismatch as
  a known, unfixed divergence) and update `docs/web.md` §4 (aggregates.ts is no longer
  "documented-unwired" — it is wired by the on-demand reports surface; §5 key-files note).
- [ ] T026 Full gate: `cd web && npm test` green + `npx tsc --noEmit` clean; run the
  quickstart.md manual walkthrough (or `npm run dev` smoke) at compact/medium/expanded widths;
  confirm no red/shimmer states and shortfall reads via sign (SC-005, SC-007).

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)** blocks everything.
- **Phase 3 (US1)** and **Phase 4 (US2)** both depend only on Phase 2; US2 does not depend on
  US1 (each view is independently testable), but US1 ships the `ReportsView` shell + page
  wiring that US2 extends, so in single-developer order do US1 then US2.
- **Phase 5 (Polish)** after the stories it covers.

### Within each unit (TDD, NON-NEGOTIABLE)

- The RED test task precedes its GREEN implementation task; the test must fail first, then
  pass. Refactor only with green tests. Commit after each logical RED→GREEN group.

### Parallel opportunities

- T002/T003/T004 (RED pure tests) in parallel; then T005/T006/T007 (GREEN) in parallel.
- T012/T013 (US1 RED) in parallel; T020 (US2 RED) independent.
- T023/T025 (docs/i18n) in parallel during polish.

---

## Implementation Strategy

### MVP first (US1 only)

1. Phase 1 Setup → Phase 2 Foundational (helpers + hook + toggle).
2. Phase 3 US1 → **STOP & VALIDATE**: savings-rate reachable and correct, Overview intact.
3. Demo-ready MVP.

### Incremental

4. Phase 4 US2 (category deep-dive) → validate.
5. Phase 5 polish (i18n, bundle guard, PARITY/docs, full gate).
