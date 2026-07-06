# Data Model: Housing Correctness & Parity Fixes

**No database schema change.** This feature is a correctness/consistency fix over the existing Housing
tables. The "model" here is the existing entities (for reference) plus the shape of the one new shared
computation and its golden vector.

## Existing entities (unchanged — for reference)

| Entity | Table | Relevant fields | Notes |
|---|---|---|---|
| Property | `properties` | `kind` (primary_home\|multifamily\|rental), `address`, `nickname` | 1:1 mortgage/lease, 1:N units |
| MortgageInfo | `mortgage_info` | `purchase_price_cents`, `original_loan_cents`, `annual_interest_rate_percent numeric(7,4)`, `loan_term_years`, `closing_date date` | rate precision (US3), closing_date local-parse (US1) |
| LeaseInfo | `lease_info` | `monthly_rent_cents`, `lease_start date`, `lease_end date` | dates local-parse (US1) |
| Unit | `units` | `name`, `monthly_rent_cents`, `tenant_name` (nullable) | occupancy inferred from `tenant_name` (US5) |
| RentalPayment | `rental_payments` | `amount_cents`, `date date`, `note` | date local-parse for display (US1) |

**Invariants reaffirmed**: money is `bigint` USD cents; date columns are `date` (calendar days) and
MUST be interpreted as **local** calendar dates on every surface; the mortgage-rate column keeps 4
decimals and MUST NOT be truncated by a client round-trip.

## New shared computation (in-memory, pure)

### Occupancy (resolved per platform, then fed to the shared math)

- A **Unit** resolves to `occupied: boolean`. Current convention: `occupied = tenant_name is non-empty`
  (kept; US5 makes the choice deliberate in the editor, no schema change).

### Net rental figure (the single vectored source of truth)

```
occupiedRentCents(units: {rentCents, occupied}[]) : integer cents
  = Σ rentCents over units where occupied

netRentalCents(units, mortgagePaymentCents: integer cents) : integer cents (may be negative)
  = occupiedRentCents(units) − mortgagePaymentCents
```

- Inputs and outputs are **integer USD cents**. `netRentalCents` may be negative (a cash-flow-negative
  building); negatives are shown with the Unicode minus and **never red** (constitution IV).
- The figure is **not** gated on a mortgage: `mortgagePaymentCents = 0` for a paid-off property.
- Rendered identically by the Dashboard housing summary and the property-detail net-balance card, on
  both web and iOS.

## Golden vector: `shared/test-vectors/housing-net-rental.json`

Top-level array of `{ input, expected }` (same shape convention as `mortgage.json`):

```jsonc
[
  {
    "input": {
      "name": "two occupied units, no mortgage",
      "units": [ { "rentCents": 250000, "occupied": true }, { "rentCents": 240000, "occupied": true } ],
      "mortgagePaymentCents": 0
    },
    "expected": { "occupiedRentCents": 490000, "netRentalCents": 490000 }
  },
  {
    "input": {
      "name": "one vacant unit drags net negative (review's opposite-sign case)",
      "units": [ { "rentCents": 250000, "occupied": true }, { "rentCents": 240000, "occupied": true }, { "rentCents": 260000, "occupied": false } ],
      "mortgagePaymentCents": 505654
    },
    "expected": { "occupiedRentCents": 490000, "netRentalCents": -15654 }
  }
]
```

**Planned cases** (each with a human-readable `name`, used as the test name in both suites):
all-occupied + mortgage; some-vacant + mortgage (opposite-sign); all-vacant (occupiedRent 0, net =
−payment); empty units (0 / −payment); no-mortgage paid-off (net = occupiedRent); single occupied unit.

**Consumers**:
- Web: `web/test/housing-net-rental.parity.test.ts` imports `occupiedRentCents`/`netRentalCents` from
  `web/lib/finance/housing.ts` and asserts each case.
- iOS: `iOS/Ortho-iOSTests/HousingNetRentalParityTests.swift` decodes the JSON (bundled via a new
  `project.pbxproj` Copy-Bundle-Resources entry) and asserts the Swift mirror.
- Generator: `web/scripts/gen-vectors.ts` builds the array from the TS functions and `writeFileSync`s
  it alongside the other vectors.
