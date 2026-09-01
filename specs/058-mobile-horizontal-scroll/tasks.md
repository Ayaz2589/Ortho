# Tasks: No Horizontal Scrolling on Mobile (spec 058)

TDD throughout — every implementation task below was preceded by its test task, and each test
was run and **seen to fail for the intended reason** before the implementation was written.

## Phase 1 — Audit

- [X] T001 Sweep `web/app`, `web/components`, `web/lib` for the defect class: single-axis
      overflow declarations, shrink-to-fit wrappers around scrollers, `translateX(-50%)` on
      percentage-positioned elements, `w-screen`/`100vw`, `min-w-[…]`, negative horizontal
      margins, `whitespace-nowrap`, wide grids/tables. Six causes recorded in `research.md`.
- [X] T002 Confirm the test environment's ceiling (vitest + jsdom, no layout, no browser
      layer) and adopt the repo's existing structural-guard precedent.

## Phase 2 — Marker anchoring (pure)

- [X] T003 **RED** `web/test/ui/edge-anchor.test.ts` — edges, midpoint, clamping, non-finite
      input, monotonicity, and the containment invariant across many widths/positions.
      Verified failing: `Cannot find package '@/lib/ui/edgeAnchor'`.
- [X] T004 **GREEN** `web/lib/ui/edgeAnchor.ts` — `edgeAnchoredShiftPct` +
      `edgeAnchoredTransform`. 10/10 pass.

## Phase 3 — Panels (the reported bug)

- [X] T005 **RED** `web/test/widgets/panels/panel-overflow.test.tsx` — WidgetPanel scroll
      region, PanelRow (incl. containment surviving a caller's className override),
      ReconciledMonthCard, CycleStrip dots/ticks/today rule + caption. 13 failing.
- [X] T006 **GREEN** `WidgetPanel.tsx` — declare `overflowX: 'hidden'`.
- [X] T007 **GREEN** `kit/PanelRow.tsx` — `min-w-0 truncate` label, `shrink-0` value, applied
      by the row itself so an override cannot drop it.
- [X] T008 **GREEN** `kit/ReconciledMonthCard.tsx` — wrap metric columns, `min-w-0` each.
- [X] T009 **GREEN** `kit/CycleStrip.tsx` — route every positioned element through
      `edgeAnchoredTransform`.

## Phase 4 — App-wide

- [X] T010 **RED** `web/test/dashboard/spend-heatmap-overflow.test.tsx` — wrapper not
      shrink-to-fit, scroller can shrink. 2 failing.
- [X] T011 **GREEN** `SpendHeatmap.tsx` — `inline-flex` → `flex max-w-full`; scroller `min-w-0`.
- [X] T012 **RED** extend `web/test/appearance/no-horizontal-scroll-guard.test.ts` — the shell
      `<main>` (unprefixed `min-w-0`, no horizontal scroll) and `.ow-drawer` (vertical only).
      3 failing, with the offending class list printed in the failure message.
- [X] T013 **GREEN** `app/(app)/layout.tsx` — unprefixed `min-w-0` + `overflow-x-hidden`.
- [X] T014 **GREEN** `app/globals.css` — `.ow-drawer` explicit per-axis overflow.

## Phase 5 — Generalising the marker fix

- [X] T015 **RED** Extend the guard with the *generalised* anti-pattern check: no `style={{ … }}`
      anywhere under `web/components` or `web/app` may combine a percentage `left`/`right` with
      a blanket `translateX(-50%)`. Verified failing, and it named the one file the
      component-level tests had not reached: `SpendingPacePanel.tsx`.
- [X] T016 **GREEN** `panels/SpendingPacePanel.tsx` — anchor both the period-marker rule (1.5px
      wide with no transform at all, so it spilled its full width past the track end at 100%)
      and its `whitespace-nowrap` caption.

## Phase 6 — Backstop

- [X] T017 **RED** guard for the document-level backstop: `overflow-x: clip` present, `hidden`
      absent, viewport never locked.
- [X] T018 **GREEN** `app/globals.css` — `html, body { overflow-x: clip; }`.

## Phase 7 — Verification

- [X] T019 Full suite + typecheck.
- [X] T020 Production build.
- [ ] T021 Manual visual confirm on a real mobile viewport (`quickstart.md`) — the one step
      no test in this repo can cover.
