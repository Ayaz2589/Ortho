# Phase 1 Data Model — Coverage Corpus

The corpus does **not** introduce new persistent tables. It composes the existing
domain entities (`web/lib/types.ts`) into labelled scenarios. The types below are
the *generator's* in-memory model; the emitted rows are exactly the existing
`Household`, `Person`, `Transaction`, `TransactionShare`, `Property`,
`MortgageInfo`, `LeaseInfo`, `Unit`, `RentalPayment`, `Budget`, `Card`, `User`
shapes.

## Generator-model entities

### `Corpus`
The top-level deterministic dataset.
- `seed: number` — the input that produced it.
- `scenarios: HouseholdScenario[]` — ordered, each independently seeded.
- `meta: { generatedFromSeed: number; scenarioCount: number; version: number }`
  — no wall-clock timestamp (would break byte-stability).

Derived (not stored): flattened table maps
(`{ users, households, household_people, household_members, cards, transactions,
transaction_shares, properties, mortgage_info, lease_info, units,
rental_payments, budgets }`) via `toTables(corpus)` for the seeder and the
in-memory client.

### `HouseholdScenario`
One labelled household and its complete dependent graph.
- `label: string` — human-readable, unique (e.g. `"joint-even-multicurrency-jpy"`).
- `dimensions: Dimension[]` — which coverage dimensions this scenario satisfies
  (drives `coverageOf()` and SC-002).
- `displayCurrency: CurrencyKey` — the display-currency lens for this household
  (USD storage unchanged; see research D3).
- `timezoneNote?: string` — set on the A2 scenario to flag boundary/non-noon rows.
- `household: Household`
- `people: Person[]` — includes `sort_order`; the A4 scenario deliberately makes
  `sort_order` disagree with lexical id order.
- `members: HouseholdMember[]` — `{ household_id, user_id, role }`.
- `cards: Card[]`
- `transactions: GeneratedTransaction[]`
- `properties: GeneratedProperty[]`
- `budgets: Budget[]`

### `GeneratedTransaction`
Wraps the emitted `Transaction` + `TransactionShare[]` with generation intent.
- `transaction: Transaction` — full row (USD `amount_cents`, `date` with explicit
  time-of-day, `kind`, `category`, `paid_by`, `owner_ids`, `shares`).
- `shares: TransactionShare[]` — one per owner; **MUST** sum to `amount_cents`.
- `splitMethod: 'even' | 'percent' | 'value'` — the method used to derive shares
  (via `computeShares` from `lib/splits.ts`; never re-implemented).
- `intent: TxIntent[]` — tags like `'refund'`, `'month-boundary'`, `'leftover-cent'`,
  `'recurring-merchant'`, `'non-noon-utc'` used by coverage + repro tests.

### `GeneratedProperty`
- `property: Property`
- `mortgage?: MortgageInfo` — includes a **paid-off** case (closing date far
  enough back that the amortization schedule has completed).
- `lease?: LeaseInfo`
- `units?: Unit[]` — multifamily case has mixed `occupied` true/false.
- `rentalPayments: RentalPayment[]`

### `Dimension` (enum-like union) — the coverage matrix (FR-004)
```
'household-joint' | 'household-separate'
'split-even' | 'split-percent' | 'split-value'
'leftover-cent'
'currency-usd' | 'currency-eur' | 'currency-jpy' | 'currency-bdt'
'month-boundary-first' | 'month-boundary-last'
'month-feb-leap' | 'month-feb-nonleap'
'refund-credit'          // a return/credit — the DB forbids negative amount_cents,
                         // so it is modelled as a positive income-kind credit
'month-sparse' | 'month-dense'
'property-mortgage' | 'property-lease' | 'mortgage-paid-off' | 'multifamily-occupancy'
'budget-under' | 'budget-near' | 'budget-over'
'recurring-merchant'
'order-mismatch'          // sort_order ≠ lexical id  (A4)
'tz-boundary-non-noon'    // boundary rows at non-noon-UTC (A2)
```
`coverageOf(corpus)` returns `Record<Dimension, string[]>` (dimension → labels of
scenarios covering it). SC-002 passes iff every dimension maps to ≥ 1 label.

## Key validation rules (enforced by builders + asserted by tests)

1. **Share reconciliation (FR-005/SC-003)**: for every `GeneratedTransaction`,
   `sum(shares.amount_cents) === transaction.amount_cents`. Shares are produced by
   `computeShares(amount, orderedOwnerIds(owner_ids), split)` — canonical order.
2. **Referential integrity (FR-003)**: every `member.user_id` ∈ users;
   `person.household_id` = its household; `share.transaction_id` ∈ that
   household's transactions; `share.person_id` ∈ that household's people;
   `mortgage.property_id`/`lease.property_id`/`unit.property_id`/
   `rental_payment.property_id` resolve; `budget.household_id` matches.
2b. **`paid_by` validity**: when set, `paid_by` ∈ the household's people;
   `transfer` rows carry a sender (`paid_by`) and `owner_ids = [recipient]`.
3. **Determinism (FR-001/SC-001)**: no `Date.now()`/`Math.random()`; all dates
   derive from a fixed epoch anchor in `clock.ts`; all choices derive from the
   seeded PRNG. Re-running `generateCorpus(seed)` yields an identical `Corpus`.
4. **Currency storage (research D3)**: `amount_cents` is always USD cents;
   `displayCurrency` never alters stored amounts. JPY exercised via the display
   layer only.
4b. **Non-negative amounts**: `amount_cents >= 0` and every share `>= 0` (the DB
   enforces `amount_non_negative` on `transactions` and `>= 0` on
   `transaction_shares`). Refunds/credits are positive income-kind rows, never
   negative expenses.
4c. **DB id mapping**: the in-memory corpus uses readable ids; the seeder maps
   every id/FK to a stable UUID via `uuidFrom` (readable key → SHA-256 UUID) so
   rows fit the schema's `uuid` columns while foreign keys stay consistent.
5. **A2 condition (FR-006)**: the `tz-boundary-non-noon` scenario has ≥ 1
   `month-boundary` transaction whose `date` time-of-day ≠ `12:00:00Z`, chosen so
   that local (`America/New_York`) month-bucketing misassigns it while UTC does
   not.
6. **A4 condition (FR-007)**: the `order-mismatch` scenario has people with
   `sort_order` disagreeing with lexical id order and ≥ 1 `leftover-cent`
   even-split transaction, such that the leftover-cent recipient differs between
   `orderedOwnerIds` order and `sort_order` order.
7. **Zero-decimal safety**: JPY-lens scenario amounts, when converted for display,
   round to whole yen (no fractional minor unit).
8. **Coverage completeness (SC-002)**: `coverageOf()` covers every `Dimension`.
9. **Size band (FR-012/SC-007)**: `scenarioCount` is in the low hundreds; no
   single dimension depends on exactly one fragile hand-authored row that could
   silently drop (each critical dimension is asserted present by label).

## State / lifecycle

The corpus is **immutable** once generated. The seeder reads it and writes rows;
it does not mutate the corpus. The committed snapshot is regenerated only via the
explicit `gen:corpus` script (an intentional, reviewed diff).
