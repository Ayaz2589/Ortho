# Phase 0 Research: Budget rollover semantics

## Decision 1 — Three types, three carry rules

The backlog (§4.1) names three bucket types: **fixed**, **flex**, **non-monthly**.
To be worth vector-locking, each must be a *mathematically distinct* recurrence,
not just a label. Chosen semantics (per month, integer cents):

```
effective = base + carriedIn
remaining = effective − spent
```

| Type          | carriedIn (month 0 = openingCarry) | carriedOut                          | Real-world intent |
|---------------|-------------------------------------|-------------------------------------|-------------------|
| `fixed`       | always 0                            | always 0                            | Reset every month (rent-like discipline) — today's behavior. |
| `flex`        | prev carriedOut                     | `min(cap, max(0, remaining))`       | Savings envelope: surplus accumulates (up to a cap); a bad month is **forgiven** (no debt carried). |
| `non_monthly` | prev carriedOut                     | `remaining` (signed, uncapped)      | Sinking fund for an irregular/annual bill: surplus builds indefinitely, and a shortfall legitimately carries as a negative because you drew the fund down early. |

**Rationale for the flex/non_monthly split** (the one non-obvious choice):

- *Flex forgives overspend.* "Roll **unused** budget forward" — when you overspend
  there is nothing unused to roll, and punishing next month contradicts a calm,
  encouraging UX. So `carriedOut = max(0, remaining)`.
- *Non-monthly carries the shortfall.* A sinking fund is your own accumulated
  pot. If you budget $50/mo toward a $600 annual premium and the bill lands in
  month 6 against a ~$300 pot, you are genuinely −$300 and must refill it. Floor­ing
  that at zero would silently forgive real debt and misstate the fund. So
  `carriedOut = remaining` (signed).

**Rejected alternative — YNAB-style debt-carry for flex** (overspend reduces next
month's available): more punitive, harder to reason about on a calm dashboard, and
not what "roll *unused* forward" says. Kept only for `non_monthly`, where it is the
correct fund semantics.

## Decision 2 — Carry is derived, never stored

Two ways to know the carried-in balance for the current month:

1. **Stored running balance** updated by a month-close job / trigger.
2. **Derived** live from the transaction history each render.

Chosen: **derived**. It is stateless, always correct, needs no background job or
cron, cannot drift, and works offline (the ledger is already in memory in the
store). This matches how every other dashboard figure is computed (single pass
over `transactions`). The cost — recomputing O(months) per budgeted category — is
trivial and memoized in the card exactly like today's spend aggregation.

**Carry anchor = the budget's creation month** (`budgets.created_at`). Months
before the budget existed contribute nothing. The engine also accepts an explicit
`openingCarryCents` (default 0) so the pure function is fully testable and a future
backfill can seed a starting balance without a schema change.

## Decision 3 — Insights use the effective limit

Budget-status insights (`insights.ts` Rule 3) currently compare spend against the
raw `monthly_limit_cents`. If only the dashboard card became rollover-aware, the
card ("$100 remaining") and an insight ("over budget") could contradict each
other. So Rule 3 switches to the same rollover-aware effective limit via the
shared engine.

**Key safety property**: for `fixed` budgets the effective limit *equals* the base
limit and carriedIn is 0, so every branch of Rule 3 produces byte-identical output.
Every existing `insights.json` vector budget is (implicitly) `fixed`, so
regenerating the vectors changes nothing for them. New vector cases are added
specifically to exercise a `flex`/`non_monthly` effective limit.

## Decision 4 — Schema shape

Add to `budgets`:

- `budget_type` — a Postgres enum `('fixed','flex','non_monthly')`,
  `not null default 'fixed'`. Matches the repo's enum convention
  (`transaction_category`/`transaction_kind`), mirrored as a TS union in
  `lib/types.ts`.
- `rollover_cap_cents` — `bigint null check (rollover_cap_cents is null or
  rollover_cap_cents >= 0)`. Meaningful only for `flex`; `null` = uncapped.

`monthly_limit_cents` is unchanged and remains the **base** limit. RLS policies,
indexes, and the `unique (household_id, category)` constraint are untouched. The
default makes the migration backward-compatible: existing rows become `fixed`.

**Rejected alternative — a separate `rollover_enabled boolean`**: redundant with
the type (fixed = off, flex/non_monthly = on) and invites contradictory states
(`fixed` + enabled). Type is the single source of behavior.

## Decision 5 — Pure/adapter boundary (what the vectors lock)

- **Vectored (pure):** `computeRolloverLedger(config, monthlySpendCents[])` — the
  recurrence above over an explicit, ordered spend array. This is the risky math.
- **Unit-tested (adapter, not a golden vector):** `budgetStatusForMonth(budget,
  transactions, referenceMonth)` reduces the ledger to the monthly-spend series
  (from the anchor month to the reference month, using the existing local-calendar
  month bucketing) and returns the reference month's status. It contains no novel
  arithmetic — it delegates the math to the vectored function — so it is covered
  by ordinary unit tests, consistent with how `transactionFilters`/dashboard
  adapters are treated.

## Determinism / timezone notes

- Integer cents throughout; the only division is none (all add/sub/min/max), so no
  rounding rule is needed — but the engine still asserts integer inputs.
- Month bucketing reuses the **local-calendar** rule already used by
  `BudgetProgressCard`/`insights.ts` (`new Date(y, m, 1)` boundaries; a tx dated
  the 1st lands in that month). Vitest pins `TZ=UTC`; the vectored function takes
  an explicit spend array so it is timezone-independent by construction, and the
  adapter's bucketing is unit-tested the same way the existing budget card is.
