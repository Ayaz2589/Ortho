# Tasks: Dashboard Widget System (Foundation)

**Input**: Design documents from `specs/034-widget-system-foundation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/widget-system.md

**Tests**: REQUIRED — Principle VI (Test-Driven & Regression-Safe) is non-negotiable. Every behavior
task writes a failing test first.

**Working dir**: all paths are under `web/`. Dev branch: `claude/widget-system-redesign-q6aesu`.

## Format: `[ID] [P?] [Story] Description`
- **[P]** = parallelizable (different files, no dependency).
- **[Story]** = US1 (gap-free board), US2 (toggles + persistence), US3 (declarative extensibility).

---

## Phase 1: Setup

- [ ] T001 Create the feature's directories: `web/lib/widgets/`, `web/components/widgets/`,
  `web/test/widgets/`. No code yet.

---

## Phase 2: Foundational (blocking — everything depends on these)

**⚠️ No user-story work begins until Phase 2 is complete.**

- [ ] T002 [P] Write FAILING tests `web/test/widgets/preferences.test.ts` for `readWidgetPrefs`
  (null / bad JSON / non-object / array → `{}`), `writeWidgetPrefs` (round-trips; no-op on throw),
  `isWidgetEnabled` (stored `false` beats default `true` and vice-versa), `enabledWidgets` (registry
  order; unknown stored ids excluded), `setWidgetEnabled` (merges + persists).
- [ ] T003 Implement `web/lib/widgets/preferences.ts` per contract (defensive, mirrors
  `lib/flags.ts` / `lib/skeletonCounts.ts`) until T002 passes. Depends on T002 and the registry type
  (import `WidgetDefinition` from registry — create the type there first or co-locate).
- [ ] T004 [P] Write FAILING tests `web/test/widgets/registry.test.tsx`: ids unique + kebab-case,
  titles/descriptions non-empty, `WIDGETS` non-empty, every `WidgetSize` (`sm/md/lg/wide`) used at
  least once, `getWidget` lookup.
- [ ] T005 Implement `web/lib/widgets/registry.tsx` (types `WidgetSize`, `WidgetDefinition`; `WIDGETS`
  array of ~6 placeholder widgets spanning all sizes; `getWidget`) until T004 passes.
- [ ] T006 [P] Implement calm placeholder bodies `web/components/widgets/placeholders.tsx` (token-only,
  no live data, no red; each fills its box). Referenced by the registry.
- [ ] T007 Add `.ow-board` + `.ow-w-{sm,md,lg,wide}` + `--ow-board-cols` media steps to the `ow-*`
  block in `web/app/globals.css` (tokens only; gap 16px; cap 1080px, centered; compact collapses all
  spans to full width). Per contract CSS section.
- [ ] T008 Implement `web/lib/widgets/useWidgetPrefs.ts` (SSR-safe defaults → mount-adopt →
  persist-on-set), mirroring `useDashboardRange`. Depends on T003, T005.

**Checkpoint**: registry + preferences + hook + board CSS exist and unit tests are green.

---

## Phase 3: User Story 1 — Gap-free board on any screen (P1) 🎯 MVP

**Goal**: A responsive, densely-packed board of the enabled widgets, each filling its cell, no dead
space, one composition for mobile + desktop.

**Independent test**: render `WidgetBoard` at compact and expanded widths with defaults; assert every
enabled widget present, no empty cells, no null widgets.

- [ ] T009 [P] [US1] Write FAILING `web/test/widgets/widget-frame.test.tsx`: `Widget` renders the
  title + `Body`, applies `.ow-w-{size}`, never returns null, uses `.ow-card` (no shadow), body region
  is present. Accessible heading for the widget title.
- [ ] T010 [US1] Implement `web/components/widgets/Widget.tsx` (calm frame, `height:100%`, flex-column
  body `flex:1`, size span class) until T009 passes. Depends on T005, T007.
- [ ] T011 [P] [US1] Implement `web/components/widgets/WidgetEmptyState.tsx` (calm copy + link to
  `/settings/widgets`; no red/shimmer).
- [ ] T012 [P] [US1] Write FAILING `web/test/widgets/widget-board.test.tsx`: renders exactly the
  enabled widgets in registry order; zero enabled → empty state and no widget cards; board is a
  labelled region.
- [ ] T013 [US1] Implement `web/components/widgets/WidgetBoard.tsx` (reads `useWidgetPrefs`, maps
  enabled → `Widget`, empty state when none, `.ow-board` container) until T012 passes. Depends on
  T008, T010, T011.
- [ ] T014 [US1] Rewire `web/app/(app)/dashboard/page.tsx`: Overview mode renders `<WidgetBoard/>`
  (one composition, no `useIsExpanded` branch, no `DashboardDesktop` import); **Reports mode +
  `ModeSwitch` preserved unchanged**. Remove the overview-card imports.
- [ ] T015 [US1] Update `web/test/dashboard/dashboard-mode.test.tsx`: overview branch asserts the
  widget board renders; Reports branch unchanged.

**Checkpoint**: Dashboard overview is the widget board; renders gap-free on mobile + desktop.

---

## Phase 4: User Story 2 — Per-widget toggles + persistence (P1)

**Goal**: A Settings screen lists every widget with an on/off toggle; choices persist per browser and
drive the board.

**Independent test**: toggle a widget off in Settings → it leaves the board and the board re-packs →
reload → still off → toggle on → returns.

- [ ] T016 [P] [US2] Write FAILING `web/test/widgets/widgets-settings.test.tsx`: the settings screen
  lists one accessible toggle per `WIDGETS` entry showing name + description + current state; clicking
  flips it and calls the persistence layer; reflects existing stored prefs on mount.
- [ ] T017 [US2] Implement `web/app/(app)/settings/widgets/page.tsx` using the existing `ChoiceRow`
  primitive + `SectionCard`, driven by `useWidgetPrefs`; mobile back-link + `PageHeader` per the
  settings sub-page convention. Until T016 passes. Depends on T008.
- [ ] T018 [US2] Wire discoverability: add a "Widgets" `LinkRow` to `web/app/(app)/settings/page.tsx`
  and a "Widgets" entry to `web/components/settings/SettingsSecondaryNav.tsx` (desktop). Keep the
  four destinations intact.
- [ ] T019 [US2] Extend `web/test/widgets/widget-board.test.tsx` (or the settings test): a full
  round-trip — disable via `setWidgetEnabled`, board omits it; re-enable, board shows it; verifies the
  board consumes persisted prefs (FR-007 / SC-003 / SC-004).

**Checkpoint**: US1 + US2 both work; toggles persist across reloads.

---

## Phase 5: User Story 3 — Declarative extensibility (P2)

**Goal**: One registry entry surfaces a new widget in both Settings and the board with no other edits.

**Independent test**: add a throwaway registry entry (via a test-injected registry or by asserting the
board/settings map over `WIDGETS`) and confirm it appears in both without touching those components.

- [ ] T020 [P] [US3] Write `web/test/widgets/extensibility.test.tsx`: the board and settings list are
  pure functions of `WIDGETS` — a definition added to the array (or a spy over the mapping) renders in
  both surfaces at its declared size, with no board/settings code change. Locks SC-005 / FR-008.
- [ ] T021 [US3] If T020 reveals hardcoding, refactor `WidgetBoard`/settings to map over `WIDGETS` /
  `enabledWidgets` (no per-widget branches). Otherwise no-op.

**Checkpoint**: All three stories satisfied.

---

## Phase 6: Removal & cleanup (depends on Phase 3–5 — the board must replace them first)

- [ ] T022 [P] Delete overview-only components: `web/components/web/DashboardDesktop.tsx`;
  `web/components/dashboard/{MonthSummaryCard,InsightsCardStack,BudgetProgressCard,SpendByCategoryCard,
  PerOwnerBreakdownCard,TopMerchantsCard,HousingSnapshotCard,DailySpendTrendCard}.tsx`;
  `web/components/dashboard/charts/DailyTrendChart.tsx`.
- [ ] T023 [P] Remove obsolete tests: `web/test/desktop-parity.test.tsx`,
  `web/test/budgets/budget-progress-card.test.tsx`,
  `web/test/dashboard/spend-by-category.split.test.tsx`.
- [ ] T024 Update `web/test/web/form-factor-split.test.ts` to the single-composition contract (drop
  the overview-desktop-code-split assertion; keep any assertions guarding other routes). If the whole
  file was overview-specific, remove it.
- [ ] T025 Grep the tree for any remaining imports of the removed components (`web/app`,
  `web/components`, `web/lib`, `web/test`) and resolve each (e.g. any stray helper import that lived on
  `HousingSnapshotCard`). Confirm `test/bundle/no-eager-recharts.test.ts`, `test/store.integrity.test.tsx`,
  `test/i18n/render-locale.test.tsx` still pass or edit minimally.

---

## Phase 7: Polish & i18n

- [ ] T026 [P] Add the new UI chrome strings (widget titles/descriptions, "Widgets", the empty-state
  copy, settings labels) to the five catalogs `web/lib/i18n/{es,bn,ja,ko,zh}.ts`. English is identity.
- [ ] T027 [P] Add/adjust a design-token compliance assertion for the new files (no hardcoded hex /
  rgb outside tokens) if such a test convention exists; otherwise assert token usage in the frame test.
- [ ] T028 Run `npm test` and `npx tsc --noEmit` in `web/`; fix to green. Verify SC-001..SC-007.
- [ ] T029 Update `docs/web.md` (dashboard section) to describe the widget system, and note the
  redesign in the active-spec pointer if appropriate. Keep `docs/dashboard-widget-research.md` as
  reference (its dead-space findings motivated this framework).

---

## Dependencies & parallelism

- Phase 2 (T002–T008) blocks all user stories. Within it: T002∥T004∥T006 (different files);
  T003 needs the `WidgetDefinition` type (T005 or a co-located type); T007 is independent CSS;
  T008 needs T003+T005.
- US1 (T009–T015) before US2 (T016–T019) before US3 (T020–T021) by priority; US2/US3 mostly touch
  different files and can overlap once the board (T013) exists.
- Removal (Phase 6) must come **after** the board replaces the old overview (T014), so the app never
  imports a deleted component.
- `[P]` tasks within a phase touch disjoint files and may run together.

## MVP

Phases 2 + 3 (T001–T015) deliver the MVP: a gap-free, responsive widget board replacing the overview.
Phase 4 adds the toggle menu + persistence (the second P1). Phases 5–7 complete extensibility,
removal, and polish.
