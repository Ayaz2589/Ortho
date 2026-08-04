# Implementation Plan: Housing Dashboard Widgets

**Branch**: `feat/036-housing-widgets` | **Date**: 2026-08-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/036-housing-widgets/spec.md`

## Summary

Add two widgets to the spec-034 widget board that surface the existing household housing roll-up:

- **Housing costs** (`housing-costs`) — total monthly housing cost (all mortgage payments + all lease
  rents), the property count, and the net monthly rental cashflow when a multifamily property exists.
- **Home equity** (`home-equity`) — total principal paid down across all mortgages with a progress
  bar toward the total original loan and an "X% paid off" caption.

Both bodies are propless, read `properties` via `useApp()`, and derive their figures from the pure
`housingSummary()` roll-up (`web/lib/finance/housing-summary.ts`) — no new or changed finance math.
Adding a widget is a registry entry + a body component + i18n + a test, per the spec-034 recipe; no
board, settings, or preference code changes.

## Technical Context

**Language/Version**: TypeScript 5, React 19, Next.js (App Router, static export), Tailwind v4.

**Primary Dependencies**: existing app store (`lib/store.tsx`), `housingSummary()`
(`lib/finance/housing-summary.ts`), widget registry (`lib/widgets/registry.tsx`), design tokens
(`app/globals.css`), i18n catalogs (`lib/i18n/*`). No new dependencies. No new finance modules.

**Storage**: none new. Enabled/disabled state uses the existing `ortho.widgets` localStorage prefs.

**Testing**: Vitest + Testing Library (`npm test` in `web/`), TDD per Principle VI.

**Target Platform**: Web (responsive) + the Capacitor iOS shell (same bundle).

**Project Type**: Web application (single `web/` Next.js app; no backend change).

**Constraints**: Tokens only; no shadow beyond `.ow-card`; hairlines; sage/sand accents; loss/cost
never red; each body fills its 300px cell (`h-full`) with content or a calm empty state.

**Scale/Scope**: 2 registry entries, 2 body components, ~13 new i18n strings × 5 catalogs, 2 test
files. No deletions.

## Constitution Check

*GATE: Must pass before Phase 0. Re-check after design.*

- **I. One Design System, Tokens Only** — PASS. Bodies reuse `.ow-card` frame (via `Widget`), token
  colors (`--text`, `--text-2`, `--text-3`, `--positive`, `--chip-bg`), hairline separators; the
  progress bar mirrors `BudgetsBody`'s token-only bar. No new palette entries.
- **II. Calm Over Dense** — PASS. Two quiet number-forward tiles; default-off so the first-run board
  is unchanged; empty states are calm, not alarmist.
- **III. Right Form Factor Per Canvas** — PASS. Bodies are propless and reflow inside the one board
  composition; no separate mobile/desktop code.
- **IV. Plainspoken Voice & Money Formatting** — PASS. Copy is plainspoken; all money uses
  `formatMoney`; net rental and any negative value use the minus glyph, never red.
- **V. Accessible & Interaction-Complete** — PASS. Bodies are static text/figures inside the existing
  accessible card frame; no new controls; AA contrast via tokens.
- **VI. Test-Driven & Regression-Safe** — PASS. Each body gets a failing-test-first spec; the pure
  `housingSummary()` remains pinned by `test/store.integrity.test.tsx`; registry integrity and
  extensibility tests continue to pass with the two new ids.

**No violations — Complexity Tracking not required.**

## Project Structure

### Documentation (this feature)

```text
specs/036-housing-widgets/
├── plan.md          # This file
├── spec.md          # Feature spec
├── data-model.md    # Derived data each widget reads
└── quickstart.md    # How the widgets render / how to enable them
```

### Source Code (repository root)

```text
web/
├── components/widgets/bodies/
│   ├── HousingCostsBody.tsx   # NEW — total monthly cost + count + (multi) net rental
│   └── HomeEquityBody.tsx     # NEW — principal paid down + progress toward original loan
├── lib/widgets/registry.tsx   # EDIT — import + two entries (housing-costs, home-equity)
└── lib/i18n/{es,bn,ja,ko,zh}.ts  # EDIT — translate the new widget strings

tests:
web/test/widgets/housing-costs.test.tsx   # NEW
web/test/widgets/home-equity.test.tsx      # NEW
```

**Structure Decision**: Follow the spec-034 add-a-widget recipe exactly. Logic lives in the existing
pure `housingSummary()`; the bodies are thin presentational readers. The registry is the only shared
file edited; the board and settings surfaces pick up the new widgets automatically (FR-008).

## Phase 0 — Research

No open questions. Decisions:

- **Reuse `housingSummary()`; add no finance math.** It already returns `{ cost, equity, netRental,
  multi, count }`. Home equity's progress denominator (total original loan) is summed locally from
  `properties` in the body — a raw-data read, not duplicated math — to avoid changing the spec-locked
  pure function and its pinned test.
- **Point-in-time, not windowed.** Housing cost and amortization are current-state, so the bodies do
  not read `useDashboardScopeContext` (mirroring `ActivityBody`). This also keeps their tests from
  needing to mock the scope context.
- **Default-off.** Both ship `defaultEnabled: false`, consistent with `activity`, so households
  without housing data never see empty housing tiles unbidden.

## Phase 1 — Design & Contracts

- [data-model.md](./data-model.md) — the exact fields each body reads and derives.
- [quickstart.md](./quickstart.md) — enabling the widgets and what each shows.

## Complexity Tracking

No constitution violations — section intentionally empty.
