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

All money is USD cents. Dates are timezone-stable: mortgage dates parse as
**local** calendar dates; insight transaction dates mirror JS `new Date('YYYY-MM-DD')`
(UTC midnight) and are kept mid-month so the month-boundary timezone edge can't
flip a result.

## Regenerating

The expected values are produced from the (parity-corrected) TypeScript
implementation, which mirrors the Swift one exactly:

```bash
cd Ortho-web && npm run gen:vectors   # writes ../shared/test-vectors/*.json
```

Regenerate only when the *intended* behavior changes — and when you do, run both
suites so any Swift↔TS divergence surfaces.

## Running the suites

- **Web**: `cd Ortho-web && npm test` (Vitest — `test/*.parity.test.ts`).
- **iOS**: add `Ortho-iOSTests/{MortgageParityTests,InsightParityTests}.swift` to
  an XCTest target and add these two JSON files to that target's
  "Copy Bundle Resources", then run the tests in Xcode. (XCTest can't be built
  off macOS, so the iOS suite ships ready-to-run rather than pre-run.)

## Contract

The insight `id` scheme is part of the contract (e.g.
`top-category-dining-2026-06`, `budget-over-dining-2026-06`,
`cashflow-deficit-2026-06`). If a suite produces different IDs, that is a real
divergence to reconcile — the test is doing its job.
