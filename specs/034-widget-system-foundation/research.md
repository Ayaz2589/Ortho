# Phase 0 Research: Dashboard Widget System (Foundation)

## R1. Packing strategy — "no dead space" made concrete

**Problem observed** (confirmed by `docs/dashboard-widget-research.md` §2 and the current
`DashboardDesktop.tsx`): the existing 12-column `ow-grid` uses fixed spans (`ow-s5/6/7/12`) with
`align-items: stretch`. Two failure modes produce dead space:

1. **Blank vertical bands** — siblings in a row are forced to equal height; the shorter card fills
   with whitespace (Housing and Daily-trend explicitly add `flex:1` spacers to cope).
2. **Ghost gaps** — conditional cards render `null` (InsightsCardStack, BudgetProgressCard when
   empty), collapsing to zero height and leaving holes / making the row below float up.

**Decision**: A **CSS column masonry** board (chosen after an adversarial review of a first,
grid-based attempt — see below):

- `columns: 1 → 2 → 3` by breakpoint, `column-gap: 16px`, width-capped at 1080px and centered.
- `.ow-board > * { break-inside: avoid; margin-bottom: 16px }` — each widget stays intact in one
  column and stacks flush below the previous one.
- Size is a **height tier** (`min-height` for sm/md/lg); `wide` is `column-span: all`. Widths are
  uniform (one column), so there is no width-varying span to strand a hole.
- Each widget frame is a flex column whose body `flex: 1`, so a widget fills its own height tier
  (no blank band); widgets **never render null** (the cell is always occupied).

**Why not a fixed multi-column grid (the first attempt, rejected):** a `repeat(N, 1fr)` grid with
`grid-auto-flow: dense` and width spans (`sm`=1, `md`=2, `lg`=2×2, `wide`=full) packs the *default*
set cleanly, but `dense` can only backfill a hole with a *later, smaller* item. Because widgets are
freely user-toggleable, hole-producing subsets are trivially reachable — a lone `lg` leaves the side
columns blank; `lg` + one `md` leaves a cell empty; a `wide` after a partial row strands an interior
gap. That directly violates FR-003 for real toggle states, not just the default. A uniform-width
masonry has neither failure mode for *any* subset. **Rejected within masonry**: JS masonry libraries
(extra dependency, non-token, layout-shift on load) — CSS multicol is zero-dependency, token-friendly,
and SSR-stable. Tradeoff accepted: masonry reading order is column-major (DOM order is preserved, so
the a11y list order is unchanged); only a trailing partial column may remain, which reads as the board
simply ending. Locked by `test/widgets/board-packing.test.ts`.

## R2. Size vocabulary

**Decision**: a small closed vocabulary. In the masonry model (R1) widths are uniform (one column),
so size is a **height tier** plus a full-width option:

| `WidgetSize` | Footprint            | Intent |
|--------------|----------------------|--------|
| `sm`         | short (min 150px)    | compact stat / summary |
| `md`         | medium (min 200px)   | list / chart-shaped |
| `lg`         | tall (min 290px)     | hero / tall |
| `wide`       | spans every column   | full-width strip |

Expressed as CSS classes (`.ow-w-sm/md/lg/wide`). Height tiers give visual rhythm without any
width-varying span (which is what stranded holes in the grid attempt). This exercises mixed footprints
without a 12-unit design language.

**Rationale**: keeps the registry declarative (author picks a T-shirt size, not raw spans) and keeps
packing correctness in one place (the board CSS), satisfying FR-002/FR-003/FR-008.

## R3. Persistence

**Decision**: mirror `web/lib/flags.ts` + `web/lib/skeletonCounts.ts` exactly. A `ortho.widgets`
localStorage key holding a JSON object `{ [id]: boolean }`. `readWidgetPrefs()` is fully defensive
(no storage / corrupt JSON / wrong shape → `{}`), `writeWidgetPrefs()` is a best-effort no-op on
error. Enabled resolution = `stored[id] ?? definition.defaultEnabled`, and unknown stored ids are
ignored (they simply don't match any definition). A `useWidgetPrefs()` hook seeds from defaults on
first render (SSR-safe), adopts stored values in a mount effect, and persists on toggle — the same
shape as `useDashboardRange`.

**Rationale**: this is the established, tested client-preference convention (Principle VI regression
suite already blesses the pattern). No new persistence primitive; no Supabase change (FR-007).

## R4. Single composition (no separate desktop file)

**Decision**: delete the `next/dynamic` desktop split for the overview. One `WidgetBoard` renders at
all widths; responsiveness is pure CSS (`--cols` per media query), so there is no wrong-layout flash
and no second chunk to keep in parity. This directly answers the spec's "one composition (no separate
desktop-only layout file)" and removes the parity-by-hand burden the research flagged.

**Note**: the existing `form-factor-split` test asserts the overview desktop chunk is code-split.
That invariant no longer applies to the overview (it now has one composition); the test is updated to
reflect the new single-composition contract rather than deleted wholesale where it still guards other
routes. (See tasks.md for the precise test edits.)

## R5. Scope of removal & test blast radius

**Kept**: Reports mode and everything it uses — `ModeSwitch`, `ReportsView`, `SavingsRateView`,
`CategoryDeepDiveView`, `RangePicker`, `MonthPicker`, `range.ts`, `useReportsData`, `useDashboardRange`,
charts `CategoryPie` + `SavingsRateChart`. Also kept: all `lib/finance/*` pure math (untouched).

**Removed** (overview-only): `DashboardDesktop.tsx`; the eight overview cards `MonthSummaryCard`,
`InsightsCardStack`, `BudgetProgressCard`, `SpendByCategoryCard`, `PerOwnerBreakdownCard`,
`TopMerchantsCard`, `HousingSnapshotCard`, `DailySpendTrendCard`; and `charts/DailyTrendChart.tsx`
(its only consumer was `DailySpendTrendCard`).

**Tests to update/remove** (identified by grep):
- `test/desktop-parity.test.tsx` — asserted mobile/desktop card parity → **remove** (no dual
  composition to keep in parity; replaced by widget-board tests).
- `test/budgets/budget-progress-card.test.tsx` — tests a removed card → **remove** (budget math stays
  covered in `test/finance/*`).
- `test/dashboard/spend-by-category.split.test.tsx` — tests a removed card's drilldown → **remove**.
- `test/dashboard/dashboard-mode.test.tsx` — overview↔reports switch → **update** so the overview
  branch asserts the widget board renders (Reports branch unchanged).
- `test/web/form-factor-split.test.ts` — overview desktop code-split → **update** to the
  single-composition contract (keep any assertions about other routes).
- `test/bundle/no-eager-recharts.test.ts` — ensures recharts stays lazy → **re-verify** still passes
  after `DailyTrendChart` removal (CategoryPie/SavingsRateChart remain lazy; likely no edit).
- `test/i18n/render-locale.test.tsx`, `test/store.integrity.test.tsx` — grep-matched only incidental
  card references → **re-verify**, edit only if they import a removed component.

**New tests**: `test/widgets/preferences.test.ts` (defensive read/write, resolution, fallback),
`test/widgets/registry.test.tsx` (unique ids, required fields, every size represented),
`test/widgets/widget-board.test.tsx` (renders only enabled; empty state when none; no null cells;
adding a registry entry shows up), `test/widgets/widgets-settings.test.tsx` (toggle flips + persists),
`test/widgets/widget-frame.test.tsx` (fills cell; token-only; a11y of the frame).

## R6. Design-token compliance

Board and frame reuse `.ow-card` (surface, radius, hairline-in-dark, no shadow). New CSS classes
(`.ow-board`, `.ow-w-*`) live in the existing `ow-*` block in `globals.css` and reference only tokens
(`--hairline`, `--surface`, gap `16px` to match `.ow-grid`). The settings toggles reuse the existing
`ChoiceRow` primitive. No hardcoded colors anywhere (SC-007).

## R7. Empty state

When zero widgets are enabled, the board renders `WidgetEmptyState` — a calm, non-alarmist message
("Your dashboard is empty") with a link to Settings → Widgets to turn some back on (FR-009). Never a
blank page, never red, no shimmer.
