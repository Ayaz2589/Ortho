# Phase 0 Research: Dashboard Widget System (Foundation)

## R1. Packing strategy — "no dead space" made concrete

**Problem observed** (confirmed by `docs/dashboard-widget-research.md` §2 and the current
`DashboardDesktop.tsx`): the existing 12-column `ow-grid` uses fixed spans (`ow-s5/6/7/12`) with
`align-items: stretch`. Two failure modes produce dead space:

1. **Blank vertical bands** — siblings in a row are forced to equal height; the shorter card fills
   with whitespace (Housing and Daily-trend explicitly add `flex:1` spacers to cope).
2. **Ghost gaps** — conditional cards render `null` (InsightsCardStack, BudgetProgressCard when
   empty), collapsing to zero height and leaving holes / making the row below float up.

**Decision**: A CSS-grid board with:

- `grid-template-columns: repeat(var(--cols), minmax(0, 1fr))` where `--cols` steps by breakpoint
  (1 on compact, 2 on medium, up to 3–4 on expanded), width-capped and centered.
- `grid-auto-flow: row dense` — the browser backfills earlier gaps with later, smaller items, so a
  mixed-size set never leaves an empty cell (kills ghost gaps structurally).
- `grid-auto-rows: 1fr` + each widget frame `height: 100%` with a flex-column body that `flex: 1` —
  so every widget **fills its cell** and short content is centered/backfilled by a placeholder,
  never a blank band (kills blank bands).
- Widgets **never render null**: an empty/placeholder widget still renders a complete filled box, so
  the grid cell is always occupied.

**Rejected**: JS masonry libraries (extra dependency, non-token, layout-shift on load) and the fixed
`ow-s*` spans (the very source of the dead space). CSS `dense` packing is zero-dependency,
token-friendly, and SSR-stable.

## R2. Size vocabulary

**Decision**: a small closed vocabulary mapping to column/row spans the dense grid can pack:

| `WidgetSize` | Desktop span (of up-to-4 cols) | Intent |
|--------------|-------------------------------|--------|
| `sm`         | 1 col × 1 row                 | compact stat / summary |
| `md`         | 2 col × 1 row                 | list / chart-shaped |
| `lg`         | 2 col × 2 row                 | hero / tall |
| `wide`       | full row × 1 row              | full-width strip |

On compact (phone) every size collapses to a single full-width column (1 row min-height), so the
vocabulary only differentiates layout on medium/expanded. Spans are expressed as CSS classes
(`.ow-w-sm/md/lg/wide`) driven off tokens; the grid's `dense` flow handles the packing. This is
enough to exercise mixed-size packing without inventing a 12-unit design language.

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
