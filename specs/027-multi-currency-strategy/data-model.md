# Phase 1 Data Model: the amount representation (today vs option b)

This feature **changes no data model** (NG-001..NG-003). This document records the two
representations the decision is *about*, so the recommendation and the cost table are grounded.

## Representation today (USD-cents ledger)

**Stored amount** — one field per money value:

| Field | Type | Meaning |
|---|---|---|
| `amount_cents` | `bigint` (TS `Cents`, branded integer) | Whole **USD** cents. The only stored money fact. |

There is **no** per-amount currency and **no** stored native figure. The display currency is a
single per-user setting (`CurrencyKey`), not a property of any transaction. The native amount
the user typed is converted at entry and then **discarded**:

```text
native amount ──toUSDCents(amount, currency, rate_at_entry)──▶ amount_cents   (native amount lost here)
amount_cents  ──toDisplayAmount(cents, currency, rate_now)───▶ displayed native amount
```

**Invariant:** per-owner `transaction_shares.amount_cents` sum to the parent `amount_cents`
(client-enforced). This addition is only well-defined because every amount is the *same unit*
(USD cents) — the property option (b) would have to preserve across currencies.

**Consequence (characterized by the RED test):** because `rate_at_entry ≠ rate_now` in general,
and because the round trip re-rounds through cents, the redisplayed native amount ≠ the entered
native amount. For USD (`rate = 1.0`) the two conversions are exact inverses → no drift.

## Representation under option (b) (native-currency ledger) — *hypothetical, not built*

**Stored amount** — the amount keeps its own currency identity:

| Field | Type | Meaning |
|---|---|---|
| `amount_minor` | `bigint` | Amount in the **minor unit of its own currency** (cents for USD/CAD/EUR…, whole yen for JPY — minor-unit scale is per-currency, not a fixed 100). |
| `currency` | `text` / enum | The currency the amount is denominated in (per transaction, not per user). |

**Display = format, not reconversion:** rendering an amount in its own currency is a pure
format; the stored figure never moves, so history is stable by construction.

**New, harder property — cross-currency aggregation.** With mixed currencies, `SUM(amount)` is
no longer defined by plain integer addition. Every aggregate (splits, balances, budgets,
insights, dashboard totals) must adopt an explicit policy:

- **same-currency only** (aggregate within a currency; refuse/segment mixed sets), or
- **convert-at-display** with a *visible* "converted at today's rate" marker (never silently
  folded into a stored figure).

**Migration reality:** existing rows are USD cents with the native amount already discarded, so
a backfill can honestly only set `currency = 'usd'`; it cannot recover the original non-USD
figures. This information loss is already baked into stored data — a reason to decide *before*
more non-USD data accumulates under the current model.

## Entities touched IF option (b) is chosen (scope of the cost, not this feature)

`transactions`, `transaction_shares`, `budgets`, `rental_payments`, `mortgage_info`,
`lease_info` — every money-bearing table. Plus the pure engines that assume a single additive
USD-cent unit (`splits.ts`, `balances.ts`, `insights.ts`, dashboard range, `housing.ts`) and the
vector fixtures that pin them. `entitlements` is USD-priced billing and likely exempt.

**For THIS feature, none of the above changes** — the model above is documented as the subject
of the decision only.
