# Contract: the RED reproduction test

The one code artifact this feature ships is a Vitest spec that proves the drift. This is its
contract (satisfies FR-001..FR-004, SC-002, SC-003).

**File:** `web/test/multicurrency-instability.test.ts` (co-located with the `*.parity.test.ts`
regression suites).

**Imports:** only the existing public functions from `web/lib/finance/money.ts`
(`toUSDCents`, `toDisplayAmount`, `formatMoney`). No new source, no network, no clock, no store.

## What it must assert

| # | Case | Target invariant (what a correct ledger guarantees) | Against today's model |
|---|---|---|---|
| 1 | **Rate-movement drift** | A native amount recorded at one rate re-reads as the **same** native amount at a different rate: `roundtrip(100 CAD, entry 1.35, view 1.40) === 100.00`. | **FAILS** (reads 103.70) → wrapped in `test.fails` |
| 2 | **Category total drift** | The sum of entered native amounts re-reads unchanged after a rate move: `387.55 → 401.90`. | **FAILS** → `test.fails` |
| 3 | **Rounding-through-USD loss (same rate)** | Round-trip at the **same** rate is lossless: `100 CAD @1.35 → 100.00`; `1000 JPY @150 → 1000`. | **FAILS** (99.99 / 1001) → `test.fails` |
| 4 | **USD control** | At `rate = 1.0` there is **zero** drift: `100 USD → 100.00`. | **PASSES** — asserted normally (proves the demo is real, not tautological) |

## Quarantine mechanism (FR-003, SC-003)

Cases 1–3 assert the **target** invariant, which today's code violates, so a plain `it(...)`
would be red and break CI. Use Vitest's **`test.fails(...)`**: the block is expected to throw, so
the suite is **green precisely because the drift exists**. If someone ever fixes the model
(builds option b), `test.fails` flips red and forces this spec to be revisited — the quarantine
is self-documenting.

Each `test.fails` body:
- performs the real round trip with the exact numbers from `research.md`,
- `expect(...).toBe(target)` on the *stable* value (the assertion that fails today),
- carries an inline comment with the actual drifting value and a pointer to
  `specs/027-multi-currency-strategy/`.

Case 4 (USD control) is a normal passing `it(...)` asserting zero drift.

## Non-behavior (NG-002, NG-005, SC-005)

The test reads the money layer; it changes nothing. `shared/test-vectors/` is untouched;
`npm run gen:vectors` is **not** run. `npm test` and `tsc --noEmit` stay green.
