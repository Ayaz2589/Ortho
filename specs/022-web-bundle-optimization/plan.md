# Implementation Plan: Web Bundle Optimization (Static-Export-Safe Code-Splitting)

**Branch**: `022-web-bundle-optimization` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/022-web-bundle-optimization/spec.md`

## Summary

Reduce the web app's initial-load JavaScript by lazy-loading its three heaviest, least-frequently-needed code regions — the `recharts` charting library, the on-device scan pipeline (`lib/scan/*` + scan UI), and the desktop-only interface layer (`components/web/*`) — using `next/dynamic` code-splitting. The app ships **zero** lazy loading today (no `next/dynamic` / `React.lazy` anywhere), so these all sit in the initial/shared chunks that every user downloads on both delivery targets. A lightweight bundle-size measurement script (added first) proves each split with a real before/after number. The change is delivery-only: no computed result, behavior, visual, or design token changes; all existing Vitest suites (including the finance regression-vector parity suites) and `tsc --noEmit` stay green; `output: 'export'` is preserved so the Capacitor iOS target is unaffected. Delivered test-first.

This plan is grounded in a file-by-file discovery of the current build output (largest chunks ~410 KB uncompressed), the three `recharts`-importing chart cards, the `ScanFlow` → `lib/scan/*` graph, and the `useIsExpanded()`-gated desktop compositions in the three master–detail routes. See [research.md](./research.md) for the decision log.

## Technical Context

**Language/Version**: TypeScript (Next.js 16.2.9 App Router / React 19.2). No new language or runtime.

**Primary Dependencies**: Existing stack unchanged — `next` (App Router, `output: 'export'`), `react`/`react-dom`, `recharts` (the split target), `@supabase/*`, Tailwind v4, Capacitor 8. Mechanism: **`next/dynamic`** (built into Next, static-export-compatible). Measurement: a new `tsx` script over the built `out/_next/static/chunks` (no new runtime dependency); `@next/bundle-analyzer` considered and rejected (see research D5).

**Storage**: N/A — no data-layer change. Supabase/backend untouched.

**Testing**: Vitest 4 + Testing Library (existing `web/test/`), extended with (a) unit tests for the measurement script's pure size-aggregation/diff/format functions, and (b) component tests asserting each deferred region still renders its content (awaiting the dynamic import) while its eager shell (chart-card numbers/legend) renders synchronously. `tsc --noEmit`. `next build` static export must succeed and produce a working `out/`.

**Target Platform**: Browser (desktop + responsive) and Capacitor iOS (WKWebView loading the static `out/`). Both consume the same build; the iOS build is verified by the existing `capacitor-ios-ci.yml` on push (Linux sandbox cannot build iOS).

**Project Type**: Single web codebase (`web/`), two delivery targets. Not a frontend+backend split — there is no server tier and none is introduced (that is the core constraint).

**Performance Goals**: Reduce initial-load JS measurably (shared/entry chunks shrink by removing `recharts`, `lib/scan/*`, and the non-active form-factor UI). Preserve "tap response feels immediate": Dashboard money figures paint on first render regardless of chart-code load state; no layout shift when deferred pieces appear.

**Constraints**: Static-export-safe — `output: 'export'` stays; no API routes, server actions, middleware, or server-rendered runtime data. No behavior/visual/token change. Deferred browser-only pieces (charts) use `ssr: false` so build-time prerender doesn't try to render them. Test-first (Constitution VI).

**Scale/Scope**: Delivery-mechanism change across ~3 chart cards, ~1 scan host + its call sites, and 3 desktop compositions, plus one measurement script. No new product surface, no user/data scale change.

## Constitution Check

*GATE: evaluated before Phase 0 and re-checked after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. One Design System, Tokens Only | ✅ PASS | No token/color/type change. Loading placeholders reuse existing surface/hairline tokens; FR-015 forbids new tokens. |
| II. Calm Over Dense | ✅ PASS | No UI redesign. Loading placeholders are calm, space-reserving, no shimmer/skeleton alarmism (Principle IV echo); no shadow added. |
| III. Right Form Factor Per Canvas | ✅ PASS | The form-factor split is delivery-only; the same per-canvas compositions render identically. FR-009 preserves the existing synchronous, flash-free breakpoint decision. |
| IV. Plainspoken Voice & Money Formatting | ✅ PASS | No copy/money-format change. Any load state is silent/minimal, never a red or alarmist panel. |
| V. Accessible & Interaction-Complete | ✅ PASS | Same semantic controls; deferred regions render the same accessible DOM once loaded. Loading placeholders must not trap focus or remove reachable controls. |
| VI. Test-Driven & Regression-Safe | ✅ PASS | Delivered test-first (measurement pure-fns and deferred-render tests). The regression-vector parity suites are untouched and must stay green — this feature changes *when* code loads, never *what* it computes. |

**Result: PASS, no violations.** No Complexity Tracking entries required. Re-checked post-Phase-1: unchanged — the design introduces no tokens, no server surface, and no behavior change.

## Project Structure

### Documentation (this feature)

```text
specs/022-web-bundle-optimization/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions (split mechanism, ssr:false, flash/shift, measurement, testing)
├── data-model.md        # Phase 1 — the split boundaries + measurement report shape (no DB entities)
├── quickstart.md        # Phase 1 — how to measure baseline, apply a split, verify before/after
├── contracts/
│   ├── code-split-boundaries.md   # the dynamic-import seams + loading/error fallback contract
│   └── bundle-measurement.md      # measurement script CLI + output contract
├── checklists/
│   └── requirements.md  # spec quality checklist (done in /speckit-specify)
└── tasks.md             # Phase 2 (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

```text
web/
├── components/
│   ├── dashboard/
│   │   ├── SpendByCategoryCard.tsx   # MODIFIED: extract recharts subtree → dynamic child; card shell/legend stay eager
│   │   ├── DailySpendTrendCard.tsx   # MODIFIED: same pattern
│   │   └── charts/                   # NEW: the recharts-rendering leaf components (the only static `import 'recharts'` sites)
│   │       ├── CategoryPie.tsx       # NEW: moved recharts PieChart subtree (dynamic-imported by SpendByCategoryCard)
│   │       └── DailyTrendChart.tsx   # NEW: moved recharts subtree (dynamic-imported by DailySpendTrendCard)
│   ├── housing/
│   │   ├── MortgageCards.tsx         # MODIFIED: extract recharts subtree → dynamic child
│   │   └── charts/
│   │       └── AmortizationChart.tsx # NEW: moved recharts subtree (dynamic-imported by MortgageCards)
│   └── web/
│       ├── ScanFlow.tsx              # UNCHANGED body; now imported via next/dynamic at its call sites
│       ├── DashboardDesktop.tsx      # UNCHANGED body; now dynamic-imported by dashboard/page.tsx
│       ├── TransactionsDesktop.tsx   # UNCHANGED body; now dynamic-imported by transactions/page.tsx
│       └── HousingDesktop.tsx        # UNCHANGED body; now dynamic-imported by housing/page.tsx
├── app/(app)/
│   ├── dashboard/page.tsx            # MODIFIED: dynamic-import DashboardDesktop (layout-reserving fallback)
│   ├── transactions/page.tsx        # MODIFIED: dynamic-import TransactionsDesktop + ScanFlow (scan-gated)
│   └── housing/page.tsx             # MODIFIED: dynamic-import HousingDesktop
├── components/scan/                  # UNCHANGED body; pulled into the on-demand scan chunk via ScanFlow
├── lib/scan/*                        # UNCHANGED; no longer eagerly reachable from the Transactions route
├── scripts/
│   └── measure-bundle.ts             # NEW: reports initial-load + per-chunk raw/gzip sizes; --baseline / --compare
├── test/
│   ├── bundle/measure-bundle.test.ts # NEW: unit tests for the pure size/diff/format functions (test-first)
│   └── <existing chart/scan/route tests> # MODIFIED as needed to await the dynamic import; assertions unchanged
├── package.json                      # MODIFIED: add "measure:bundle" script (+ possibly a dev-only size baseline file)
└── next.config.ts                    # UNCHANGED — output:'export' preserved (verified, not modified)
```

**Structure Decision**: Everything stays inside the existing `web/` package. The only structural addition is a `components/**/charts/` leaf-component convention that isolates every static `import … from 'recharts'` into a file that is *only* ever reached through `next/dynamic`, guaranteeing `recharts` leaves the initial/shared chunk. Desktop compositions and `ScanFlow` are split at their **call sites** with no change to their own bodies, minimizing behavioral risk. The measurement script lives beside the existing `web/scripts/` tooling and is Node/`tsx`-only (never shipped in the app bundle).

## Complexity Tracking

*No entries — the Constitution Check found no violations. The feature is a delivery optimization that adds no tokens, no server surface, and no behavior change.*
