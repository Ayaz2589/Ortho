# Store API Contract: Deposit Accounts (spec 033)

## New store surface (`useApp()`)

### State

```typescript
depositAccounts: DepositAccount[]
// Ordered by created_at ascending. Empty array when no household or table
// not yet migrated (fail-open). Reactive — components re-render on add/delete.
```

### Actions

#### `addDepositAccount(name: string): void`

Optimistically inserts a new `DepositAccount` into local state, then writes to Supabase.
Rolls back on server error.

- **Pre-condition**: `currentHousehold` is resolved (caller must guard)
- **Post-condition (success)**: `depositAccounts` contains the new entry; Supabase `deposit_accounts` row created
- **Post-condition (failure)**: `depositAccounts` reverted to pre-call state; `error` set in store

#### `deleteDepositAccount(id: string): void`

Optimistically removes the entry from local state, then deletes from Supabase.
Rolls back on server error.

- **Pre-condition**: entry with `id` exists in `depositAccounts`
- **Post-condition (success)**: `depositAccounts` no longer contains entry; Supabase row deleted
- **Post-condition (failure)**: entry restored in `depositAccounts`; `error` set in store

## TxForm behaviour contract

| `isIncome` | `sources` value | "Deposit to" / "Paid with" label | Empty state |
|-----------|----------------|----------------------------------|-------------|
| `true` | `depositAccounts.map(a => a.name)` | "Deposit to" | "No accounts yet" |
| `false` | `cards.map(c => c.name)` | "Paid with" | "No cards yet" |

- Orphan source value (not in current `sources` list) is rendered as an explicit `<option>` labelled by its stored name, same as cards.
- Switching direction (expense ↔ income) resets `source` to the first item in the new list, or `''` if empty.
