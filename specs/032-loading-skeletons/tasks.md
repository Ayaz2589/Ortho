# Tasks: Content-shaped loading skeletons

**Feature**: `specs/032-loading-skeletons` | **Branch**: `032-loading-skeletons`

**Input**: plan.md, spec.md, research.md, data-model.md, contracts/skeleton-components.md, quickstart.md

**Tests**: REQUIRED — Constitution Principle VI (Test-Driven & Regression-Safe) is
NON-NEGOTIABLE, so each behavior gets a failing test before its implementation.

**Paths**: all under `web/` (the single canonical project).

## Conventions

- `[P]` = can run in parallel (different files, no incomplete dependency).
- `[US1|US2|US3]` = the user story a task serves. Setup / Foundational / Polish carry no story label.
- Run `npm test` (UTC) and `npx tsc --noEmit` from `web/`.

---

## Phase 1: Setup

- [X] T001 Confirm baseline is green before touching anything: from `web/`, run `npx tsc --noEmit` and `npm test` and note the passing counts (records the pre-change baseline for the PR; installs native Linux bindings first if needed per `docs/web.md` §16).

---

## Phase 2: Foundational (blocking prerequisites for all stories)

The `Skeleton` primitive and the `skeletonCounts` helper are used by every user story and MUST land first.

- [X] T002 [P] Write failing unit tests for the counts helper in `web/test/skeletons/skeletonCounts.test.ts` — cover: absent key → fallback; write/read round-trip; clamp-on-write to `SKELETON_COUNT_CAP`; reject invalid stored values (string, negative, `NaN`, float, null) → fallback; corrupt JSON blob → fallback (no throw); `write` preserves other keys; storage `getItem`/`setItem` throwing is swallowed (read→fallback, write→no-op). (Contract §1.)
- [X] T003 [P] Write failing tests for the primitive in `web/test/skeletons/Skeleton.test.tsx` (`// @vitest-environment jsdom`) — cover: renders a block whose inline background is `var(--chip-bg)`; has NO `animate-pulse` class and no gradient (motionless); carries `aria-hidden="true"`; is not focusable / not a button or link; honors `width`/`height`/`radius` props. (Contract §2, FR-008, FR-012.)
- [X] T004 Implement `web/lib/skeletonCounts.ts` — export `SkeletonCountKey`, `SKELETON_COUNT_CAP = 24`, `readSkeletonCount(key, fallback)`, `writeSkeletonCount(key, n)` per data-model.md validation/clamp rules; never throws; storage-unavailable safe. Make T002 pass.
- [X] T005 Implement `web/components/ui/Skeleton.tsx` — token-only static `Skeleton` block (`background: var(--chip-bg)`, radius, width/height via inline style, `aria-hidden`) plus `SkeletonText({ lines })` convenience wrapper; no animation. Make T003 pass.

**Checkpoint**: primitive + helper exist and are green — user-story work can begin.

---

## Phase 3: User Story 1 — Route-shaped shell skeletons (Priority: P1) 🎯 MVP

**Goal**: While the store bootstraps, each core route shows a skeleton matching its layout shape
instead of the centered "Loading…" string. Uses per-surface DEFAULT sizes (remembered counts come
in US2).

**Independent test**: Hold the store in `loading`, navigate to each route, confirm a
route-appropriate skeleton renders (not "Loading…") and is replaced by real content on resolve.

- [X] T006 [P] [US1] Write failing dispatcher tests in `web/test/skeletons/RouteSkeleton.test.tsx` (`jsdom`, mock `usePathname` from `next/navigation`) — each known path (`/dashboard`, `/transactions`, `/housing`, `/budgets`, `/goals`, `/settings`, `/settings/household`) renders its corresponding skeleton (assert a stable `data-testid` per skeleton); an unknown path renders a generic skeleton; NO node renders the visible text "Loading…"; the container exposes `role="status"` + `aria-busy="true"`. (Contract §3–§4.)
- [X] T007 [P] [US1] Create `web/components/skeletons/DashboardSkeleton.tsx` — fixed shape mirroring the dashboard (summary card + widget cards) using `Skeleton`; wrap in the `role="status"` busy region with a visually-hidden "Loading" label; `data-testid="skeleton-dashboard"`.
- [X] T008 [P] [US1] Create `web/components/skeletons/TransactionsSkeleton.tsx` — ledger shape (a couple of day-header placeholders + N transaction-row placeholders); accept a `count` prop, default ≈ 8, render `max(1, count)` rows; `data-testid="skeleton-transactions"`.
- [X] T009 [P] [US1] Create `web/components/skeletons/HousingSkeleton.tsx` — property-card shape; `count` prop default ≈ 2, render `max(1, count)`; wrapped in `ReadingColumn`; `data-testid="skeleton-housing"`.
- [X] T010 [P] [US1] Create `web/components/skeletons/BudgetsSkeleton.tsx` — fixed shape sized from `CATEGORY_GROUPS.expense` (group captions + rows), inside `ReadingColumn`; `data-testid="skeleton-budgets"`.
- [X] T011 [P] [US1] Create `web/components/skeletons/GoalsSkeleton.tsx` — goal-card shape; `count` prop default ≈ 3, render `max(1, count)`; inside `ReadingColumn`; `data-testid="skeleton-goals"`.
- [X] T012 [P] [US1] Create `web/components/skeletons/SettingsSkeleton.tsx` — fixed shape (section cards + link rows) inside `ReadingColumn`; `data-testid="skeleton-settings"`.
- [X] T013 [US1] Create `web/components/skeletons/RouteSkeleton.tsx` — read `usePathname()`, dispatch to the matching skeleton (prefix-match `/settings`), generic calm fallback otherwise; pass per-surface DEFAULT counts for now (US2 swaps in remembered counts). Make T006 pass.
- [X] T014 [US1] Wire into `web/app/(app)/layout.tsx` `Shell`: replace the `loading ? (<div>…{t('Loading…')}</div>)` branch with `<RouteSkeleton />`; keep the paywall (`gateState === 'lapsed'`), biometric-lock (`!active`), and error-banner + Retry precedence exactly as today (skeleton must not mask lapsed/locked/failed). (FR-001, FR-009, FR-011.)

**Checkpoint**: MVP — every core route shows a shaped, motionless skeleton; no "Loading…" string on core routes.

---

## Phase 4: User Story 2 — Skeletons sized to the last successful load (Priority: P2)

**Goal**: List/table skeletons render approximately the number of items seen at the end of the
previous successful load, persisted across reloads; first-ever load uses the default.

**Independent test**: Load a list screen with a known item count (records it), hold `loading`,
reload → the skeleton renders ~that many placeholders (capped); clear storage → default count.

- [X] T015 [US2] Extend `web/test/skeletons/RouteSkeleton.test.tsx` (or add `web/test/skeletons/RouteSkeleton.sizing.test.tsx`) — with `ortho.skeletonCounts` seeded (e.g. `transactions: 15`, `goals: 5`, `housing: 4`), assert `RouteSkeleton` renders that many rows/cards for those routes (bounded by cap); with a recorded `0`, assert a minimal 1 placeholder; with no stored value, assert the per-surface default count. (FR-003, FR-006, FR-007, US2 scenarios.)
- [X] T016 [US2] Write a failing test for count recording in `web/test/skeletons/store-records-counts.test.tsx` (or extend an existing store test) — after a successful `loadAll` with a mock client returning known collection sizes, assert `readSkeletonCount('transactions'|'goals'|'housing'|'tags', …)` reflect those sizes. (FR-004, FR-005.)
- [X] T017 [US2] In `web/lib/store.tsx`, after `loadAll` resolves successfully, call `writeSkeletonCount` for `transactions`, `goals`, `housing` (properties length), and `tags`; guard so a recording failure never affects bootstrap. Make T016 pass.
- [X] T018 [US2] Update `RouteSkeleton.tsx` to source list counts via `readSkeletonCount('transactions'|'housing'|'goals', <default>)` and pass them to the respective skeletons. Make T015 pass. (Budgets/Settings/Dashboard stay fixed.)

**Checkpoint**: returning users see skeletons whose height matches their real data.

---

## Phase 5: User Story 3 — Reports & other async views show shaped skeletons (Priority: P3)

**Goal**: Reports-mode views show a chart/rows skeleton while fetching, instead of "Loading…";
error and empty states unchanged.

**Independent test**: Render each Reports view with `status='loading'` → skeleton, not "Loading…";
`status='error'` → existing error+retry; empty window → existing empty copy.

- [X] T019 [P] [US3] Write failing tests in `web/test/skeletons/reports-loading-skeleton.test.tsx` (`jsdom`) — `SavingsRateView` and `CategoryDeepDiveView` with `status='loading'` render a skeleton (a `role="status"` busy region / `data-testid`) and NOT the text "Loading…"; with `status='error'` render the existing error message + "Try again"; with `ready` + no activity render the existing empty copy. (FR-010, US3 scenarios.)
- [X] T020 [US3] Update `web/components/dashboard/SavingsRateView.tsx` — replace the `status === 'loading'` `<p>{t('Loading…')}</p>` with a chart/rows skeleton sized via `readSkeletonCount('reportsSavings', <default>)`; on `status === 'ready'` record the row count with `writeSkeletonCount('reportsSavings', rows.length)`; leave error/empty branches unchanged.
- [X] T021 [US3] Update `web/components/dashboard/CategoryDeepDiveView.tsx` — same pattern with `readSkeletonCount('reportsCategories', …)` and `writeSkeletonCount('reportsCategories', …)` on ready; error/empty unchanged. Make T019 pass.

**Checkpoint**: all async surfaces use skeletons; error/empty states intact.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T022 [P] Update `docs/web.md` — note the skeleton loading system (the `Skeleton` primitive, `lib/skeletonCounts.ts`, `RouteSkeleton` dispatcher, the `ortho.skeletonCounts` localStorage key, and the motionless/no-shimmer constraint) in the relevant section (§5 shell composition / §8 localStorage keys).
- [X] T023 [P] Grep guard: confirm no core route or Reports view renders the bare `t('Loading…')` any longer (only sign-in "Sending…/Verifying…" remain, which are intentional). (SC-001.)
- [X] T024 Verify bundle discipline — the skeletons/primitive add no eager recharts/desktop-composition imports; run `npm run build && npm run measure:bundle` and confirm no meaningful initial-bundle regression. (SC-006.)
- [X] T025 Full gate: from `web/`, `npx tsc --noEmit` clean and `npm test` fully green; walk the `quickstart.md` manual steps (route-by-route shaped skeleton, sizing, reports, no motion, precedence). (SC-001..SC-005.)

---

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational (T002–T005)** → user stories.
- **US1 (T006–T014)** depends on Foundational; it is the MVP and is independently shippable using default sizes.
- **US2 (T015–T018)** depends on US1 (needs the skeletons + dispatcher to exist) and Foundational (needs `skeletonCounts`).
- **US3 (T019–T021)** depends only on Foundational (`Skeleton` + `skeletonCounts`); it can proceed in parallel with US1/US2 since it edits different files (the Reports views), though shipping order follows priority.
- **Polish (T022–T025)** last.

### Parallel opportunities

- Foundational: T002 ∥ T003 (then T004 ∥ T005).
- US1: after T006 is written, T007–T012 are all `[P]` (separate new files); T013 then T014 are sequential.
- US3 test (T019) can be authored in parallel with US1/US2 implementation.
- Polish: T022 ∥ T023.

## Implementation Strategy

1. **MVP = Phase 1 + 2 + 3 (US1)** — shaped skeletons on every route with sensible defaults. This
   alone removes the bare "Loading…" from all core routes.
2. Add **US2** for data-sized skeletons (the explicit "remember the count" ask).
3. Add **US3** for Reports parity.
4. **Polish** — docs, guards, bundle + full gate.
