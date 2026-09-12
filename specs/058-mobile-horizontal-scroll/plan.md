# Implementation Plan: No Horizontal Scrolling on Mobile (spec 058)

**Branch**: `fix/058-mobile-horizontal-scroll` · **Spec**: [spec.md](./spec.md) ·
**Research**: [research.md](./research.md) · **Tasks**: [tasks.md](./tasks.md) ·
**Quickstart**: [quickstart.md](./quickstart.md)

## Scope

Six fixes across five files plus one new pure module. No database change (no `data-model.md`),
no new interface between components (no `contracts/`), no i18n change — nothing user-visible
gains or loses a string.

## Approach

Fix each cause where it lives, then add one document-level backstop. The backstop is
explicitly **not** the fix: it exists so a future component that reintroduces the pattern
degrades to "clipped" rather than "the whole app pans".

### 1. New pure module — `web/lib/ui/edgeAnchor.ts`

`edgeAnchoredShiftPct(leftPct)` → the translateX percentage that keeps a marker inside its
track; `edgeAnchoredTransform(leftPct)` → the same as a CSS value. Pure, no measurement.
Pinned by unit tests plus the containment invariant as a property test over many widths and
positions. Consistent with `financialHealth.ts` and `routines.ts`, this is unit/property-pinned
rather than a `shared/test-vectors/` golden — it is a presentation helper, not cross-platform
financial math, so there is no second implementation to hold in sync.

### 2. App shell — `web/app/(app)/layout.tsx`

`<main>`: `sm:min-w-0` → unprefixed `min-w-0`, and add `overflow-x-hidden` beside the existing
`overflow-y-auto`. This is the fix with the widest reach.

### 3. Panel frame — `web/components/widgets/WidgetPanel.tsx`

The scroll region declares `overflowX: 'hidden'` alongside `overflowY: 'auto'`.

### 4. Panel kit — `PanelRow.tsx`, `ReconciledMonthCard.tsx`, `CycleStrip.tsx`

`PanelRow` applies `min-w-0 truncate` to the label and `shrink-0` to the value **itself**,
concatenated with the caller's className override rather than folded into the default — a
caller passing its own emphasis classes must not be able to drop containment silently, which
is how this would regress. `ReconciledMonthCard` wraps its metric columns. `CycleStrip` routes
every percentage-positioned element (dots, tick labels, the today rule and its caption)
through `edgeAnchoredTransform`, and `SpendingPacePanel` does the same for its period-marker
rule and caption.

The marker fix is then generalised into a source guard: no `style={{ … }}` under
`web/components` or `web/app` may pair a percentage `left`/`right` with a blanket
`translateX(-50%)`. This is what caught `SpendingPacePanel` — the per-component tests covered
the kit, but not every panel that had hand-rolled the same pattern.

### 5. Dashboard — `web/components/dashboard/SpendHeatmap.tsx`

Wrapper `inline-flex` → `flex max-w-full`; the day-grid scroller gains `min-w-0`. The parent
already supplies `min-w-0` and documents the intent, so this makes the existing design work
as written.

### 6. Backstop — `web/app/globals.css`

`html, body { overflow-x: clip; }` and `.ow-drawer` split into explicit per-axis overflow.

## Testing

Fully TDD — every change below had its test written and **watched fail** before any
implementation. Four suites:

| Suite | Covers |
|---|---|
| `test/ui/edge-anchor.test.ts` | the pure module + the containment invariant |
| `test/appearance/no-horizontal-scroll-guard.test.ts` | globals.css backstop, `.ow-drawer`, the shell `<main>`, and the app-wide marker anti-pattern |
| `test/widgets/panels/panel-overflow.test.tsx` | WidgetPanel region, PanelRow, ReconciledMonthCard, CycleStrip |
| `test/dashboard/spend-heatmap-overflow.test.tsx` | heatmap wrapper + scroller |

## Risks

- **`overflow-x: hidden` clips rather than reveals.** Mitigated by fixing the six causes
  first; the hidden/clip declarations are backstops behind real fixes, not substitutes.
- **jsdom cannot observe layout**, so no test proves "0px of horizontal scroll" on a real
  device. Structural guards + a manual visual confirm (quickstart.md) is the honest ceiling
  here, and matches the repo's existing precedent for viewport bugs.
- **`min-w-0` on `<main>` at mobile** is a genuine layout change: children that were being
  sized by their own content now size to the viewport. The full suite passing unchanged is
  the evidence that nothing depended on the old behaviour.
