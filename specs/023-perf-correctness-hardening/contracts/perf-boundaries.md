# Contract — Performance Boundaries (US2, US6)

Each perf change has an **observable guarantee** and a **guard** proving it. Every item's core
promise: *identical output, less work / less download.*

## C-P1 — Lazy i18n catalogs (FR-012/013)
- **Guarantee**: non-active-language catalogs are NOT in initial-load; a default (English/System-
  English) session downloads zero translation catalogs; switching language loads exactly one; the
  displayed translations are unchanged once loaded.
- **Boundary**: `lib/i18n/index.ts` exposes an async loader; `makeT` returns English identity until
  the active catalog `import()` resolves; store adopts it in the after-mount preference path.
- **Guards**:
  - `test/bundle/*` or `test/i18n/*`: assert no eager `import` of `es|ja|zh|ko|bn` catalogs from
    modules on the initial-load path (mirrors the spec-022 `no-eager-recharts` guard).
  - `npm run measure:bundle -- --baseline <023 baseline>`: initial-load gzip decreases by ≈ the
    catalog weight.
  - `test/i18n/render-locale.test.tsx`: updated to `await` the async load; still asserts no English
    leak for a translated screen once loaded.

## C-P2 — `Intl` formatter cache (FR-014)
- **Guarantee**: `formatMoney` and the `lib/format.ts` date helpers produce **byte-identical** output
  to today; no `Intl.*Format` is constructed more than once per distinct arg-tuple.
- **Boundary**: module-level `Map` keyed by all output-affecting args.
- **Guards**: the finance regression-vector suites stay green **without regeneration** (byte-identical
  proof); an optional unit test asserts a second call with the same args reuses the cached instance.

## C-P3 — Dashboard aggregation memoization (FR-015)
- **Guarantee**: `InsightsCardStack`, `MonthSummaryCard`, `BudgetProgressCard` render identical
  content; their aggregations don't recompute on unrelated re-renders.
- **Boundary**: `useMemo` keyed on real inputs; `BudgetProgressCard` uses one grouped in-range slice
  instead of per-category whole-array rescans.
- **Guards**: existing dashboard component tests stay green; an optional test asserts the memo does
  not recompute when an unrelated prop/state changes (spy on the aggregation fn).

## C-P4 — Store context split + `React.memo` rows (FR-016) — structural
- **Guarantee**: `useApp()` public surface is unchanged (no consumer import changes); a single
  unrelated state change (one optimistic add, an FX refresh, a loading toggle) does not re-render
  every `TransactionRow`/dashboard card — only affected components; **no visual difference**.
- **Boundary**: two internal contexts (stable actions/services vs changing data) behind `useApp()`;
  `TransactionRow`/desktop `TxRow` wrapped in `React.memo`. `formatMoney` identity still changes on
  currency/rate/locale change.
- **Guards**: all existing store + component behavior tests stay green; a render-count test (e.g. a
  row's render counter) asserts an unrelated mutation does not re-render an unrelated row. Ledger
  virtualization is a follow-on **only if** it introduces no scroll/visual regression (else deferred).

## C-P5 — `loadAll` column projection (FR-017)
- **Guarantee**: `loadAll` fetches only used columns; the resulting in-app data (and every downstream
  computed value) is identical to today.
- **Boundary**: explicit `select(<columns>)` on `transactions`/`transaction_shares`/`users`, kept in
  lockstep with the FR-018 row types.
- **Guards**: store tests (via the Supabase mock) stay green with the projected column sets; the
  regression vectors (fed by the same domain objects) are unchanged.

## Cross-cutting
- **Static-export-safe**: any dynamic `import()` uses `{ ssr: false }` where it renders UI; no server
  surface added. `next build` static export must still succeed (all routes prerendered).
- **Measurement**: record a fresh 023 baseline (`measure:bundle --json`) BEFORE changes and diff after
  P1, to attribute the initial-load reduction (SC-002), same protocol as spec 022.
