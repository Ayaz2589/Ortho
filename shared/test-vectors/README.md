# Shared golden test vectors

Canonical input→output cases for the finance logic that is implemented in **both**
the web (TypeScript) and iOS (Swift) clients. Both test suites assert against
these exact files, so neither language can silently drift. This is the cheap,
no-backend way to keep cross-language parity (see `specs/002-logic-dedup`).

## Files (12)

- `mortgage.json` — `MortgageInfo` / `lib/finance/mortgage.ts` cases: monthly
  payment, current balance, equity, equity fraction, maturity date, years
  remaining, and a 12-month amortization slice. Inputs are USD cents + a pinned
  `asOf` date. Includes a zero-interest loan and month-end-closing boundary cases.
- `insights.json` — `InsightEngine` / `lib/finance/insights.ts` scenarios:
  a snapshot (transactions, budgets, properties) + a pinned `referenceDate`,
  with the expected list of fired insights (`id`, `severity`, `category`,
  `magnitude_cents`, `preview_merchants`).
- `transaction-filters.json` — `filterTransactions` / `lib/transactionFilters.ts`
  cases (`{ cases: [...] }`): each case has a `context` (owner-name map), a
  `criteria` (query, categories, kind, sources, owners, half-open
  `dateFrom`/`dateTo`), a fixed transaction set, and the `expectedIds` the
  predicate must return (order-preserved). Covers every dimension in isolation,
  OR-within / AND-across combinations, the empty-criteria-returns-all and
  empty-result edges, a UTC month boundary (`monthBounds('YYYY-MM')`), and a
  trailing-newline query trim (spec 020). Transaction `id`s are UUIDs so the iOS
  `Transaction` decoder accepts them. (The personal/shared **scope** dimension
  was removed in spec 007.)
- `transaction-splits.json` — `lib/splits.ts` cases
  (`{ cases, validations, seeds, ownerOrdering }`): `cases` = `computeShares`
  results (even/percent/value, non-divisible remainders, percent-over-tolerance
  reclaim, order sensitivity); `validations` = `validateSplit` save-gate reasons
  (`percent_sum` / `value_sum` / `no_owners`); `seeds` = `seedSplit` edit-form
  round-trips; `ownerOrdering` = the canonical `orderedOwnerIds` leftover-cent
  placement over scrambled inputs. Integer cents only — the percent/even paths
  use IEEE-754 doubles so TS `number` and Swift `Double` agree bit-for-bit.
- `currency.json` — `toDisplayAmount` / `toUSDCents` (`lib/finance/money.ts`) over
  all 7 currencies at fallback rates (`{ toDisplay, toUsdCents }`). Display
  *strings* are locale-dependent and deliberately NOT vectored here.
- `currency-names.json` — the fixed per-currency display NAME table
  (`CURRENCY_NAMES` ↔ Swift), keyed by currency code (spec 020).
- `currency-symbols.json` — the fixed per-currency SYMBOL table (no locale
  derivation; `cny` = `CN¥`), keyed by currency code (spec 020).
- `dashboard-month-scope.json` — `components/dashboard/range.ts`:
  `availableMonths`, `availableRanges`, `monthReferenceDate`, `stepMonth`.
- `member-balance.json` — `balanceBetween` (`lib/balances.ts`) settle-up net
  cents; expenses carry `paid_by`, reimbursements are directional `transfer` rows.
- `housing-net-rental.json` — `occupiedRentCents` / `netRentalCents`
  (`lib/finance/housing.ts`): occupied-only rent − mortgage payment. Occupancy is
  a resolved boolean so the vector is platform-neutral.
- `lease.json` — `components/housing/lease.ts` date math (spec 020):
  `rentDueDay`, `daysUntilNextRent` (incl. the due-day > month-length clamp),
  `daysUntilEnd`, `isRenewalSoon`, with an injected `asOf`.
- `goals.json` — `lib/finance/goals.ts` savings-goal engine (spec 027):
  `progress` (`goalProgress`: saved/remaining/fraction/reached) and `pacing`
  (`goalPacing`: steady-pace expected/shortfall/suggested-monthly, off-track,
  past-due), with an injected `now`.

All money is USD cents. Dates are timezone-stable: mortgage dates parse as
**local** calendar dates; insight transaction dates mirror JS `new Date('YYYY-MM-DD')`
(UTC midnight) and are kept mid-month so the month-boundary timezone edge can't
flip a result; transaction-filter dates and `monthBounds` windows are **UTC**
half-open `[from, to)`.

## Regenerating

The expected values are produced from the (parity-corrected) TypeScript
implementation, which mirrors the Swift one exactly:

```bash
cd web && npm run gen:vectors   # writes ../shared/test-vectors/*.json
```

Regenerate only when the *intended* behavior changes — and when you do, run both
suites so any Swift↔TS divergence surfaces.

## Running the suites

- **Web**: `cd web && npm test` (Vitest — `test/*.parity.test.ts`).
- **iOS**: the XCTest parity suites are `iOS/Ortho-iOSTests/*ParityTests.swift`.
  All 11 vector JSONs and their `*ParityTests.swift` are **already wired** into the
  test target (Copy Bundle Resources + Sources) — there is no one-time setup step.
  Because XCTest can't be built off macOS, the iOS suite runs on the macOS CI
  (`.github/workflows/ios-ci.yml`), not on a Linux sandbox. Adding a NEW vector
  file needs a pbxproj Copy-Bundle + test-target entry; adding cases to an
  existing file does not.

## Contract

The insight `id` scheme is part of the contract (e.g.
`top-category-dining-2026-06`, `budget-over-dining-2026-06`,
`cashflow-deficit-2026-06`). If a suite produces different IDs, that is a real
divergence to reconcile — the test is doing its job.
