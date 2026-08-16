# shared/ — Regression test vectors

> Read this when: touching any vectored pure-logic engine, regenerating `shared/test-vectors/*.json`,
> adding a new vector file, or debugging a parity-test or vector-drift CI failure.

## 1. What it is

`shared/` contains exactly one thing: `shared/test-vectors/` — **13 JSON files** of canonical
input→output cases plus a `README.md`, generated from the pure TS finance engines and asserted by
the web Vitest suite. Originally a cross-language parity lock between TS and a Swift mirror; since
spec 021 the native SwiftUI app is frozen (see `./ios.md`) and this is a
**single-implementation regression/pinning suite**: it catches accidental behavior changes in the
pure logic, with no second language to diff against. `PARITY.md` (repo root) is the audited
capability↔vector contract.

Not in `shared/`: no shared types (`web/lib/types.ts`), no design tokens (`web/app/globals.css`),
no runtime code. Test fixtures only — nothing here ships.

## 2. The loop

```
web/lib/* + web/components/{dashboard/range,housing/lease}.ts   (the engines)
        │  cd web && npm run gen:vectors        (tsx scripts/gen-vectors.ts)
        ▼
shared/test-vectors/*.json    committed; regenerated only on INTENDED behavior change
        │
        └── web/test/*.parity.test.ts (13 files, 1:1 with the JSONs) read them via
            resolve(here, '../../shared/test-vectors/<file>.json')   (cd web && npm test)
```

CI gate (`.github/workflows/web-ci.yml`, `typecheck-and-test` job): after `npm test` it runs
`npm run gen:vectors` and fails if `git diff --quiet ../shared/test-vectors` is dirty. So an engine
change without committed regenerated JSON fails CI; a change *with* regenerated JSON passes —
**intent review happens on the vector diff** (§5).

## 3. Engine → vector map (13 files)

Generator: `web/scripts/gen-vectors.ts` (~794 lines, one script writes all 13). Case counts as of
2026-07-19; every case carries a human-readable `name` used as the test name.

| Vector JSON | Engine (exact source) | Shape / cases |
|---|---|---|
| `mortgage.json` | `lib/finance/mortgage.ts` — 7 exports incl. `upcomingAmortization(12,…)` (not `monthsElapsed`/`PAID_OFF_THRESHOLD_CENTS`) | array, 8 (zero-interest; month-end-closing boundary) |
| `insights.json` | `lib/finance/insights.ts` `generateInsights` (8 rules) | array, 12 scenarios → `{id, severity, category, magnitude_cents, preview_merchants}` |
| `transaction-filters.json` | `lib/transactionFilters.ts` `filterTransactions`, `monthBounds`, `emptyCriteria` | `{cases: 22}` → `expectedIds`; incl. spec-027 tags dimension, notes/tag-name search |
| `transaction-splits.json` | `lib/splits.ts` `computeShares`/`validateSplit`/`seedSplit`/`orderedOwnerIds` | `{cases: 13, validations: 4, seeds: 6, ownerOrdering: 5}` |
| `currency.json` | `lib/finance/money.ts` `toDisplayAmount`/`toUSDCents` at `FALLBACK_RATE_FROM_USD` | `{toDisplay: 49, toUsdCents: 49}` (7 currencies × 7 amounts) |
| `currency-names.json` | `lib/finance/currency.ts` `CURRENCY_NAMES` | fixed table, 7 |
| `currency-symbols.json` | `lib/finance/currency.ts` `currencySymbol()` (`cny` = `CN¥`) | fixed table, 7 |
| `dashboard-month-scope.json` | `components/dashboard/range.ts` | `{availableMonths: 6, availableRanges: 11, monthReferenceDate: 4, stepMonth: 5}` |
| `member-balance.json` | `lib/finance/balances.ts` `balanceBetween` | `{cases: 9}` (incl. `transfer`-kind reimbursements) |
| `housing-net-rental.json` | `lib/finance/housing.ts` `occupiedRentCents`/`netRentalCents` | array, 6 (occupancy pre-resolved to boolean) |
| `lease.json` | `components/housing/lease.ts` `rentDueDay`/`daysUntilNextRent`/`daysUntilEnd`/`isRenewalSoon` | array, 6, injected `asOf` |
| `budget-rollover.json` | `lib/finance/budgets.ts` `computeRolloverLedger` (spec 027; contract `specs/027-budget-rollover/contracts/rollover-math.md`) | array, 11 (fixed/flex/non_monthly, cap, negative opening carry) |
| `goals.json` | `lib/finance/goals.ts` `goalProgress` + `goalPacing` (spec 027) | `{progress: 7, pacing: 7}`, injected `now` |

Deliberately unvectored (policy, not gaps): display/format strings, `lib/reports/*`,
`lib/entitlements.ts` (literal vectors V01–V19 + digest instead — see `PARITY.md`),
`budgetStatusForMonth` (pure reduction over the vectored core), dashboard month→window
(reuses vectored `monthBounds`), goal off-track insight *strings*, the import CLI
(`web/scripts/import/` asserts against no vector — its own golden statement tests live in
`web/test/import/`). `goals-thresholds.ts`/`insights-thresholds.ts` are unit-tested, not vectored.

## 4. Determinism conventions

- **TZ pinning is three-way**: `gen-vectors.ts` sets `process.env.TZ = 'UTC'` before any Date math
  (line 38); `web/vitest.config.ts` pins UTC; `web/vitest.tz.config.ts` pins `America/New_York`
  for the `*.tz.test.ts` timezone-reproduction suites only (see §6).
- **All money is integer USD cents.** Percent/even split paths use IEEE-754 doubles (originally
  for TS↔Swift bit-exactness; kept as-is).
- **Two date-parse regimes** (mixing them up is the classic west-of-UTC month bug):
  mortgage/lease/goals date-only strings parse as **local** calendar dates (generator helper `d()`;
  engines via `parseLocalDate`); insight tx dates are UTC-midnight `YYYY-MM-DD` kept **mid-month**;
  filter dates and `monthBounds` windows are **UTC half-open `[from, to)`**.
- **Transaction/filter ids are lowercase UUID strings**; the **insight `id` scheme is part of the
  contract** (`top-category-dining-2026-06`, `outlier-<lowercase-uuid>`, …). Recurring-average
  division truncates toward zero (Int64 semantics), not `Math.round`.
- Pretty-printed JSON (`JSON.stringify(…, null, 2)` + trailing newline) so diffs are reviewable.
- Comments in `gen-vectors.ts` tag pinned historical bug classes (R6 recurring truncation, R7
  month-end mortgage boundary, R8 outlier-id casing, C1 leftover-cent contract). Its header still
  says "web and iOS suites" — stale two-language framing; the mechanism is unchanged.

## 5. Regeneration discipline

```bash
cd web && npm install          # once; Node 22 (.nvmrc; engines >=20.19 || >=22.12)
npm run gen:vectors            # rewrites ../shared/test-vectors/*.json
npm test                       # 13 parity suites + everything else
```

- **Never hand-edit the JSONs** — the next `gen:vectors` silently reverts edits. Fix the engine or
  the case list in `gen-vectors.ts`.
- **Regenerating launders bugs.** Expected values come from the same TS engines the tests assert,
  so the suites are self-referential: regenerate after an *unintended* change and everything still
  passes. There is no second implementation to catch it — **review every vector diff as a
  behavior-change diff**, never rubber-stamp.
- **The generator asserts nothing** — it writes whatever the engines return. The safety net is the
  diff review plus the web-ci drift gate (§2).
- **Adding a new vector file** (post-021): two touchpoints — a section + `writeFileSync` in
  `gen-vectors.ts`, and one `web/test/<name>.parity.test.ts`. No pbxproj/Swift wiring; the frozen
  app is not a consumer (`budget-rollover.json` and `goals.json` were added this way).

## 6. How Vitest asserts them

- **13 parity suites**, `web/test/*.parity.test.ts`, 1:1 with the JSONs. Naming matches the JSON
  basename except `transaction-splits.json` ↔ `splits.parity.test.ts`.
- Default config `web/vitest.config.ts`: TZ=UTC, node env (jsdom is per-file opt-in), excludes
  `**/*.tz.test.ts`, `fileParallelism: false` (sandbox jsdom worker race).
- `npm run test:tz` (`vitest.tz.config.ts`, TZ=America/New_York) runs ONLY the `*.tz.test.ts`
  files — currently `web/test/insights-timezone.tz.test.ts` and
  `web/test/corpus/insights-timezone.tz.test.ts` (spec 026 defect A2 reproduction). **No workflow
  runs `test:tz`** — it is local-only; the default `npm test` never sees these files.
- The spec-026 coverage corpus (`web/test/corpus/`, snapshot-gated via `npm run gen:corpus`) is a
  separate harness — see `./web.md`.

## 7. Cross-links

- `./web.md` — the generator, engines, full Vitest suite, and the Capacitor shell.
- `PARITY.md` — the audited web-vs-CLI matrix and enforcement summary; pre-021 iOS↔web history is
  archived at `docs/archive/PARITY-2026-07-08.md`.
- `./finance.md` — per-engine semantics (rounding, carry rules, thresholds) behind each vector.
- `./ios.md` — the frozen native app; its XCTest parity suites are historical only.
- `./makefile.md` — the Makefile is ingest/tx CLI only; vector regen is `npm run gen:vectors`.
