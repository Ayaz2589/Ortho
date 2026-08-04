---
description: "Task list for Planning Hub (spec 036)"
---

# Tasks: Planning Hub (top-level destination)

**Input**: Design documents from `specs/036-planning-hub/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/plan-summary.md

**Tests**: REQUIRED — the spec mandates full TDD (constitution VI). Every math task writes its
failing test first.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency)
- **[Story]**: US1..US5 per spec.md, or FOUND (foundational) / POLISH

All paths are under `web/`.

---

## Phase 1: Setup

- [ ] T001 Confirm Vitest runs locally (`cd web && npm test -- test/nav.test.tsx`) and, if in a
      Linux sandbox, install the native-binary shims from docs/web.md §16.

---

## Phase 2: Foundational — pure planning engine (BLOCKS all UI stories)

**⚠️ The hub math is the shared prerequisite for US2–US5. Write tests first; they MUST fail.**

- [ ] T002 [FOUND] Write failing tests `test/planning/planSummary.test.ts` covering the full
      contract in contracts/plan-summary.md: `currentMonthKey`, `stepMonthKey` (incl. year wrap +
      future), `planReferenceDate` + `monthElapsedFraction` (past/current/future with injected
      `now`), `paceState` (60%@10% → attention, 60%@90% → under, ≥100% → over, future w/ + w/o
      spend), `incomeForMonth`, `plannedGoalContributions`, `planHealth` (base-not-effective limits;
      left-to-plan identity), `rankAtRiskBudgets` (excludes non_monthly, capped at topN, ahead-of-
      pace first), `rankGoals` (off-track first, undated never off-track, suggested monthly),
      `sinkingFunds` (non_monthly only, setAside === carriedIn, empty when none), and
      `buildPlanSummary` determinism.
- [ ] T003 [P] [FOUND] Create `lib/planning/thresholds.ts` (`PLANNING = { topN: 4, attentionRatio:
      1.0 }`).
- [ ] T004 [FOUND] Implement `lib/planning/planSummary.ts` to green T002 — pure functions +
      exported types from data-model.md; delegate to `budgetStatusForMonth`, `goalProgress`,
      `goalPacing`, `contributionsByGoal`, `monthBounds`. No clock/network/random.
- [ ] T005 [FOUND] Run `npm test -- test/planning` + `npx tsc --noEmit`; confirm green.

**Checkpoint**: engine done and locked — UI stories can proceed.

---

## Phase 3: User Story 1 — Planning as a top-level destination (P1) 🎯 MVP

**Goal**: Planning is a real destination (tab + sidebar), old link redirects, removed from Settings,
hub links to Budgets/Goals.

**Independent Test**: nav shows Planning on both form factors; `/settings/planning` redirects; Settings
no longer lists Planning; hub renders and links to `/budgets` + `/goals`.

- [ ] T006 [US1] Extend `test/nav.test.tsx`: assert Sidebar and TabBar render a Planning link to
      `/planning` and mark it `aria-current="page"` when active. (Fails first.)
- [ ] T007 [P] [US1] Write `test/web/planning-hub.test.tsx` (skeleton): hub renders `t('Planning')`
      header and has "View all budgets" → `/budgets` and "View all goals" → `/goals` links; empty
      household shows calm empty states. (Fails first.)
- [ ] T008 [US1] Add Planning to `components/Sidebar.tsx` TABS (icon `Compass`, after Transactions).
- [ ] T009 [US1] Add Planning to `components/TabBar.tsx` TABS (same position/icon/label).
- [ ] T010 [P] [US1] Remove the Planning `LinkRow` from `app/(app)/settings/page.tsx`.
- [ ] T011 [P] [US1] Remove the Planning entry from `components/settings/SettingsSecondaryNav.tsx`.
- [ ] T012 [US1] Replace `app/(app)/settings/planning/page.tsx` with a client redirect to
      `/planning` (`router.replace` on mount, render null).
- [ ] T013 [US1] Create `app/(app)/planning/page.tsx` — `'use client'`, `PageHeader t('Planning')`,
      capped-width column, local month state (default `currentMonthKey(now)`), renders
      `PlanningMonthBar` + the four cards (cards added in later stories; stub the not-yet-built ones
      minimally so the page compiles and US1 tests pass).
- [ ] T014 [P] [US1] Create `components/planning/PlanningMonthBar.tsx` — prev/next month stepper
      (future allowed) + month label + "This month" reset; semantic buttons, focus ring, aria-labels.
- [ ] T015 [US1] Add a `'planning'` case to `components/skeletons/RouteSkeleton.tsx` (calm hero +
      two card placeholders) keyed on `/planning`.

**Checkpoint**: MVP — Planning is a first-class destination with working links and redirect.

---

## Phase 4: User Story 2 — Plan-health hero (P1)

**Goal**: "Left to plan" headline + income/budgeted/goals breakdown, month-scoped, attention (never
red) when over-committed.

**Independent Test**: with income/budgets/goals, hero shows left-to-plan = income − budgeted − goals
and the three components; over-committed reads as attention; changing month recomputes.

- [ ] T016 [US2] Add hero cases to `test/web/planning-hub.test.tsx`: renders left-to-plan and the
      three component amounts; over-committed month has no red/loss styling; stepping the month bar
      changes the figures. (Fails first.)
- [ ] T017 [US2] Create `components/planning/PlanHealthHero.tsx` — reads `useApp()` + month/now
      props, computes via `buildPlanSummary`/`planHealth`, renders the headline + breakdown; over-
      committed uses `--accent`/weight, never `--destructive`.
- [ ] T018 [US2] Wire the hero into `app/(app)/planning/page.tsx`.

**Checkpoint**: US1 + US2 working.

---

## Phase 5: User Story 3 — Pace-aware budget summary (P2)

**Goal**: overall pace bar + top at-risk categories (remaining/over, rollover carry), pace-colored,
"View all budgets"; calm empty state.

**Independent Test**: summary shows overall bar + at-risk rows; a 60%@early category reads attention;
carry shown; link works; no budgets → empty state.

- [ ] T019 [US3] Add budget-summary cases to `test/web/planning-hub.test.tsx`: overall bar present;
      at-risk rows with remaining/over; pace attention early-month; carried-in shown; empty state +
      link when no budgets. (Fails first.)
- [ ] T020 [US3] Create `components/planning/BudgetSummaryCard.tsx` — reuses BudgetsBody bar
      vocabulary; consumes `BudgetSummary` from the engine; "View all budgets" `Link`.
- [ ] T021 [US3] Wire the budget card into `app/(app)/planning/page.tsx`.

**Checkpoint**: US1–US3 working.

---

## Phase 6: User Story 4 — Goals summary (P2)

**Goal**: per-goal progress/status/projection + suggested monthly when behind; behind-first; "View
all goals"; calm empty state.

**Independent Test**: goals show progress + saved/target + on/off-track + due/projected; behind goal
shows suggested monthly and sorts first; undated goal neutral; link works; no goals → empty state.

- [ ] T022 [US4] Add goals-summary cases to `test/web/planning-hub.test.tsx`: progress + status;
      behind goal first + suggested monthly; undated neutral; empty state + link. (Fails first.)
- [ ] T023 [US4] Create `components/planning/GoalsSummaryCard.tsx` — reuses GoalsBody vocabulary;
      consumes `GoalsSummary`; "View all goals" `Link`.
- [ ] T024 [US4] Wire the goals card into `app/(app)/planning/page.tsx`.

**Checkpoint**: US1–US4 working.

---

## Phase 7: User Story 5 — Sinking-funds panel (P3)

**Goal**: non-monthly categories with set-aside amount; omitted when none.

**Independent Test**: with a non_monthly budget carrying money, panel lists it with set-aside; with
none, panel absent.

- [ ] T025 [US5] Add sinking-funds cases to `test/web/planning-hub.test.tsx`: panel lists non_monthly
      set-aside; absent when none. (Fails first.)
- [ ] T026 [US5] Create `components/planning/SinkingFundsPanel.tsx` — consumes `SinkingFund[]`;
      returns null when empty.
- [ ] T027 [US5] Wire the panel into `app/(app)/planning/page.tsx`.

**Checkpoint**: all stories working.

---

## Phase 8: Polish & cross-cutting

- [ ] T028 [POLISH] Add all new English strings and translate them in the 5 catalogs
      (`lib/i18n/{bn,es,ja,zh,ko}.ts`): e.g. "Planning" (exists), "Left to plan", "Budgeted",
      "Goal contributions", "View all budgets", "View all goals", "Set aside", "Sinking funds",
      "On track", "Behind pace", "Ahead of pace", "This month", "Projected", "Nothing to plan yet",
      plus any new budget/goal empty-state and label strings. Reuse existing keys where identical.
- [ ] T029 [P] [POLISH] Verify design-system guards: `npm test -- test/tokens-only-backgrounds.test.ts`;
      manually confirm no red for loss/cost, no shadow on inset cards, focus rings, capped width.
- [ ] T030 [P] [POLISH] Update `docs/web.md` §2 route tree + destination count (four → five) and note
      the Planning hub; update root `CLAUDE.md` active-feature pointer to spec 036.
- [ ] T031 [POLISH] Full gate: `npm test` green, `npx tsc --noEmit` clean, run quickstart.md checks.

---

## Dependencies & Execution Order

- **Phase 2 (engine) BLOCKS US2–US5** (they consume `buildPlanSummary`). US1 (nav/route/redirect)
  depends only on a compiling page shell, so it can start alongside Phase 2 but its hub-content tests
  (T007) settle once cards land.
- Within each story: tests first (must fail), then implementation, then wire into the page.
- i18n (T028) after the UI strings exist; docs (T030) after behavior is final.

### Parallel opportunities

- T003 ∥ T002-authoring; T010 ∥ T011; T014 ∥ T008/T009; card components across stories are separate
  files (T020/T023/T026 [P]) once the engine (Phase 2) is green.

## Implementation Strategy

MVP = Phase 1 + 2 + US1 (Planning reachable, redirect, links). Then layer US2 (hero) → US3
(budgets) → US4 (goals) → US5 (sinking funds), each test-first and independently verifiable, then
Polish (i18n, guards, docs, full gate).
