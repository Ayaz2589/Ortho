---
description: "Task list for Savings & Debt-Payoff Goals (spec 027)"
---

# Tasks: Savings & Debt-Payoff Goals

**Input**: Design documents in `specs/027-savings-goals/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: REQUIRED and TDD-first — the spec and the constitution (Principle VI)
mandate a failing test before the code that satisfies it. For the pure math engine,
**golden vectors are written and locked before implementation**. Order within each
unit: RED (failing test) → GREEN (minimal impl) → refactor.

**Format**: `[ID] [P?] [Story] Description`. `[P]` = different files, no dependency.

---

## Phase 1: Setup

- [ ] T001 Confirm local stack + web deps: `supabase db reset` applies existing
  migrations; `cd web && npm install` (add Linux-arm64 bindings per `docs/web.md` §8
  if needed); `npm test` + `npx tsc --noEmit` green **before** any change (baseline).

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ Blocks all user stories — schema + types + load path must exist first.**

- [ ] T002 [P] Write the migration
  `supabase/migrations/20260718120000_savings_goals.sql`: `goal_kind` enum;
  `goals` + `goal_contributions` tables; `touch_updated_at` trigger on `goals`;
  indexes; member RLS (`goals`) + parent-`EXISTS` RLS (`goal_contributions`);
  explicit `authenticated` grants. Per `contracts/goals-schema.md`. Verify with
  `supabase db reset` (clean apply on the local PG17 stack).
- [ ] T003 [P] Add domain types to `web/lib/types.ts`: `GoalKind`, `Goal`,
  `GoalContribution` (per data-model.md). No behavior yet.
- [ ] T004 [P] Add load-boundary `GoalRow`, `GoalContributionRow` to
  `web/lib/supabase/rows.ts` mirroring the columns exactly.
- [ ] T005 Wire the data layer in `web/lib/store.tsx`: `goals` / `goalContributions`
  state; add two `loadAll` fan-out selects (`goals`, `goal_contributions`,
  ordered), assert to the `*Row` types, reset both on sign-out; expose them + the
  (still-stub) CRUD in the context type. (Depends on T003, T004.)

**Checkpoint**: schema applies, types compile, goals load (empty). `npx tsc --noEmit`
green.

---

## Phase 3: User Story 1 — Create a goal, see progress (P1) 🎯 MVP

**Goal**: A member creates a goal and sees saved / remaining / fraction / reached.
**Independent Test**: create + two contributions → correct progress; over-funded
never negative/over-100%.

### Tests first (RED)

- [ ] T006 [P] [US1] Write the golden vectors: add the `progress` section to
  `web/scripts/gen-vectors.ts` (cases per `contracts/goals-engine.md`), and
  `web/test/goals.parity.test.ts` asserting `shared/test-vectors/goals.json`
  `progress` cases. **Author the expected values by hand first** in
  `web/test/goals.unit.test.ts` (hand-derived: empty, single, multi-under, exactly
  reached, over-funded, debt-payoff, non-positive-target guard). Run → FAIL (no
  engine yet).
- [ ] T007 [P] [US1] Write `web/test/goals/GoalCard.test.tsx` (jsdom): renders
  saved/target/remaining/fraction, "reached" state, calm styling (no `critical`/red
  token). Run → FAIL.
- [ ] T008 [P] [US1] Write `web/test/store/goals.store.test.ts`: `addGoal` /
  `addContribution` / `deleteContribution` optimistic update + rollback on Supabase
  error (via `test/helpers/supabase-mock.ts`). Run → FAIL.

### Implementation (GREEN)

- [ ] T009 [US1] Implement `goalProgress(targetCents, contributions)` in
  `web/lib/finance/goals.ts` per the contract; `npm run gen:vectors`; review the
  `goals.json` diff; T006 + unit progress cases pass.
- [ ] T010 [US1] Implement store mutators in `web/lib/store.tsx`: `addGoal`,
  `updateGoal`, `deleteGoal`, `addContribution`, `deleteContribution`
  (optimistic-with-rollback, budgets/transactions precedent). T008 passes.
- [ ] T011 [P] [US1] Build `web/components/goals/GoalCard.tsx` (calm progress view:
  headline money, hairline progress bar using `--positive`, remaining, reached,
  tabular `formatMoney`) and `web/components/goals/GoalForm.tsx` +
  `ContributionForm.tsx` (labelled inputs, cents via the money helpers). T007 passes.
- [ ] T012 [US1] Add `web/app/(app)/goals/page.tsx` (`ReadingColumn`, list of
  `GoalCard`, add-goal + add-contribution flows) and a **Goals** row in
  `web/app/(app)/settings/page.tsx` linking to `/goals` (budgets precedent).
- [ ] T013 [P] [US1] Add goal UI + form strings to all six i18n catalogs
  (`web/lib/i18n/*`); keep `catalog-reachability` green.

**Checkpoint**: US1 fully functional; `npm test` + `tsc` green. MVP deployable.

---

## Phase 4: User Story 2 — Off-track insight (P2)

**Goal**: A dated, behind-pace, unreached goal surfaces exactly one calm off-track
insight suggesting a monthly contribution.
**Independent Test**: behind→flagged; on-pace/reached/date-less→not; past-due→flagged.

### Tests first (RED)

- [ ] T014 [P] [US2] Extend the vectors: add the `pacing` section to
  `gen-vectors.ts` + `goals.parity.test.ts` (cases per `contracts/goals-engine.md`:
  no-date, on-pace, behind, marginally-behind, reached, past-due, span≤0, rounding).
  Hand-derive expected `GoalPacing` in `goals.unit.test.ts` first. Run → FAIL.
- [ ] T015 [P] [US2] Add an insight-assembly test to `goals.unit.test.ts`:
  `goalOffTrackInsight` returns `null` when on-track/reached/date-less; else an
  `Insight` with id `goal-offtrack-<id>`, severity `warning` (**never** `critical`),
  `magnitude_cents === shortfall`, `category === linked_category ?? null`. Assert
  `compareInsights` ordering. Run → FAIL.

### Implementation (GREEN)

- [ ] T016 [US2] Add `web/lib/finance/goals-thresholds.ts` (`GOAL_THRESHOLDS`).
- [ ] T017 [US2] Implement `goalPacing`, `goalOffTrackInsight`, `goalInsights` in
  `web/lib/finance/goals.ts`; export `compareInsights` from
  `web/lib/finance/insights.ts` (extract the inline sort — **no** change to
  `insights.json`). `npm run gen:vectors`; review diff; T014/T015 pass.
- [ ] T018 [US2] Merge goal insights into the two consumers
  (`components/dashboard/InsightsCardStack.tsx`,
  `components/web/DashboardDesktop.tsx`): compute `goalInsights(...)`, concat with
  `generateInsights(...)`, sort via `compareInsights`, slice to the display limit;
  add the `'target'` icon to the `InsightsCardStack` icon map.
- [ ] T019 [P] [US2] Add off-track insight strings (title/body incl. suggested
  monthly + formatted date) to all six i18n catalogs.
- [ ] T020 [P] [US2] Show pace status on `GoalCard` for dated goals (on pace /
  behind by X / due date), calm — extend `GoalCard.test.tsx`.

**Checkpoint**: US1 + US2 work; the 8 base insight rules unchanged (`insights.json`
byte-stable); `npm test` + `tsc` green.

---

## Phase 5: User Story 3 — Manage goals (P3)

**Goal**: edit target/name/date/association, delete goal (+cascade), remove a
contribution.
**Independent Test**: edit target recomputes progress/pace; delete removes goal +
contributions for all members; remove contribution lowers saved.

### Tests first (RED)

- [ ] T021 [P] [US3] Extend `goals.store.test.ts`: `updateGoal` (target change →
  recompute), `deleteGoal` (removes goal + its contributions from state), rollback
  paths. Run → FAIL for anything not yet wired.

### Implementation (GREEN)

- [ ] T022 [US3] Ensure edit/delete flows are surfaced in `GoalForm`/`goals/page.tsx`
  (edit an existing goal, delete with confirm; remove a contribution). Reuse the
  T010 mutators. T021 passes.

**Checkpoint**: all three stories independently functional.

---

## Phase 6: Polish & Reconciliation (Cross-Cutting)

- [ ] T023 [P] Update `PARITY.md`: add the **Goals** capability row
  (web ✅ / CLI — / source `lib/finance/goals.ts` → `goals.json`), a regression-core
  bullet, and bump the "last reconciled" note to spec 027.
- [ ] T024 [P] Docs: `docs/supabase.md` (new tables/enum + migration-history row),
  `docs/web.md` (goals route/store/engine), `docs/finance.md` (the goals engine +
  vectors), `docs/index.md` (one-line mention), `docs/shared.md` (12th vector file),
  and `shared/test-vectors/README.md` if it enumerates files.
- [ ] T025 [P] Mark §3.1 delivered in `FUTURE-TASKS.md` /
  `docs/future_tasks/3.1-savings-debt-payoff-goals.md` (point at spec 027).
- [ ] T026 Full gate: `cd web && npm test && npx tsc --noEmit`; confirm the
  vector-drift check is green (`goals.json` matches the engine) and `insights.json`
  is unchanged. Run the `quickstart.md` validation checklist.

---

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational (T002–T005)** blocks everything.
- **US1 (T006–T013)** is the MVP; do first. Tests (T006–T008) before impl
  (T009–T013).
- **US2 (T014–T020)** depends on the US1 engine file existing (adds functions to
  `goals.ts`) and the store/consumers.
- **US3 (T021–T022)** depends on US1 mutators.
- **Polish (T023–T026)** last.

### Parallel opportunities

- T002/T003/T004 [P] (different files). T006/T007/T008 [P]. T023/T024/T025 [P].
- Within a story, write all its RED tests together, then implement.

## Implementation Strategy

MVP = Phase 1 + 2 + US1 (a working goals surface with correct progress). Then US2
(the insight), then US3 (management), then reconcile docs/PARITY. Commit after each
GREEN checkpoint. Never write engine code before its failing vector/unit test
exists; regenerate vectors only after reviewing the diff as a behavior change.
