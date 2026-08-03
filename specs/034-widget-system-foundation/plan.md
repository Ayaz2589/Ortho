# Implementation Plan: Dashboard Widget System (Foundation)

**Branch**: `034-widget-system-foundation` (dev branch: `claude/widget-system-redesign-q6aesu`) | **Date**: 2026-08-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/034-widget-system-foundation/spec.md`

## Summary

Replace the Dashboard **Overview** — today two hand-composed layouts (`dashboard/page.tsx`'s mobile
card stack and `components/web/DashboardDesktop.tsx`'s 12-column `ow-grid`) — with a single
declarative widget framework:

- A **widget registry** (`web/lib/widgets/registry.tsx`): the one source of truth. Each entry
  declares `id`, `title`, `description`, `size`, `defaultEnabled`, and a `Body` render component
  (calm placeholder content only — no live data).
- **Per-browser preferences** (`web/lib/widgets/preferences.ts`): a `ortho.widgets` localStorage
  map of `id → boolean`, defensive read/write mirroring `lib/flags.ts` / `lib/skeletonCounts.ts`.
  A `useWidgetPrefs()` hook adopts stored values after mount and persists on change.
- A **responsive, dense-packing board** (`web/components/widgets/WidgetBoard.tsx`) rendering the
  enabled widgets in one composition for phone → desktop. A single CSS-grid with `grid-auto-flow:
  dense` and `grid-auto-rows: 1fr` so widgets backfill gaps (no empty cells) and equal-height rows
  never leave blank bands.
- A **widget frame** (`web/components/widgets/Widget.tsx`): the calm `ow-card` shell whose body
  flex-grows to fill the cell (no fixed-height wells; no zero-height collapse).
- A **Settings screen** (`web/app/(app)/settings/widgets/page.tsx`) listing every registry widget
  with a real on/off toggle, wired into the mobile settings menu and the desktop secondary nav.

The old overview card components, `DashboardDesktop`, and the overview-only chart are removed along
with their now-obsolete tests. Reports mode is untouched. Placeholder content only — the framework
is the deliverable.

## Technical Context

**Language/Version**: TypeScript 5, React 19, Next.js (App Router, static export), Tailwind v4.

**Primary Dependencies**: existing app store (`lib/store.tsx`), design tokens (`app/globals.css` +
`tailwind.config.ts`), `lucide-react` icons, i18n catalogs (`lib/i18n/*`). No new dependencies.

**Storage**: `localStorage` key `ortho.widgets` (client preference; no Supabase schema change).

**Testing**: Vitest + Testing Library (`npm test` in `web/`), TDD per Principle VI.

**Target Platform**: Web (responsive, compact/medium/expanded) + the Capacitor iOS shell (same bundle).

**Project Type**: Web application (single `web/` Next.js app; no backend change).

**Performance Goals**: No layout-shift flash across the breakpoint; board packs client-side from the
in-memory registry (no network). Keep the desktop board out of the initial mobile-critical path only
insofar as the existing code-split conventions already dictate — a single composition means no
separate desktop chunk is required.

**Constraints**: Tokens only; no shadow on inset cards; hairlines; sage/sand accents; loss never red;
width-capped/centered board; AA contrast; `prefers-reduced-motion` respected; offline-capable
(placeholder content is local).

**Scale/Scope**: ~6 placeholder widgets across the size vocabulary; 1 settings screen; removal of 8
overview cards + 1 desktop composition + 1 overview-only chart; updates to their tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. One Design System, Tokens Only** — PASS. All widget/board/toggle styling uses existing CSS
  vars and the `ow-*` / Tailwind token utilities. No new palette entries. Size footprints map to
  existing grid spans; the board reuses `.ow-card` visuals.
- **II. Calm Over Dense** — PASS. Inset widget cards carry no shadow (matches `.ow-card`); hairline
  separators; placeholder content is quiet; added desktop space is breathing room (width-capped),
  not crammed. The whole point of "no dead space" is calm, complete cards.
- **III. Right Form Factor Per Canvas** — PASS. One composition reflows: single column on compact,
  multi-column dense grid on expanded; width capped and centered. Sidebar/tab-bar unchanged.
- **IV. Plainspoken Voice & Money Formatting** — PASS. Placeholder copy is plainspoken; no money is
  fabricated as real; any sample figures use the money formatter and never use red for loss.
- **V. Accessible & Interaction-Complete** — PASS. Toggles are real `<button>`s (following the
  existing `ChoiceRow` pattern), keyboard reachable, visible sand focus ring, ≥44px touch targets,
  AA contrast, reduced-motion honored.
- **VI. Test-Driven & Regression-Safe** — PASS. Pure preference logic (`preferences.ts`) and the
  registry get failing-test-first coverage; board packing and toggle behavior are asserted through
  the accessible DOM. Deleted components' obsolete tests are removed, not silently broken.

**No violations — Complexity Tracking not required.**

## Project Structure

### Documentation (this feature)

```text
specs/034-widget-system-foundation/
├── plan.md              # This file
├── spec.md              # Feature spec
├── research.md          # Phase 0 — decisions & rationale
├── data-model.md        # Phase 1 — registry / preferences / size model
├── quickstart.md        # Phase 1 — how to add a widget; how it renders
├── contracts/
│   └── widget-system.md # Phase 1 — module contracts (registry, prefs, board, frame)
└── checklists/
    └── requirements.md  # Spec quality checklist (from /speckit-specify)
```

### Source Code (repository root)

```text
web/
├── lib/
│   └── widgets/
│       ├── registry.tsx        # NEW — widget definitions (id, title, description, size, default, Body)
│       ├── preferences.ts      # NEW — ortho.widgets read/write (defensive) + resolve enabled ids
│       └── useWidgetPrefs.ts   # NEW — hook: [prefs, setEnabled] with mount-adopt + persist
├── components/
│   └── widgets/
│       ├── Widget.tsx          # NEW — calm card frame, body fills the cell
│       ├── WidgetBoard.tsx     # NEW — responsive dense-packing grid (one composition)
│       ├── WidgetEmptyState.tsx# NEW — calm "no widgets enabled" state → Settings
│       └── placeholders.tsx    # NEW — calm placeholder Body components per widget
├── app/(app)/
│   ├── dashboard/page.tsx      # EDIT — overview renders <WidgetBoard/>; Reports mode preserved
│   └── settings/
│       ├── page.tsx            # EDIT — add "Widgets" LinkRow to the settings menu
│       └── widgets/page.tsx    # NEW — per-widget on/off toggles
├── components/settings/
│   └── SettingsSecondaryNav.tsx# EDIT — add "Widgets" to the desktop settings nav
├── app/globals.css             # EDIT — add .ow-board dense-grid + size-span classes (tokens only)
└── lib/i18n/{es,bn,ja,ko,zh}.ts# EDIT — translate new UI chrome strings

# REMOVED (overview-only, replaced by the framework):
web/components/web/DashboardDesktop.tsx
web/components/dashboard/{MonthSummaryCard,InsightsCardStack,BudgetProgressCard,
  SpendByCategoryCard,PerOwnerBreakdownCard,TopMerchantsCard,HousingSnapshotCard,
  DailySpendTrendCard}.tsx
web/components/dashboard/charts/DailyTrendChart.tsx   # only consumer was DailySpendTrendCard
# + their now-obsolete tests (see tasks.md); Reports-mode components/charts are kept.

tests: web/test/widgets/*  (NEW) + edits/removals to the affected dashboard tests.
```

**Structure Decision**: Single Next.js `web/` app. New framework code is namespaced under
`lib/widgets/` (logic) and `components/widgets/` (UI), mirroring the existing `lib/`/`components/`
split and the `dataFile/` precedent. The registry is the only file a future widget author edits.

## Phase 0 — Research

See [research.md](./research.md). Key decisions: size vocabulary and how it maps to grid spans; the
CSS `grid-auto-flow: dense` + `grid-auto-rows: 1fr` packing strategy that guarantees no empty cells
and no blank bands; single-composition responsiveness via `repeat(auto-fill/fixed cols)`; persistence
mirroring `flags.ts`; keeping Reports mode; the exact removal set and its test blast radius.

## Phase 1 — Design & Contracts

- [data-model.md](./data-model.md) — `WidgetDefinition`, `WidgetSize`, `WidgetPrefs`, resolution
  rules (stored ∪ defaults, unknown ids ignored).
- [contracts/widget-system.md](./contracts/widget-system.md) — the public surface of `registry`,
  `preferences`, `useWidgetPrefs`, `Widget`, and `WidgetBoard`, with the invariants each test locks.
- [quickstart.md](./quickstart.md) — add-a-widget in one registry entry; verify it toggles + packs.

## Complexity Tracking

No constitution violations — section intentionally empty.
