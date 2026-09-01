# Research: No Horizontal Scrolling on Mobile (spec 058)

## The defect class

Two CSS defaults combine into every instance found:

1. **One-axis overflow promotes the other.** CSS Overflow Module 3: if one of
   `overflow-x`/`overflow-y` computes to `visible` and the other computes to neither
   `visible` nor `clip`, the `visible` one **computes to `auto`**. Writing `overflow-y: auto`
   alone therefore produces a box that scrolls *both* ways. Every "it scrolls sideways and I
   never asked it to" in this codebase traces to this rule.

2. **Flex items do not shrink below their content.** A flex item's `min-width` defaults to
   `auto`, i.e. its min-content size. An unbreakable string (`SQ *BLUE BOTTLE COFFEE`,
   `$1,234.56`) therefore sets a floor on the item's width, and the container grows past its
   parent instead of the text truncating. `min-w-0` opts out.

A third, narrower cause appears on positioned markers: `left: <pct>%` combined with a blanket
`transform: translateX(-50%)` centres the marker on its point, so at 0% half of it hangs off
the left edge and at 100% half hangs off the right.

## Audit findings

Swept `web/app`, `web/components` and `web/lib` for: single-axis overflow declarations,
`inline-flex`/shrink-to-fit wrappers around scrollers, `translateX(-50%)` on percentage-positioned
elements, `w-screen`/`100vw`, `min-w-[…]`, negative horizontal margins, `whitespace-nowrap`,
and wide grids/tables.

| # | Location | Cause | Reach |
|---|---|---|---|
| 1 | `app/(app)/layout.tsx` `<main>` | `sm:min-w-0` — mobile was the ONLY tier without it; plus `overflow-y-auto` alone | **Every route** |
| 2 | `components/widgets/WidgetPanel.tsx` | `overflow-y: auto` alone on the scroll region | Every widget panel (the reported bug) |
| 3 | `app/globals.css` `.ow-drawer` | `overflow: auto` shorthand scrolls both axes; renders at 90vw on a phone | Budgets, household, filters drawers |
| 4 | `components/dashboard/SpendHeatmap.tsx` | `overflow-x-auto` scroller inside an `inline-flex` (shrink-to-fit) wrapper never constrains — the wrapper grows to max-content and the PAGE scrolls | Dashboard |
| 5 | `panels/kit/PanelRow.tsx`, `kit/ReconciledMonthCard.tsx` | flex items at `min-width: auto` — long merchant names and three currency columns | Panels using the kit |
| 6 | `panels/kit/CycleStrip.tsx`, `panels/SpendingPacePanel.tsx` | percentage-positioned markers centred with `translateX(-50%)` overhang both track edges | Top-merchants, spending-pace panels |

Finding #1 is the significant one: the reported symptom was a panel, but the shell defect made
the same bug reachable from every screen. Notably `NetSummaryHero` already wrapped the heatmap
in `min-w-0` and documented the intent ("lets it shrink without clipping the tooltip") — the
`inline-flex` child silently defeated it, which is why #4 survived review.

## Rejected approaches

- **`overflow-x: hidden` on `body`** — hides the symptom, makes the document a scroll
  container, breaks `position: sticky` and programmatic scrolling. `clip` clips without
  establishing a scroll container, and leaves `overflow-y: visible` alone (it is exempt from
  the promotion rule in #1 above).
- **Locking the viewport** (`maximum-scale=1` / `user-scalable=no`) — destroys pinch-to-zoom.
  The app deliberately preserves it; see the existing `mobile-input-zoom-guard` suite, which
  fixes iOS focus-zoom via a 16px font floor for exactly this reason.
- **Measuring at runtime** (`ResizeObserver` to clamp markers) — needs layout, which the test
  environment does not have, and adds a paint dependency to a pure presentational strip. The
  anchoring formula below is exact and needs no measurement.

## Marker anchoring

For a marker of width `w` at position `pct` on a track of width `W`, shifting by `-pct%` of the
marker's **own width** puts its left edge at `(pct/100) · (W − w)`. That lies in `[0, W − w]`
for every `w ≤ W` and every `pct ∈ [0,100]` — so the marker is provably always inside the
track, flush-left at 0, centred at 50, flush-right at 100. No measurement, one multiply.
Extracted as `web/lib/ui/edgeAnchor.ts` and pinned by that invariant as a property test.

## Testing approach

The repo has no browser-driven test layer (vitest + jsdom only), and jsdom performs no layout —
it cannot observe a real overflow. Guards are therefore **structural**, which is the pattern the
repo already uses for this exact category: `test/appearance/mobile-input-zoom-guard.test.ts`,
`mobile-scroll-nav-guard.test.ts`, `sidebar-no-scroll-guard.test.ts`. Each new guard asserts the
specific declaration whose absence caused the bug, and carries the reasoning in a comment so a
future reader knows why it is not merely asserting a class name.

A real-device visual confirmation remains a manual step — see `quickstart.md`.
