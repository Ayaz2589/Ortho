# Contract: Balance Functions

**Feature**: 031-household-redesign  
**Module**: `web/lib/balances.ts`  
**Date**: 2026-07-24

Extends the existing contract in `specs/007-household-splits/contracts/split-function.md`.

---

## `balanceBetween` (extended)

```ts
function balanceBetween(
  viewer: string,
  other: string,
  transactions: Transaction[]
): number
```

**Existing contract** (unchanged): Positive → `other` owes `viewer`; negative → `viewer` owes `other`. Handles `expense` and `transfer` kinds.

**Extension — income kind**:
- If `t.kind === 'income'` and `t.paid_by === viewer`: `net += t.shares[other] ?? 0`
  - *Rationale*: Viewer received income on behalf of both; other is owed their share by viewer — so from viewer's perspective, other owes viewer.
- If `t.kind === 'income'` and `t.paid_by === other`: `net -= t.shares[viewer] ?? 0`
  - *Rationale*: Other received income on behalf of both; viewer is owed their share — viewer owes other their share.
- If `t.kind === 'income'` and `t.owner_ids.length === 1`: no effect (single-owner income).
- If `t.kind === 'income'` and `t.paid_by === null`: no effect (income with no designated recipient).

**Golden vectors** (added to `shared/test-vectors/member-balance.json`):

| Case | viewer | paid_by | owner_ids | expected |
|------|--------|---------|-----------|----------|
| Income received by viewer, split 50/50, $1000 | A | A | [A, B] | +50000 (B owes A $500) |
| Income received by other, split 50/50, $1000 | A | B | [A, B] | −50000 (A owes B $500) |
| Income solo (just viewer), $1000 | A | A | [A] | 0 |
| Income + expense net | A | (mixed) | (mixed) | (computed) |

---

## `allPairBalances` (new)

```ts
function allPairBalances(
  people: Person[],
  transactions: Transaction[]
): PairBalance[]
```

**Contract**:
- Returns one entry per unordered pair `{a, b}` with `a.id < b.id` (lexicographic).
- `netCents > 0` → `b` owes `a`; `netCents < 0` → `a` owes `b`.
- Zero-balance pairs are excluded.
- Antisymmetry invariant: `allPairBalances([a, b, c], txns)` for pair `(a, b)` returns the same `netCents` as `balanceBetween(a.id, b.id, txns)` when `a.id < b.id`.
- Empty result when `people.length <= 1` or all balances are zero.

**Golden vectors** (inline in `web/test/member-balance.parity.test.ts`):
- 3-person household: A paid $150 split evenly with B and C; B paid $90 split evenly with A and C.
  - A↔B: A paid $100 for B; B paid $45 for A → net A↔B = `+100 − 45 = +55` (B owes A $55)
  - A↔C: A paid $50 for C → net A↔C = `+50` (C owes A $50)
  - B↔C: B paid $45 for C → net B↔C = `+45` (C owes B $45)

---

## `simplifyDebts` (new)

```ts
function simplifyDebts(
  pairs: PairBalance[],
  people: Person[]
): Array<{ from: string; to: string; amountCents: number }>
```

**Contract**:
- Input: the output of `allPairBalances`.
- Output: minimum set of directed transfers that clears all debts. `from` owes `to` the `amountCents`.
- All `amountCents` values are positive (directed transfers only).
- The sum of all input `|netCents|` per person equals the sum of all output `amountCents` involving that person (conservation: no debt is created or erased, only routed).
- Returns `[]` when all balances are zero.
- Deterministic for a given input (greedy algorithm, creditors and debtors sorted by ID as tiebreaker).

---

## `getLastSplitForMerchant` (new, web/lib/splitMemory.ts)

```ts
function getLastSplitForMerchant(
  merchant: string,
  transactions: Transaction[]
): SplitMemory | null
```

**Contract**:
- Returns the `{ ownerIds, shares }` of the most recent transaction matching `merchant` exactly (case-sensitive) with `owner_ids.length >= 2`.
- Returns `null` if no matching transaction or all matches are single-owner.
- Does not mutate the transactions array.
- Stable: same inputs always return same output.
