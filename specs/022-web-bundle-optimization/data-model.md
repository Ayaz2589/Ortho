# Phase 1 Data Model — Web Bundle Optimization

This feature introduces **no database entities, schema, or persisted data**. The "entities" from the
spec are build/delivery constructs. This document defines them concretely as the split boundaries and
the measurement report shape that the implementation and tests target.

## 1. Deferred region (the unit of splitting)

A code region separated from the initial-load download and fetched on demand via `next/dynamic`.

| Region | Eager part (stays in initial load) | Deferred module (on-demand chunk) | Trigger to load | ssr |
|---|---|---|---|---|
| Category chart | `SpendByCategoryCard` shell + legend rows (per-category figures) | `components/dashboard/charts/CategoryPie.tsx` (recharts) | Card mounts on Dashboard | `false` |
| Daily-trend chart | `DailySpendTrendCard` shell + figures | `components/dashboard/charts/DailyTrendChart.tsx` (recharts) | Card mounts on Dashboard | `false` |
| Amortization chart | `MortgageCards` shell + figures | `components/housing/charts/AmortizationChart.tsx` (recharts) | Card mounts on Housing detail | `false` |
| Scan pipeline | Transactions route UI (non-scan) | `ScanFlow` → `components/scan/*` → `lib/scan/*` | User initiates a scan | `false` |
| Desktop dashboard | mobile Dashboard stack | `components/web/DashboardDesktop` | `useIsExpanded()` true | `false` |
| Desktop transactions | mobile Transactions UI | `components/web/TransactionsDesktop` | `useIsExpanded()` true | `false` |
| Desktop housing | mobile Housing UI | `components/web/HousingDesktop` | `useIsExpanded()` true | `false` |

**Invariants**
- The eager part MUST render synchronously with no dependency on the deferred module (FR-002).
- `recharts` MUST be statically imported ONLY inside `components/**/charts/*` leaves (D2/D6).
- Loading a deferred region MUST NOT shift the money figures — its placeholder reserves space (FR-011).
- A deferred region that fails to load MUST leave the surrounding screen usable (FR-010).
- Once loaded in a session, a region MUST NOT re-fetch (Next chunk cache) (FR-007).

## 2. Loading placeholder

The `loading` element rendered by `next/dynamic` until the chunk resolves.

- **Charts**: a fixed-height region matching the chart's current height (no layout shift), styled with
  existing surface/hairline tokens only (no new token, no shimmer — Constitution I/II/IV).
- **Desktop composition**: a neutral, correctly-sized region — NOT the mobile layout — so no
  wrong-layout flash (FR-009). Reserves the composition's outer height.
- **Scan**: the existing scan interstitial/modal chrome opens immediately on initiate; the parsing UI
  fills in when the chunk resolves (matches today's perceived flow).
- Placeholders MUST NOT trap focus or remove keyboard-reachable controls (Constitution V).

## 3. Bundle size measurement report

Output of `web/scripts/measure-bundle.ts`, produced from `web/out/_next/static/chunks`.

**Per-chunk record**
| Field | Type | Meaning |
|---|---|---|
| `file` | string | chunk filename under `_next/static/chunks/` |
| `rawBytes` | number | on-disk size |
| `gzipBytes` | number | `zlib.gzipSync` size (closer to over-the-wire) |
| `kind` | `"entry" \| "shared" \| "async"` | best-effort classification (entry/shared = initial-load; async = on-demand) |

**Report**
| Field | Type | Meaning |
|---|---|---|
| `chunks` | Per-chunk record[] | every JS chunk, descending by `rawBytes` |
| `initialLoadRawBytes` | number | sum of entry+shared chunk raw sizes (the primary metric, SC-001) |
| `initialLoadGzipBytes` | number | sum of entry+shared chunk gzip sizes |
| `totalRawBytes` | number | sum of all chunks |

**Diff** (`--compare` against a saved `--baseline` JSON)
| Field | Type | Meaning |
|---|---|---|
| `initialLoadDeltaBytes` | number | after − before initial-load (negative = improvement) |
| `movedToAsync` | string[] | chunks/deps that left initial-load (e.g. the `recharts` chunk) |
| `perChunkDelta` | record[] | added/removed/changed chunks |

**Rules**
- Pure functions (aggregation, classification, gzip formatting, diff) are unit-tested (D6.1); the only
  impure part is reading the `out/` directory.
- The report is printed as a human-readable table AND written as JSON (for `--baseline`/CI).
- No threshold is hard-failed by this feature (the goal is measurement + a recorded improvement); a CI
  size-budget gate is explicitly out of scope (possible fast-follow).

## 4. State transitions

Only the trivial per-region load lifecycle: `not-loaded → loading (placeholder) → loaded`
(or `→ load-failed → graceful surrounding-screen state`). No persisted or cross-session state.
