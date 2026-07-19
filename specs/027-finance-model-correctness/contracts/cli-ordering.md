# Contract: CLI leftover-cent ordering (A4)

## Invariant

For any set of owner IDs `O` and any `amountCents`:

```
computeShares(amountCents, orderedOwnerIds(O), split)
  ≡ computeShares(amountCents, orderedOwnerIds(O.reversed()), split)
  ≡ computeShares(amountCents, orderedOwnerIds(O.shuffled()), split)
```

The result is independent of the order owners are presented to `orderedOwnerIds`.
The leftover cent always goes to the owner whose UUID is first in ascending string sort.

## CLI guarantee

Every compute path in the import CLI (`toTransaction.ts`, `tx.ts`) MUST call
`orderedOwnerIds(owners)` before passing the owner array to `computeShares`. The
`sort_order` column on `household_people` affects only the order rows are fetched
from the database and the order they are presented in the UI picker — it MUST NOT
affect which owner receives the leftover cent.

## Test specification

```ts
// Members with sort_order ≠ lexical UUID order
const A = { id: 'zzzzzzzz-0000-0000-0000-000000000000', sort_order: 0 }
const B = { id: 'aaaaaaaa-0000-0000-0000-000000000000', sort_order: 1 }

// The CLI fetches people in sort_order order: [A, B]
// toTransaction receives owners in that order: [A.id, B.id]
// After orderedOwnerIds: [B.id, A.id] (lexical sort: "aa" < "zz")

// 101¢ even split → floor(101/2) = 50 each, leftover = 1
// leftover goes to first in ordered list = B ("aaaa…")
expect(shares[B.id]).toBe(51)
expect(shares[A.id]).toBe(50)
```

This contract is verified by `web/test/import/toTransaction.test.ts`.
