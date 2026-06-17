# Parity Contracts — Part 2

Both clients MUST satisfy these identically. (a) golden-vector contracts asserted by both suites and
(b) cross-client behavioral contracts validated at runtime / by unit test.

## C1 — Canonical owner ordering (golden vector: `transaction-splits.json` → `ownerOrdering`)

A pure `orderedOwnerIds(ids)` returns the owner ids sorted ascending as strings, identically on both
clients. For any owner set and split, `computeShares(amount, orderedOwnerIds(ids), split)` is identical
on web and iOS — in particular the leftover cent (even/percent) lands on the same owner regardless of the
order the ids were entered or stored in. Both clients route share *computation* (creation + even-fallback)
through `orderedOwnerIds`. `computeShares` itself stays order-sensitive (unchanged).

## C2 — Currency conversion (golden vector: `currency.json`)

`toDisplayAmount(cents, currency, rate)` and `toUSDCents(amount, currency, rate)` produce identical
numeric results on both clients for all 7 currencies (usd/cad/gbp/eur/jpy/cny/bdt) at the fallback rates,
rounding **half away from zero**, preserving the USD-cents storage invariant (always divide cents by 100;
zero-fraction currencies render at correct magnitude). Display *strings* are locale-dependent and NOT part
of the vector.

## C3 — Money/cents invariant (reaffirmed)

All amounts are USD cents end-to-end. Per-owner shares sum to the exact transaction total. No conversion
inflates magnitude (the JPY ÷1 bug is fixed). Leftover cent deterministic in canonical owner order (C1).

## C4 — Recurring + outlier insights (golden vector: `insights.json`)

For identical inputs + reference date, both clients emit the same ordered insights with the same `id`s and
`magnitude_cents`. The recurring-charge monthly average is the **truncated** integer mean (toward zero).
The outlier rule (`outlier-<lowercase-uuid>`) is covered by at least one scenario — every insight rule
(1–8) now has vector coverage.

## C5 — Mortgage months-elapsed (golden vector: `mortgage.json`)

Months elapsed from closing to a reference date is counted with month-end day clamping
(`Calendar.dateComponents([.month])` semantics) identically on both clients, so a loan closed on day 29–31
yields the same elapsed count — and the same current balance, equity, equity fraction, and amortization —
near a shorter month's end.

## C6 — Atomic transaction write (behavioral; not a vector — runtime)

Persisting a transaction with its owner shares is all-or-nothing on both clients: if the shares write
fails, no share-less parent transaction survives (web rolls back the parent + restores state; iOS commits
both as one failing unit). A transaction never rehydrates as a single-owner "creator owns all" because its
shares failed to write.

## Behavioral (runtime, not vectored)

- **Money locale (web)**: monetary values format using the selected language's locale (symbol, grouping,
  decimal separator), matching iOS's app-wide locale; the choice persists across reloads.
- **Desktop capability**: the ≥1024px web dashboard renders the Budget Progress widget (when budgets exist)
  and the ≥1024px housing view renders the lease-renewal banner — matching the phone web view and iOS.
- **Sign-in copy**: the web sign-in screen states the 8-digit code length, matching iOS.

## Contract test mapping

| Contract | Web assertion | iOS assertion |
|---|---|---|
| C1 owner ordering | Vitest vs `transaction-splits.json` ownerOrdering | XCTest vs same |
| C2 currency conversion | Vitest vs `currency.json` (new) | XCTest `CurrencyParityTests` vs `currency.json` (new) |
| C3 cents invariant | covered by C1 + C2 | covered by C1 + C2 |
| C4 recurring/outlier | Vitest vs `insights.json` | XCTest vs `insights.json` |
| C5 months-elapsed | Vitest vs `mortgage.json` | XCTest vs `mortgage.json` |
| C6 atomic write | `store.test.tsx` (forced shares failure) | existing `TransactionsAPI` behavior |
| Money locale | component/behavior + quickstart | quickstart |
| Desktop capability | `desktop-parity.test.tsx` | quickstart |
