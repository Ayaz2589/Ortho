# Quickstart — Validating Web Bundle Optimization

How to prove the feature works end-to-end, from a Linux sandbox (no Xcode needed). All commands run
from `web/`.

## Prerequisites

- Node per `.nvmrc` (22); `cd web && npm install`.
- `web/.env.local` present (build inlines `NEXT_PUBLIC_SUPABASE_*`).
- Do **not** run this while a shared dev server is up (per constitution / README).

## 0. Capture the baseline (before any split)

```bash
cd web
npm run build                                   # static export → web/out/
npm run measure:bundle -- --json ../specs/022-web-bundle-optimization/baseline.json
```

Record the printed **Initial-load JS (raw / gzip)** and note the largest chunks (expect a ~410 KB-class
chunk containing `recharts`). This is the number every split is measured against (SC-001, SC-006).

## 1. After each split — measure the delta

```bash
npm run build
npm run measure:bundle -- --baseline ../specs/022-web-bundle-optimization/baseline.json
```

Expected across the feature:
- After the **charts** split: `recharts` no longer in an initial-load chunk; it appears as an async
  chunk; initial-load raw/gzip drops. (Largest expected single win — US1/P1.)
- After the **scan** split: `lib/scan/*` no longer in the Transactions route's initial load (US2/P2).
- After the **form-factor** split: the `*Desktop` compositions become their own async chunks; neither
  form factor's initial load contains the other's composition (US3/P3).

## 2. Behavior & regression — must stay green

```bash
npm test          # full Vitest suite incl. the finance regression-vector parity suites
npx tsc --noEmit  # typecheck gate
```

Expected: **all green, unchanged**. This feature changes *when* code loads, never *what* it computes
(SC-005). If a parity suite moves, that is a real regression — stop.

## 3. Visual / behavioral parity (manual, dev server)

```bash
npm run dev       # http://localhost:3000  (only if no shared dev server is running)
```

Check, comparing against current behavior:
- **Dashboard** (US1): money summary paints immediately; the category pie and daily-trend charts
  render a beat later, identical in appearance; no layout shift of the figures when they appear
  (SC-003, FR-011).
- **Housing detail with a mortgage** (US1): the amortization chart renders after load, unchanged.
- **Transactions** (US2): open the route in the browser devtools Network tab filtered to JS — the scan
  chunk is NOT fetched on load; initiate a scan → the scan chunk loads on demand and the
  capture→parse→prefill flow behaves exactly as today; initiate again → no re-fetch (FR-007).
- **Form factor** (US3): at ≥1024px the desktop composition renders with no flash of the mobile layout
  (FR-009); at <1024px the desktop chunk is never fetched (FR-008). Resize across 1024px and confirm
  the existing breakpoint swap still works.
- **Charts with no data / graceful load**: a chart region that is slow/failed to load leaves the
  surrounding card and the money figures usable (FR-010).

## 4. Static-export & iOS safety

- `npm run build` succeeds with `output: 'export'` unchanged and emits `web/out/` (SC-005).
- The deferred modules appear as static files under `web/out/_next/static/chunks/`.
- Push the branch → `capacitor-ios-ci.yml` build-verifies the iOS wrap on a macOS runner (the only
  iOS signal available from a Linux sandbox). Watch with
  `GH_TOKEN=placeholder gh run watch --exit-status`.

## Done when

- Initial-load JS is measurably smaller than the baseline, attributable to `recharts` + `lib/scan/*` +
  the non-active form-factor composition leaving the initial load (SC-001/SC-002, recorded via §1).
- `npm test` and `npx tsc --noEmit` pass unchanged (SC-005).
- No visual/behavioral difference observable in §3 (SC-004).
- `npm run build` static export still works and iOS CI is green (SC-005).
