# Tasks: Goal Detail & Contribution Editing

**Feature dir**: `specs/049-goal-detail-contributions/` | **Branch**: `feat/049-goal-detail-contributions`
**Inputs**: plan.md, spec.md, research.md, data-model.md, contracts/goal-detail.md, quickstart.md
**Approach**: TDD (Constitution VI) — every behavior gets a failing test before the code that
satisfies it. The new date/money math (`goalSeries`) is unit + property tested; the FX round-trip
guard is tested at a rate where the round trip is provably lossy.

**Path conventions**: web app under `web/`; commands run from `web/`.

---

## Phase 1: Setup

- [X] T001 Create test dirs if missing: `web/test/goals/` (source dirs `web/lib/finance/`,
      `web/components/goals/` already exist; `web/components/goals/charts/` is new). No new
      dependencies — recharts is already installed.

---

## Phase 2: Foundational (blocking prerequisites for US2 and US3)

Pure logic and shared plumbing every later story leans on. Test-first.

- [X] T002 [P] Write failing unit + property tests in `web/test/finance/goalSeries.test.ts` per
      `contracts/goal-detail.md` C6: (a) `cumulativeSeries` is ascending by day and
      non-decreasing; (b) **its last point's `cumulativeCents` equals
      `goalProgress(target, contributions).saved_cents`** for arbitrary contribution sets
      (property); (c) two contributions on the same day collapse to ONE point carrying both;
      (d) `paceCents` is null throughout for an undated goal and, for a dated one, matches
      `goalPacing`'s `expected_cents` basis at the target date; (e) a single contribution still
      yields ≥2 points (leading zero at the goal's creation day); (f) `monthlySeries` is ascending,
      contiguous from earliest to latest contribution month with gaps filled at 0, and
      **`sum(cents)` equals `saved_cents`** (property); (g) empty input → `[]` from both.
- [X] T003 Implement `web/lib/finance/goalSeries.ts` (`CumulativePoint`, `MonthPoint`,
      `cumulativeSeries`, `monthlySeries`) per `data-model.md`. Pure, integer cents, injected
      `now`, local calendar-day indices via the same `dayIndex` rule as `goals.ts` so spans are
      timezone-stable. Make T002 pass.
- [X] T004 [P] Extract the query-string read from `web/lib/useMobileFormPage.ts` into
      `web/lib/useRouteSearch.ts` (`useRouteSearch(): string | undefined` — reads
      `window.location.search` once in a mount effect, `undefined` until read; NOT
      `useSearchParams`, per research R2). Have `useMobileFormPage` consume it. Its existing tests
      must stay green **unchanged** — this is a pure extraction with no behavior change.

**Checkpoint**: `npx vitest run test/finance/goalSeries.test.ts` green; `npx vitest run test/lib`
(or whichever suite covers `useMobileFormPage`) still green with no edits.

---

## Phase 3: User Story 1 — Per-goal cards on the Planning hub (Priority: P1) 🎯 MVP

**Goal**: The hub's Goals section is one `GoalCard` per goal — progress, saved-of-target,
remaining, pace, recent contributions — with actions to add a contribution or open the goal. The
"View all goals" index link is gone.

**Independent test**: With three goals, `/planning` shows three cards, off-track first; adding a
contribution from a card updates that card in place; no link points at a goals index.

- [X] T005 [US1] Write failing tests in `web/test/goals/goal-card.test.tsx` per C3: the card shows
      name, kind, `saved of target`, a `role="progressbar"` whose `aria-valuenow` is
      `round(fraction × 100)`, remaining-or-Reached, and at most `maxContributions` contributions
      newest-first (date desc, then `created_at` desc); a dated behind-pace goal shows the
      catch-up amount in `var(--accent)` and **never** red; an undated goal shows no pace line at
      all; `href` renders an "open goal" link to `/planning/goals?id=<goal id>`; the contribution
      edit/delete controls appear ONLY when their handlers are passed.
- [X] T006 [US1] Extend `web/components/goals/GoalCard.tsx` with `href`, `maxContributions`
      (default 3), `onEditContribution`, and `onDeleteContribution`; render the open-goal link and
      cap the ledger. Keep the existing progress/pacing rendering and the never-red rule. Make
      T005 pass.
- [X] T007 [US1] Update `web/test/web/planning-hub.test.tsx` per C2: the Goals section renders one
      `goal-card` per goal (off-track first), the empty household still shows `goals-empty` with
      zero cards, and **no link points at `/planning/goals` without an `?id=`** (the three current
      "View all goals" assertions are replaced, not deleted wholesale — the section must still be
      asserted present).
- [X] T008 [US1] Rewrite `web/components/planning/GoalsSummaryCard.tsx` to render `GoalCard`s from
      the goals + contributions it needs (dropping the internal `GoalRow` and the "View all goals"
      link), preserving the off-track-first order. Wire the contribution form on
      `web/app/(app)/planning/page.tsx` so "Add contribution" opens in place. Make T007 pass.

**Checkpoint**: `npx vitest run test/goals/goal-card.test.tsx test/web/planning-hub.test.tsx`
green; `/planning` shows one card per goal and no index link.

---

## Phase 4: User Story 2 — The goal detail page (Priority: P1)

**Goal**: `/planning/goals?id=<goalId>` is a page devoted to one goal — headline figures, pace,
the full contribution ledger, and two dynamically-loaded charts. Unresolvable ids return to
Planning.

**Independent test**: Open a valid id → that goal's figures and both charts, the cumulative
series ending exactly at the headline saved figure; open a missing/unknown id → back to
`/planning`, no error screen.

- [X] T009 [US2] Write failing tests in `web/test/goals/goal-detail-page.test.tsx` per C1: a valid
      `?id=` renders that goal's name, saved-of-target, progress, remaining, and (dated) target
      date + pace; no query string / blank id / unknown id / deleted-while-open each
      `router.replace('/planning')`; **nothing renders and NO redirect fires while `search` is
      undefined or the store is `loading`** (a refresh must not bounce before the goals arrive);
      a goal with no contributions renders the empty state, not a chart frame. Stub the chart
      leaves so this suite stays on the route contract.
- [X] T010 [US2] Implement `web/components/goals/GoalDetail.tsx` — headline saved-of-target,
      progress bar, remaining, pace status (reusing `goalProgress`/`goalPacing` unchanged), target
      date, edit-goal and delete-goal affordances reusing `GoalForm`, and the two chart slots with
      a calm empty state when there are no contributions.
- [X] T011 [US2] Repurpose `web/app/(app)/planning/goals/page.tsx` from the index list into the
      detail page: `useRouteSearch()` + `parseIdParam`, the loading/undefined guards, resolve the
      goal from the store, `router.replace('/planning')` on every unresolvable case, and render
      `GoalDetail`. Delete the all-goals list, its `PageHeader` "Goals" title, and the New-goal
      button (goal creation stays on the hub). Make T009 pass.
- [X] T012 [US2] [P] Implement the two recharts leaves —
      `web/components/goals/charts/GoalCumulativeChart.tsx` (cumulative saved in `--positive`,
      plus the pace line in a muted token, omitted when `paceCents` is null) and
      `web/components/goals/charts/GoalMonthlyChart.tsx` (one bar per month). Follow
      `SavingsRateChart.tsx`: `ResponsiveContainer`, no gridlines/axes/tooltip chrome,
      `isAnimationActive={false}`, token colors only, never red. Import them from `GoalDetail` via
      `next/dynamic`.
- [X] T013 [US2] [P] Extend `EAGER_DIRS` in `web/test/bundle/no-eager-recharts.test.ts` with
      `components/goals` and `components/planning` (they are unscanned today — research R3), and
      confirm the guard passes with the new leaves in place.
- [X] T014 [US2] [P] Update `web/components/skeletons/RouteSkeleton.tsx` and
      `web/test/skeletons/RouteSkeleton.test.tsx` so the `/planning/goals` skeleton matches a
      single-goal detail page rather than a list of goals.

**Checkpoint**: `npx vitest run test/goals test/bundle/no-eager-recharts.test.ts
test/skeletons/RouteSkeleton.test.tsx` green; `npm run build` still emits `/planning/goals`.

---

## Phase 5: User Story 3 — Edit or delete one contribution (Priority: P2)

**Goal**: From the detail page, a contribution's amount, date, and note can be corrected, or that
one contribution deleted, with every derived figure following exactly.

**Independent test**: Edit a $50 contribution to $75 → saved total rises by exactly $25 and both
charts follow; delete one → the total falls by exactly its amount and the goal survives.

- [X] T015 [US3] Write failing tests in `web/test/goals/contribution-store.test.tsx` per C5:
      `updateContribution` applies optimistically; it calls
      `supabase.from('goal_contributions').update(...).eq('id', …)`; the update payload's keys are
      a subset of `{ amount_cents, date, note }` (**`goal_id` must be absent** — an edit never
      re-parents); on error the previous row is restored and `error` is set.
- [X] T016 [US3] Add `updateContribution(c: GoalContribution)` to `web/lib/store.tsx` — declare it
      on `AppState`, implement it mirroring `updateGoal`'s optimistic-with-rollback shape, and
      expose it on the context value. Make T015 pass.
- [X] T017 [US3] Write failing tests in `web/test/goals/contribution-edit.test.tsx` per C4: edit
      mode pre-fills amount/date/note from the stored contribution; save calls
      `updateContribution` with the SAME `id`, `goal_id`, `created_by`, and `created_at`; a
      cleared or ≤0 amount blocks save and leaves the stored row untouched; **at GBP rate 0.78, an
      untouched amount saves the stored cents verbatim** (the round trip is lossy there —
      research R5); add mode is unchanged and still calls `addContribution` with a fresh uuid.
- [X] T018 [US3] Extend `web/components/goals/ContributionForm.tsx` with an `editing?:
      GoalContribution | null` prop: seed the fields from it, snapshot `originalAmountText` at
      open, and on save write the stored cents verbatim when the amount field is untouched
      (mirroring `useTxForm`'s `originalAmountCents`/`effectiveCents` guard) — otherwise parse.
      Title switches to `Edit contribution`. Make T017 pass.
- [X] T019 [US3] Implement `web/components/goals/ContributionLedger.tsx` — the full ledger on the
      detail page, newest first, each row with a real named edit `<button>` and delete
      `<button>` (≥40px hit target, keyboard reachable). Wire it plus the edit-mode
      `ContributionForm` into `GoalDetail`, and confirm the headline, progress, pace, and both
      charts all recompute from the edited ledger.

**Checkpoint**: `npx vitest run test/goals` green; editing a contribution moves the saved total by
exactly the difference.

---

## Phase 6: Polish & Cross-Cutting

- [X] T020 [P] Add `web/test/i18n/goal-detail-i18n.test.ts` (mirror the spec-044 guard): every new
      English string (detail-page chrome, chart captions, empty states, `Edit contribution`, the
      ledger's edit/delete labels, the card's open-goal label) is present in bn/es/ja/zh/ko with
      matching `{n}` placeholder arity; and the keys retired with the index page — at minimum
      `View all goals` — are **absent** from all five.
- [X] T021 Add every new key from T020 to `web/lib/i18n/{bn,es,ja,zh,ko}.ts` and REMOVE the retired
      ones. Reuse existing keys (`Goals`, `Contributions`, `Add contribution`, `Reached`,
      `{0} to go`, `of`, `Savings`, `Debt payoff`) rather than adding near-duplicates. Make T020
      pass — and note `catalog-reachability.test.ts` fails on any key left without a source
      literal, so the removals are mandatory.
- [X] T022 Run the full gate from `web/`: `npx tsc --noEmit` (UNPIPED — must be clean), then
      `npm test` (full suite green), then `npm run test:tz` (date-sensitive suites under a shifted
      timezone — `goalSeries` is new date math, so this lane matters).
- [X] T023 [P] Run `npm run gen:vectors` and confirm **no diff** in `shared/` —
      `goalProgress`/`goalPacing` are untouched and the new series are deliberately not vectored
      (research R6). A diff here means money math changed and the change must be justified, not
      committed silently.
- [X] T024 [P] Verify no stale references: `grep -rn "View all goals\|GoalRow" web/{app,components,lib,test}`
      returns nothing, and every `/planning/goals` reference either carries an `?id=` or is the
      route/skeleton itself.
- [X] T025 `npm run build` — the static export succeeds and still emits `/planning/goals`.
- [ ] T026 [P] Manual cross-canvas confirm per `quickstart.md` (all three stories, desktop +
      phone + dark mode, and the GBP round-trip check in step 20) — in a real browser before
      merge. No browser in the sandbox; matches the spec 043 T020 / spec 044 T050 precedent.

---

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational (T002–T004)**.
- **US1 (T005–T008)** depends only on Setup — `GoalCard` already exists. Ships alone as the MVP.
- **US2 (T009–T014)** depends on Foundational (`goalSeries` for the charts, `useRouteSearch` for
  the route guard) and on T006's `href` for the entry point.
- **US3 (T015–T019)** depends on US2 (T010/T011) — the ledger lives on the detail page.
- **Polish (T020–T026)** after the stories; T021's i18n removals depend on US1/US2 deleting the
  index copy.

## Parallel Opportunities

- T002 (`goalSeries` tests) ∥ T004 (`useRouteSearch` extraction) — different files.
- T005 (card tests) ∥ T002/T004 — US1 touches neither pure module.
- T012 (chart leaves) ∥ T013 (bundle guard) ∥ T014 (skeleton) — three separate files.
- T020 (i18n guard) ∥ T023 (vectors) ∥ T024 (grep verify).

## MVP Scope

**US1 (Phase 3)** — per-goal cards on the hub — is the smallest slice that delivers value alone:
it removes the duplicate listing and puts progress and actions where people already are, with no
new route and no new write path. US2 is the headline capability; US3 closes the correction dead
end and is the only phase that writes new data.

## Task Count

26 tasks — Setup 1, Foundational 3, US1 4, US2 6, US3 5, Polish 7.

---

## Implementation notes (where the build diverged from this plan, and why)

Recorded here rather than silently, so a reviewer reading plan.md against the diff is not
surprised.

- **T019 — no `ContributionLedger.tsx` was created.** The plan sketched a separate ledger
  component, but `GoalCard` already renders the contribution list; giving it
  `onEditContribution`/`onDeleteContribution` and an uncapped `maxContributions` turned the same
  list into the detail page's editable ledger. A second component would have been a copy of that
  markup with a different set of props, and the two could drift — the exact hazard R7 collapsed
  `GoalRow` into `GoalCard` to avoid.
- **Goal CREATION moved to the Planning hub.** The retired index page owned the "+ New goal"
  button. Not moving it would have left no way to create a goal at all. It now lives in the Goals
  section header, and `GoalsSummaryCard` owns the `GoalForm`/`ContributionForm` modals.
- **`MoneyInput` gained an `ariaLabel` prop.** `FieldRow`'s label is a plain `<span>` with no
  `for`, so the contribution amount field had no accessible name — a Principle V gap the edit-mode
  test surfaced. One prop, threaded through the contribution form.
- **The skeleton count changed hands.** `/planning/goals` is a single goal now, so `GoalsSkeleton`
  became a fixed detail shape and stopped taking `count`; the recorded goal count moved to
  `PlanningSkeleton`, which is where per-goal cards actually render. Both are pinned by updated
  tests.
- **Three more i18n keys were retired than T021 predicted.** `catalog-reachability` flagged
  `No goals yet`, `Name something you're saving toward…` (the index page's empty state) and
  `On track · due {0}` — the last being `GoalRow`'s wording for the state `GoalCard` calls
  `On pace · due {0}`, i.e. the drift R7 predicted, proven by the guard.
- **An extra timezone suite was added**: `test/finance/goal-series-timezone.tz.test.ts`.
  `goalSeries` is new calendar-day/month math and the default lane pins `TZ=UTC`, which hides that
  whole bug class. It caught a real ambiguity — the chart's anchor day must follow `goalPacing`'s
  LOCAL-getter reading of `created_at`, not the UTC day — now asserted explicitly.
