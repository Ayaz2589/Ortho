# Research: Household Feature Redesign

**Feature**: 031-household-redesign  
**Date**: 2026-07-24

---

## R1 — Income balance direction

**Decision**: Use identical sign logic to expenses.

**Rationale**: In `lib/balances.ts`, an expense where `paid_by === viewer` means `other` owes `viewer` → `net += shares[other]`. An income where `paid_by === viewer` means `viewer received money for both`; `other` is owed their share by `viewer` — but from viewer's perspective, `other` still owes `viewer` the share that `viewer` is holding. Sign is identical.

Verified by working example: Viewer (A) receives $1,000 income, split 50/50 with B. `paid_by = A`, `shares = {A: 500, B: 500}`. B owes A $500 → `net = +500`. ✓

**Code change**: In `balanceBetween`, add:
```ts
} else if (t.kind === 'income') {
  const recipient = t.paid_by
  if (!recipient) continue          // no recipient = no balance effect
  if (recipient === viewer) net += t.shares[other] ?? 0
  else if (recipient === other) net -= t.shares[viewer] ?? 0
}
```

**Alternatives considered**: Treating income with inverted sign (income "reduces" debt). Rejected — it would make B receiving $500 income (split with A) *reduce* A's debt to B, which is economically wrong. The formula is correct as stated.

---

## R2 — N-person pairwise balance representation

**Decision**: `allPairBalances` returns `PairBalance[]` — a flat array of `{ a: string; b: string; netCents: number }` where `a < b` lexicographically and `netCents > 0` means `b owes a`.

**Rationale**: A nested Map is awkward to iterate for rendering. A flat array of pairs with a canonical ordering (lexicographically `a < b`) is easy to render, filter, and sort. Consumers can call `balanceBetween(a, b, txns)` with the pre-canonical ordering for the correct sign.

**Implementation**:
```ts
export function allPairBalances(people: Person[], transactions: Transaction[]): PairBalance[] {
  const result: PairBalance[] = []
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i], b = people[j]
      // Ensure canonical a < b by person ID
      const [lo, hi] = a.id < b.id ? [a, b] : [b, a]
      const net = balanceBetween(lo.id, hi.id, transactions)
      if (net !== 0) result.push({ a: lo.id, b: hi.id, netCents: net })
    }
  }
  return result
}
```

**Invariant**: `balanceBetween(b, a, txns) === -balanceBetween(a, b, txns)` — confirmed by the antisymmetric property of the formula.

**Alternatives considered**: Nested `Map<string, Map<string, number>>`. Rejected — more complex to iterate and identical information.

---

## R3 — Debt simplification algorithm

**Decision**: Greedy min-flow over net balances ("Splitwise algorithm").

**Rationale**: For households of ≤ 10 members, a greedy approach matches optimal for most cases and is O(n²). The algorithm:
1. Compute net balance per person: sum of all `balanceBetween(person, other)` for each other.
2. Split into creditors (net > 0) and debtors (net < 0).
3. Greedily match largest creditor with largest debtor, create a transfer for `min(credit, debt)`, reduce both, repeat.

**Alternatives considered**: Optimal min-cost flow (LP). Rejected — overkill for n ≤ 10 and adds no npm dependency.

---

## R4 — Ownership type picker UX

**Decision**: A 3-option picker above the existing owners section, writing to `owners` and `paidBy` via existing handlers.

**Modes**:
| Mode | `owners` written | `paidBy` written |
|------|-----------------|-----------------|
| "Just me" | `[currentPersonId]` | `currentPersonId` |
| "We each paid our share" | all active members | first member (or current) |
| "[Person] paid for everyone" | all active members | selected payer (person dropdown) |

**Rationale**: Wraps existing form state — no new store keys. The picker is a derived view. When the user switches modes, the underlying `owners` and `paidBy` update, and the split resets to even (matching the existing `resetSplitsToEven` behavior on owner changes).

**Income language overrides**:
- "Just me" → "I received this"
- "We each paid our share" → "We each received our share"
- "[Person] paid for everyone" → "[Person] received it for us"

---

## R5 — Recurring split memory scope

**Decision**: Exact merchant string match. No fuzzy matching in v1.

**Rationale**: Fuzzy matching risks false positives ("Whole Foods" matching "Whole Foods Market" is fine, but "Amazon" matching "Amazon Prime" creates wrong split suggestions). Exact match is safe and sufficient for the recurring merchant case (subscriptions, utilities, rent).

**Implementation**: Pure function, no side effects:
```ts
export function getLastSplitForMerchant(
  merchant: string,
  transactions: Transaction[]
): { ownerIds: string[]; shares: Record<string, number> } | null
```
Returns `null` for solo transactions (`owner_ids.length < 2`) and unknown merchants.

---

## R6 — Settlement threshold persistence

**Decision**: Store per-household in `localStorage` with key `ortho:settle_threshold:<household_id>`. Default: 10000 cents ($100).

**Rationale**: Avoids a schema change. Threshold is a UI preference, not financial data. `localStorage` is per-device, which is acceptable for a notification preference. If the user clears storage, the threshold resets to the default gracefully.

**Key**: `ortho:settle_threshold:<household_id>` → integer cents string.

---

## R7 — Balance widget placement in DashboardDesktop grid

**Decision**: Add `HouseholdBalancesWidget` as a full-width `ow-s12` row, placed between the Insights/Budget block and the Spend-by-category block. On mobile, insert after `PerOwnerBreakdownCard`.

**Rationale**: Balance information is household-wide and more urgent than category breakdowns. It should appear early on the dashboard. `ow-s12` (full grid width) matches the Insights and Budget cards above it.

**Solo guard**: Widget not rendered when `householdMembers.length <= 1`. Widget not rendered when all balances are zero.
