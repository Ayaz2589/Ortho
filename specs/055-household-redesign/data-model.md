# Data Model: Household Feature Redesign

**Feature**: 031-household-redesign  
**Date**: 2026-07-24

---

## No schema changes

This feature adds no new database tables, columns, or migrations. The existing schema is complete and correct for all 11 tasks.

---

## New TypeScript types (web/lib/balances.ts)

### `PairBalance`

```ts
export interface PairBalance {
  a: string      // person ID — lexicographically first
  b: string      // person ID — lexicographically second
  netCents: number  // positive → b owes a; negative → a owes b (always non-zero in results)
}
```

Used by `allPairBalances()` and `HouseholdBalancesWidget`.

---

## New TypeScript types (web/lib/splitMemory.ts)

### `SplitMemory`

```ts
export interface SplitMemory {
  ownerIds: string[]
  shares: Record<string, number>
}
```

Returned by `getLastSplitForMerchant()`. Applied to the transaction form when a repeat merchant is detected.

---

## Existing entities (no changes)

| Entity | Location | Role in this feature |
|--------|----------|---------------------|
| `Transaction` | `web/lib/types.ts` | `kind: 'income'` now participates in balance calc |
| `Person` | `web/lib/store.tsx` | Passed to `allPairBalances` |
| `TransferPrefill` | `web/components/web/TxForm.tsx` | Unchanged; reused by `HouseholdBalancesWidget.onSettle` |
| `household_people` (DB) | Supabase | Unchanged |
| `transaction_shares` (DB) | Supabase | Unchanged |

---

## Derived state (not persisted)

| Derived value | Where computed | Notes |
|---------------|---------------|-------|
| `isSolo` | At render: `householdMembers.length <= 1` | Used to gate balance widget and ownership picker |
| `allPairs` | `allPairBalances(people, transactions)` | Called in `HouseholdBalancesWidget` |
| `simplifiedDebts` | `simplifyDebts(allPairs, people)` | Only computed when "Simplified" toggle is on |
| `lastSplit` | `getLastSplitForMerchant(merchant, transactions)` | Called in `useTxForm` on merchant change |
| `settleThreshold` | `useSettleThreshold(householdId)` | Reads from localStorage |

---

## State changes (per component)

### `useTxForm` (TxForm.tsx)

New internal state:
- `ownershipMode: 'solo' | 'each' | 'payer'` — the three-mode picker selection. Derived default when opening: if `owners.length === 1 && owners[0] === currentPersonId` → `'solo'`; if `paid_by` is set and `owner_ids.length > 1` → `'payer'`; else → `'each'`.
- `splitSuggestion: SplitMemory | null` — pre-filled from `getLastSplitForMerchant` when merchant changes.

### `HouseholdBalancesWidget` (new component)

Internal state:
- `showSimplified: boolean` — toggle for debt simplification (Phase 3)
- `showHistoryFor: { a: string; b: string } | null` — which pair's settlement history is open (Phase 3)

No external state mutations — all reads from `useApp()`.
