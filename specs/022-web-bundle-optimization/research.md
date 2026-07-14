# Phase 0 Research — Web Bundle Optimization

All decisions are grounded in the current codebase (Next.js 16.2.9, React 19.2, `output: 'export'`)
and the discovery captured in `plan.md`. No open `NEEDS CLARIFICATION` items remain.

## D1 — Code-split mechanism: `next/dynamic` with `ssr: false`

**Decision**: Use `next/dynamic(() => import('...'), { ssr: false, loading: <reserved placeholder> })`
for every deferred region. All the affected files are already Client Components (`'use client'`),
and `next/dynamic` is the App-Router-native, static-export-compatible splitting primitive.

**Rationale**:
- The chart cards and `useMediaQuery` are already `'use client'`; `next/dynamic` composes cleanly.
- `ssr: false` is **required** for the charts: `recharts`' `ResponsiveContainer` measures the DOM
  (`ResizeObserver` / `getBoundingClientRect`), which cannot run during Next's build-time prerender.
  Under `output: 'export'` there is no request-time SSR anyway; `ssr: false` tells the build-time
  prerender to skip the component and emit only the placeholder, then hydrate/load it on the client.
- Produces a separate async chunk per split boundary; Next dedups shared deps (`recharts`) into one
  async chunk shared by the three chart leaves, so `recharts` leaves the initial/shared chunk exactly
  once.

**Alternatives considered**:
- `React.lazy` + `<Suspense>`: works, but `next/dynamic` is the idiomatic Next wrapper (adds the
  `ssr:false` and `loading` ergonomics and is what the codebase's tooling/docs expect). Rejected for
  consistency, not capability.
- Manual `webpack`/`turbopack` `splitChunks` tuning: opaque, fragile across Next upgrades, and does
  not express "load on demand." Rejected.

## D2 — Charts: split the recharts *subtree*, keep the card shell eager

**Decision**: For each of `SpendByCategoryCard`, `DailySpendTrendCard`, `MortgageCards`, move the
`recharts`-rendering JSX into a new leaf component under `components/**/charts/` and dynamic-import
that leaf. The card's title, legend rows, and money figures stay in the eager module and render
synchronously; only the chart canvas defers.

**Rationale**:
- Satisfies FR-002/SC-003: the Dashboard's numbers (legend rows *are* the per-category/day figures)
  paint immediately; the pie/line canvas streams in.
- Isolates the *only* static `import … from 'recharts'` into files reachable exclusively via
  `next/dynamic`. If any eager module still statically imports `recharts`, the split silently fails —
  so concentrating the import in the leaf files makes the guarantee auditable (see D6 guard test).
- The three leaves share one `recharts` async chunk (D1), so a route with two chart cards fetches
  `recharts` once.

**Alternatives considered**:
- Dynamic-import the *entire card*: would defer the money figures too, violating FR-002. Rejected.
- Replace `recharts` with a lighter chart lib: out of scope (behavior/visual parity required, and it
  is a much larger change). Rejected.

## D3 — Scan pipeline: dynamic-import `ScanFlow` at its call sites

**Decision**: Import `ScanFlow` via `next/dynamic({ ssr: false })` at its render sites (the mobile
Transactions route and the desktop `TxForm` scan entry), gated on the scan-initiated state, so the
`ScanFlow → components/scan/* → lib/scan/*` graph forms an on-demand chunk fetched only when a scan
starts. `ScanFlow`'s own body is unchanged.

**Rationale**:
- FR-005/006/007: scanning is an explicit, occasional action; deferring the whole graph removes it
  from the Transactions route's initial load while preserving identical capture→parse→prefill
  behavior. Once loaded, Next caches the chunk, so re-initiating a scan does not re-fetch.
- `ssr: false` is appropriate: the scan flow touches Capacitor/native + browser APIs and never needs
  build-time prerendering.
- Splitting at the call site (not inside `ScanFlow`) keeps the behavioral change to *when the module
  loads*, not *what it does*.

**Alternatives considered**:
- Route-level split of the whole Transactions page: too coarse — the non-scan transactions UI must
  stay eager. Rejected.

## D4 — Form-factor split: preserve the synchronous, flash-free breakpoint decision

**Decision**: In `dashboard/page.tsx`, `transactions/page.tsx`, `housing/page.tsx`, keep the existing
synchronous `useIsExpanded()` gate but dynamic-import the `*Desktop` composition with a
**layout-reserving, non-mobile** `loading` placeholder. The mobile branch is unchanged and stays
eager (it is the smaller, always-needed default).

**Rationale**:
- `lib/useMediaQuery.ts` resolves `matches` synchronously in the `useState` initializer specifically
  to avoid a flash of the wrong breakpoint. The split must not regress this: the *decision* stays
  synchronous, so a desktop client immediately chooses the desktop branch; only the desktop
  *module* loads async. The `loading` placeholder must be a neutral, correctly-sized region (not the
  mobile layout), so there is no wrong-layout flash (FR-009) — it trades "instant desktop paint from
  a bigger bundle" for "smaller bundle + a brief neutral placeholder," which is acceptable and the
  reason this is the lowest-priority, most-careful split (P3).
- Only one form factor's composition downloads per session (FR-008): mobile sessions never fetch the
  `*Desktop` chunk; desktop sessions fetch it once.

**Risk / mitigation**: Static export prerenders the mobile branch (window undefined → `matches=false`)
into the HTML. On desktop, hydration swaps to the desktop branch. This swap exists **today** and is
covered by the synchronous hook; dynamic-importing the desktop module adds a load delay, not a new
swap. Mitigation: reserve the desktop region's height in the placeholder to avoid layout shift, and
verify visually (quickstart) that no mobile→desktop flash is introduced. If a flash is observed,
fall back to eager-importing the desktop composition for that route (drop just that route from the
split) — the charts/scan splits deliver the bulk of the win regardless.

## D5 — Measurement: a `tsx` chunk-size script, not `@next/bundle-analyzer`

**Decision**: Add `web/scripts/measure-bundle.ts` (run via `tsx`, `npm run measure:bundle`) that walks
`web/out/_next/static/chunks`, reports each chunk's raw + gzipped size and the total initial-load JS,
and supports `--baseline <file>` / `--compare <file>` to emit a before/after diff. No new runtime
dependency (`recharts`/app bundle unaffected); `zlib.gzipSync` from Node stdlib gives the gzip size.

**Rationale**:
- FR-012/SC-006: needs a *repeatable, headless, diffable* number, not an interactive visualization.
  A script prints a deterministic table and a machine-readable JSON, usable locally and in CI.
- `@next/bundle-analyzer` is a dev dependency that opens an interactive treemap (great for
  exploration, poor for automated before/after assertions) and pulls extra deps. Rejected as the
  primary tool; may be added later ad hoc for exploration, but is not required by this feature.

**Alternatives considered**:
- Parse `next build`'s stdout "First Load JS" table: brittle (format changes across Next versions,
  and static export's table differs). The `out/` chunk walk is stable and truthful about what ships.
  Rejected as primary; the build table is a sanity cross-check only.

## D6 — Testing strategy (test-first, Constitution VI)

**Decision**:
1. **Measurement script** — write Vitest unit tests first for its pure functions (size aggregation,
   gzip-size formatting, baseline/compare diff, human-readable table). These are deterministic
   pure-logic tests, matching the `lib/` discipline.
2. **Deferred-render tests** — for each split, a Testing-Library test that (a) asserts the eager shell
   content renders synchronously (chart-card legend/numbers present without the chart), and (b)
   `await`s the dynamically-imported region and asserts it renders the same accessible content as
   today. Existing chart/scan/route tests are adjusted only to `await` the async import; their
   assertions are unchanged.
3. **Split-integrity guard (optional but recommended)** — a source-level test asserting no eager
   module under `components/dashboard|housing` statically imports `recharts` (only the
   `components/**/charts/*` leaves may), so a future accidental static import that would re-bloat the
   initial chunk fails CI.

**Rationale**:
- `recharts` + `ResponsiveContainer` are flaky to assert on pixels in jsdom; tests assert **presence
  of accessible DOM/behavior**, never pixels (Constitution VI). `next/dynamic({ssr:false})` renders
  the `loading` placeholder first then the component after the import resolves, so tests must use
  `findBy*`/`await`; this is the only test change required by the split.
- The regression-vector parity suites are **not** touched — this feature computes nothing new.

**Alternatives considered**:
- Snapshot/pixel tests for charts: violates "behavior not pixels" and is flaky in jsdom. Rejected.

## D7 — Static-export & iOS safety (the hard constraint)

**Decision**: Do not modify `next.config.ts`; `output: 'export'` stays. Every dynamic import uses
`ssr: false` (no build-time render of browser-only pieces). No API route, server action, middleware,
or server data is introduced. iOS build correctness is confirmed by the existing
`capacitor-ios-ci.yml` on push (the Linux sandbox builds the export + runs Vitest/tsc but cannot
build the iOS app).

**Rationale**: FR-013/SC-005. `next/dynamic` code-splitting is fully supported under static export —
it produces additional static chunks under `out/_next/static/chunks/` that both the browser and the
Capacitor WKWebView load exactly like any other chunk. The change is invisible to the delivery model.

**Verification loop (this sandbox)**: `cd web && npm run build` (static export succeeds, `out/`
produced) → `npm run measure:bundle` (before/after) → `npm test` (all green, incl. parity suites) →
`npx tsc --noEmit`. Push triggers `capacitor-ios-ci.yml` for the iOS build signal.
