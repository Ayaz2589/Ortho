# Contract: Filter UI (web + iOS)

Behavior the surfaces must provide on each canvas. Styling = design tokens only (constitution I/II/IV/V).

## Entry point + active state (all surfaces)
- A **Filters** button near the existing search/add controls, showing a **count badge** = `activeFilterCount(criteria)` when > 0.
- A row of **active-filter chips** under the header — one removable chip per active dimension (e.g. "Dining ×", "Income ×", "Amex Gold ×", "Tasnuva ×", "May 2026 ×", scope/search if set). Each chip's × clears just that dimension.
- A single **Clear all** control (visible when any filter is active) → `emptyCriteria()`.

## Filter surface body (`FilterPanel` web / `FilterSheet` iOS)
- **Category**: multi-select of the 11 categories using the existing category tiles/tints (`CatTile` + `CATEGORIES`); tap toggles; none selected = all.
- **Kind**: a 3-way segmented control — All / Expenses / Income (`Seg`/`Segmented` web; pills iOS).
- **Source**: multi-select of `availableSources(transactions)` (checkbox list / chips); none = all.
- **Owner**: multi-select of household members + the current user (avatar + name); none = all.
- **Date**: a **month** picker (quick) and/or a from–to **range**; clearing = all time.
- A **Done/Apply** affordance to dismiss (web drawer close / iOS sheet dismiss); changes apply live as toggled (no separate "apply" needed) — closing just hides the surface.

## Surfaces per canvas (constitution III)
| Canvas | Filter surface | Component(s) |
|--------|----------------|--------------|
| Web expanded (≥1024) | right **Drawer** | reuse `components/web/Drawer.tsx` + new `FilterPanel` |
| Web compact (<1024) | inline panel/sheet from a filter button | `FilterPanel` in the existing reveal area of `page.tsx` |
| iOS | **bottom sheet** | new `FilterSheet`, presented from `TransactionsView`; scope pills + `SearchField` preserved above the list |

## Results & empty states
- The list renders `groupDaysByMonth(groupByDay(filtered))`; empty day/month groups dropped; per-group totals reflect visible rows (FR-011).
- **No matches** (`filtered.length === 0 && hasAnyTransactions`): a distinct calm state — "No transactions match your filters" + a **Clear filters** action (FR-009). Different from the existing "No transactions yet" state.

## Accessibility (web)
- All controls are real semantic elements (`<button>`, checkboxes, segmented `role=tab`), keyboard-reachable in DOM order, sand `focus-visible` ring, hit targets ≥40px (≥44 touch), AA contrast, `prefers-reduced-motion` respected for the drawer/sheet transition. iOS uses native accessible controls.

## Invariants
- All filters cleared ⇒ identical to today's page (scope + search only) — additive (SC-007).
- Applying/removing a filter updates the list immediately, no fetch/reload (FR-010, SC-003).
- iOS and web show the same filtered set for the same criteria (SC-002).
