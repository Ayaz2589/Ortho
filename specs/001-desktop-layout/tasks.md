# Tasks: Desktop Layout

**Input**: `specs/001-desktop-layout/{spec.md, plan.md}`

**Tests**: No automated UI suite in repo; verification is `tsc --noEmit` + manual
responsive review. No test tasks generated.

**Repository root for paths**: `Ortho-web/`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency)
- **[Story]**: US1–US4 from spec.md

---

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Add `lib/useMediaQuery.ts` — SSR-safe hook returning a boolean for a
  media query; plus `useIsExpanded()` = `(min-width:1024px)`.
- [ ] T002 Add `components/layout.tsx` — `ReadingColumn` (≤560, centered),
  `DashboardGrid` (≤1080, responsive grid), `MasterDetail` (list+detail panes),
  and `DetailEmpty` (quiet prompt). Token-only.

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ Must complete before user-story phases.**

- [ ] T003 [US1] Create `components/Sidebar.tsx` — responsive left nav: hidden
  <640, icon rail 640–1023 (`sm:w-[72px]`), full icon+label ≥1024 (`lg:w-60`).
  Four destinations + pastel/lucide icons, active via `usePathname` with
  `aria-current="page"`, household context + sign-out affordance at the bottom.
- [ ] T004 [US1] Gate `components/TabBar.tsx` to `<640` only (`sm:hidden`).
- [ ] T005 [US1] Rewrite `app/(app)/layout.tsx` Shell into the responsive frame:
  `sm:flex sm:h-screen sm:overflow-hidden`, Sidebar + `<main sm:flex-1
  sm:overflow-y-auto sm:min-w-0>`, responsive gutters (`px-4` → `lg:px-10`), keep
  loading/error UI; remove the global `max-w-lg` cap (pages cap themselves).

**Checkpoint**: Frame renders; nav correct at all three breakpoints.

---

## Phase 3: US1 — Sidebar navigation (P1) 🎯 MVP

**Goal**: Desktop nav is a left sidebar; mobile keeps the bottom bar.

- [ ] T006 [US1] Wire household context (member avatars + name) and sign-out into
  the Sidebar footer using `useApp()`.
- [ ] T007 [US1] Verify active states, keyboard order, and `aria-current` across
  the four routes; sidebar fixed, only `<main>` scrolls.

**Checkpoint**: US1 acceptance scenarios pass.

---

## Phase 4: US2 — Capped, breathing content (P1)

**Goal**: Nothing full-bleed; everything centered and width-capped.

- [ ] T008 [P] [US2] Dashboard: wrap widgets in `DashboardGrid` (≤1080). Hero
  (MonthSummary) + Insights span full width; remaining widgets flow 2-up at `lg`.
- [ ] T009 [P] [US2] Settings, Settings/Household, Budgets: wrap content in
  `ReadingColumn` (≤560).
- [ ] T010 [P] [US2] Transactions & Housing single-column (pre-master–detail):
  cap their lists/content within the frame so they don't stretch ultrawide.

**Checkpoint**: At 2560px all screens are capped & centered (SC-002).

---

## Phase 5: US4 — Interaction states (P2)

**Goal**: Real hover/active/focus + reduced-motion.

- [ ] T011 [US4] `app/globals.css`: global `:focus-visible` ring
  (`1.5px var(--accent)`), `@media (prefers-reduced-motion: reduce)` to disable
  transitions, and a reusable hover helper for rows/cards/nav.
- [ ] T012 [US4] Apply hover (`rgba(text,.04)`) / active (`.08`) + `cursor-pointer`
  to transaction rows, nav items, property cards, settings rows, and list rows.

**Checkpoint**: US4 acceptance scenarios pass; keyboard fully operable.

---

## Phase 6: US3 — Master–detail (P2)

**Goal**: Transactions & Housing show detail beside the list at ≥1024px.

- [ ] T013 [US3] Extract `components/transactions/TransactionDetail.tsx` (pure
  detail content + edit/delete) from `TransactionDetailModal`; have the modal
  render it. No mobile behavior change.
- [ ] T014 [US3] Transactions page: lift `selectedId`; at expanded width render
  `MasterDetail` (list pane left, `TransactionDetail` or `DetailEmpty` right,
  selected row marked); below expanded keep modal flow.
- [ ] T015 [US3] Housing page: at expanded width with >1 property render
  `MasterDetail` (PropertyCard list left, `PropertyContent` right); 1 property →
  `ReadingColumn` detail; 0 → empty state. Below expanded keep current flow.
- [ ] T016 [US3] Reset selection when the selected item is deleted or filtered
  out; retain selection across benign re-renders.

**Checkpoint**: US3 acceptance scenarios pass (SC-003).

---

## Phase 7: Polish & Verify

- [ ] T017 `tsc --noEmit` clean across the app.
- [ ] T018 Manual responsive review at 390 / 768 / 1024 / 1440 / 2560px in light
  and dark; confirm mobile <640 unchanged (SC-005) and tokens-only (SC-006).

---

## Dependencies

- Phase 1 (T001–T002) → everything.
- Phase 2 (T003–T005) → all user stories.
- US1 (P1) and US2 (P1) are the MVP; US4 and US3 (P2) layer on top.
- T013 blocks T014. T002 blocks T008/T009/T014/T015.
