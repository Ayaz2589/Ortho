# Contract: `computeShares` + `validateSplit` (pure, cross-platform)

The split math is implemented identically in TypeScript (`web/lib/splits.ts`, source of truth)
and Swift (`iOS/.../TransactionSplits.swift`), and locked by
`shared/test-vectors/transaction-splits.json` (asserted by web Vitest + iOS XCTest). Integer
cents only — no floating Decimal stored or returned, so the two languages cannot diverge.

## Types

```
SplitMethod = 'even' | 'percent' | 'value'

SplitInput =
  | { method: 'even' }
  | { method: 'percent', percents: Record<OwnerId, number> }   // e.g. { a: 70, b: 30 }
  | { method: 'value',   values:   Record<OwnerId, number> }    // cents, e.g. { a: 6000, b: 4000 }

computeShares(amountCents: int, owners: OwnerId[] /*ordered, len>=1*/, split: SplitInput)
  -> Record<OwnerId, int>            // cents per owner, Σ == amountCents

validateSplit(amountCents: int, owners: OwnerId[], split: SplitInput)
  -> { ok: true } | { ok: false, reason: 'percent_sum' | 'value_sum' | 'no_owners' }
```

## `computeShares` rules (total — always sums to amountCents)

1. **No owners** → `{}` (guarded against upstream; `validateSplit` returns `no_owners`).
2. **Single owner** → `{ owners[0]: amountCents }` for *any* method.
3. **even** → treat as percent with `100/n` each.
4. **percent** →
   - `targetᵢ = amountCents * percentᵢ / 100` (rational).
   - `baseᵢ = floor(targetᵢ)`.
   - `leftover = amountCents − Σ baseᵢ`.
   - distribute `leftover` cents, **+1 per owner in `owners` order**, wrapping if
     `leftover > n` (wrapping never happens for percents summing to 100).
5. **value** → return `valuesᵢ` unchanged (caller validated Σ = amountCents). Missing owner ⇒ 0.

Determinism: owner order is the caller's `owners` array order (UI uses `household_people.sort_order`).

## `validateSplit` rules

- `even` → `ok` (requires `owners.length >= 1`, else `no_owners`).
- `percent` → `ok` iff `|Σ percents − 100| <= 0.5`; else `percent_sum`.
- `value` → `ok` iff `Σ values == amountCents`; else `value_sum`.

## Golden vector cases (`transaction-splits.json`, `{ cases: [...] }`)

Each case: `{ name, amountCents, owners: [ids…], split, expected: { id: cents } }`.

1. **single-full** — `amount 9999`, one owner, `even` → `{a: 9999}`.
2. **single-ignores-method** — one owner, `value {a: 5000}`, amount 9999 → `{a: 9999}`.
3. **even-divisible** — `amount 10000`, `[a,b]`, even → `{a:5000, b:5000}`.
4. **even-remainder-1** — `amount 10001`, `[a,b]`, even → `{a:5001, b:5000}`.
5. **even-three-remainder-1** — `amount 1000`, `[a,b,c]`, even → `{a:334, b:333, c:333}`.
6. **even-three-remainder-2** — `amount 10001`, `[a,b,c]`, even → `{a:3334, b:3334, c:3333}`.
7. **percent-clean** — `amount 10000`, `{a:70,b:30}` → `{a:7000, b:3000}`.
8. **percent-uneven-remainder** — `amount 10000`, `{a:33.33,b:33.33,c:33.34}` (3 owners) →
   floors `3333/3333/3334` then leftover 0 → `{a:3333,b:3333,c:3334}` (verify Σ=10000).
9. **percent-remainder-to-first** — `amount 100`, `{a:33.33, b:33.33, c:33.34}` →
   `{a:34, b:33, c:33}` (leftover cent to first in order; Σ=100).
10. **value-exact** — `amount 10000`, `value {a:6000,b:4000}` → `{a:6000,b:4000}`.
11. **value-uneven** — `amount 10001`, `value {a:5001,b:5000}` → `{a:5001,b:5000}`.
12. **order-matters** — `amount 10001`, `[b,a]` even → `{b:5001, a:5000}` (leftover follows
    list order, not id sort).

Validation vectors (for `validateSplit`): percent summing to 99 → `percent_sum`; value summing
to 9999 on amount 10000 → `value_sum`; even with 0 owners → `no_owners`; percent 100.4 → `ok`
(within tolerance); percent 99.4 → `ok`.

## Properties asserted (unit, both platforms)

- For every case, `Σ computeShares(...) == amountCents`.
- `computeShares` never returns a negative share for non-negative input.
- Adding/removing owners then recomputing `even` always re-sums to the amount.
