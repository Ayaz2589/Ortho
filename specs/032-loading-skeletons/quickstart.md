# Quickstart: Content-shaped loading skeletons

Validation guide to prove the feature works end-to-end. Run from `web/`.

## Prerequisites

```bash
cd web
npm install
# Linux sandbox only, if native bindings are missing (see docs/web.md §16):
# npm install @rolldown/binding-linux-arm64-gnu lightningcss-linux-arm64-gnu \
#   @tailwindcss/oxide-linux-arm64-gnu @next/swc-linux-arm64-gnu --no-save
```

## Automated checks (the gate)

```bash
npx tsc --noEmit          # must stay clean — a type error fails next build
npm test                  # vitest (UTC); new suites under test/skeletons/ must pass
```

Expected new/affected suites:
- `test/skeletons/skeletonCounts.test.ts` — read/write, validation, clamping, storage-off fallback.
- `test/skeletons/Skeleton.test.tsx` — static (no `animate-pulse`), token fill, `aria-hidden`.
- `test/skeletons/RouteSkeleton.test.tsx` — each path → correct skeleton; unknown → generic; sizing
  from remembered counts.
- `test/skeletons/reports-loading-skeleton.test.tsx` — Reports views show a skeleton in `loading`;
  `error` and empty states unchanged.

## Manual validation (visual)

```bash
npm run dev   # http://localhost:3000
```

1. **First paint per route**: hard-reload on `/dashboard`, `/transactions`, `/housing`,
   `/budgets`, `/goals`, `/settings`. While data loads you should see a **shaped** skeleton
   matching that page — not a centered "Loading…" string. (Throttle the network in devtools to
   hold the loading state long enough to observe.)
2. **No jump on resolve**: when data arrives, the real content replaces the skeleton in the same
   region — no snap from a tiny centered string to a full page.
3. **Sized to your data**: on `/transactions` with many rows, reload — the ledger skeleton is
   tall (≈ your row count, capped at 24). On `/goals` with 3 goals, reload — a short 3-card
   skeleton. Inspect `localStorage['ortho.skeletonCounts']` to see the recorded counts.
4. **First-ever load**: clear `localStorage['ortho.skeletonCounts']`, reload a list screen —
   a small default number of placeholders renders, then the real count is recorded.
5. **Reports**: open Dashboard → Reports mode; while the aggregates fetch, the savings-rate and
   category views show a chart/rows skeleton instead of "Loading…". Drive it to error (offline)
   and to an empty window — those states are unchanged.
6. **No motion**: confirm skeletons are motionless (no pulse/shimmer), including with OS
   "Reduce motion" on.
7. **Precedence intact**: a lapsed entitlement still shows the Paywall (not a skeleton); a
   failed bootstrap still shows the error banner + Retry (skeleton does not mask it).

## Acceptance mapping

- US1 (shaped shell skeleton) → steps 1–2, `RouteSkeleton` suite.
- US2 (sized to remembered count) → steps 3–4, `skeletonCounts` + `RouteSkeleton` suites.
- US3 (Reports skeletons) → step 5, `reports-loading-skeleton` suite.
- Constitution (no shimmer / reduced-motion) → step 6, `Skeleton` suite.
- Precedence / error / empty (SC-005) → step 7.
