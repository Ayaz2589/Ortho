# Shared golden test vectors

Canonical input→output cases for the finance logic that is implemented in **both**
the web (TypeScript) and iOS (Swift) clients. Both test suites assert against
these exact files, so neither language can silently drift. This is the cheap,
no-backend way to keep cross-language parity (see `specs/002-logic-dedup`).

## Files

- `mortgage.json` — `MortgageInfo` / `lib/finance/mortgage.ts` cases: monthly
  payment, current balance, equity, equity fraction, maturity date, years
  remaining, and a 12-month amortization slice. Inputs are USD cents + a pinned
  `asOf` date. Includes a zero-interest loan and a day-of-month boundary case.
- `insights.json` — `InsightEngine` / `lib/finance/insights.ts` scenarios:
  a snapshot (transactions, budgets, properties) + a pinned `referenceDate`,
  with the expected list of fired insights (`id`, `severity`, `category`,
  `magnitude_cents`).
- `transaction-filters.json` — `filterTransactions` / `lib/transactionFilters.ts`
  cases (`{ cases: [...] }`): each case has a `context` (owner-name map), a
  `criteria` (query, categories, kind, sources, owners, half-open
  `dateFrom`/`dateTo`), a fixed transaction set, and the `expectedIds` the
  predicate must return (order-preserved). Covers every dimension in isolation,
  OR-within / AND-across combinations, the empty-criteria-returns-all and
  empty-result edges, and a UTC month boundary (`monthBounds('YYYY-MM')`).
  Transaction `id`s are UUIDs so the iOS `Transaction` decoder accepts them.
  (The personal/shared **scope** dimension was removed in spec 007.)
- `transaction-splits.json` — `computeShares` / `validateSplit` (`lib/splits.ts`)
  cases (`{ cases, validations }`): each split case has `amountCents`, ordered
  `owners`, a `split` (`even` | `percent` | `value`), and the `expected`
  cents-per-owner. Covers single-owner-takes-all, even splits with non-divisible
  amounts (remainder to earliest owners in list order), by-percent incl. the
  leftover cent, by-value, and order sensitivity; `validations` cover the
  `percent_sum` / `value_sum` / `no_owners` save-gate reasons. Integer cents
  only — the percent/even paths use IEEE-754 doubles so TS `number` and Swift
  `Double` agree bit-for-bit.

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
- **iOS**: add `iOS/Ortho-iOSTests/{MortgageParityTests,InsightParityTests,TransactionFilterParityTests,TransactionSplitParityTests}.swift`
  to an XCTest target and add these JSON files to that target's
  "Copy Bundle Resources", then run the tests in Xcode. (XCTest can't be built
  off macOS, so the iOS suite ships ready-to-run rather than pre-run.)

## Contract

The insight `id` scheme is part of the contract (e.g.
`top-category-dining-2026-06`, `budget-over-dining-2026-06`,
`cashflow-deficit-2026-06`). If a suite produces different IDs, that is a real
divergence to reconcile — the test is doing its job.
