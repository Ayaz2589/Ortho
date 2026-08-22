# Phase 1 Data Model: Person-Scoped Dashboard Widgets

**There is no persisted data model.** No table, column, index, migration, RLS policy, or stored
preference is added or changed. This document describes the in-memory state the feature introduces
and the existing types it consumes, because that is where the invariants live.

---

## 1. The state the feature adds

### `MoneyScope` (existing type, new holder)

Defined in `web/lib/scope/moneyScope.ts` (spec 051). Not redefined here — consumed as-is.

```ts
type MoneyScope =
  | { kind: 'household' }
  | { kind: 'person'; personId: string }
```

| Aspect | Value |
|---|---|
| **Held by** | `app/(app)/dashboard/page.tsx`, in `useState` |
| **Initial value** | `HOUSEHOLD_SCOPE` |
| **Lifetime** | The current visit to the dashboard. Not persisted, not in the URL, not in the store (FR-020 — matches today's `personId` state exactly). |
| **Written by** | `MemberScopePicker`, via `onChange` |
| **Read by** | `NetSummaryHero` (as a derived `personId`), and the widget board via context |

**Replaces** today's `const [personId, setPersonId] = useState<string | null>(null)`. The direction
inverts: the page now holds the scope and *derives* `personId` from it, rather than holding
`personId` and deriving nothing.

#### Invariant: referential stability

The scope object identity must be stable across renders when the selection has not changed, because
`useScopedTransactions` memoizes on it. This is satisfied structurally, not by discipline:

- `HOUSEHOLD_SCOPE` is a frozen module constant — always the same reference.
- A person scope is allocated **once**, inside the picker's `onChange`, and stored. It is never
  re-allocated during render.
- `resolveScope(rawScope, activeIds)` returns either `HOUSEHOLD_SCOPE` or the *same* `rawScope`
  object it was given — never a copy. So calling it on every render is free and identity-preserving.

The anti-pattern this rules out: `const scope = personId ? personScope(personId) : HOUSEHOLD_SCOPE`
computed in the render body, which allocates a new object every render and silently defeats every
downstream memo. (Detail in [research.md](./research.md) D4.)

#### Invariant: staleness resolves down, never empty

`scope` is re-resolved against the live roster on every render:

```ts
const scope = resolveScope(rawScope, householdMembers.map((m) => m.id))
```

If the selected person is removed or deactivated mid-session, the board falls back to the household
(FR-004) rather than rendering an empty dashboard. This is the same line the planning page already
runs, and it is why the raw state and the effective state are separate values.

---

### `MoneyScopeContext` (new)

`web/lib/widgets/MoneyScopeContext.tsx`. The people axis for the widget board, mirroring
`DashboardScopeContext` (the time axis).

| Member | Shape | Notes |
|---|---|---|
| `MoneyScopeProvider` | `({ scope, children }) => JSX` | Supplies one scope to all descendants. Unlike `DashboardScopeProvider`, it does not *own* the state — the page does, because the picker and the hero need it too. |
| `useMoneyScope()` | `() => MoneyScope` | Returns `HOUSEHOLD_SCOPE` when there is no provider. **Does not throw** — see research D3. |
| `useScopedTransactions(txs)` | `(Transaction[]) => Transaction[]` | `scopeTransactions(txs, useMoneyScope())`, memoized on `[txs, scope]`. |

**Why the provider does not own its state** (the one structural difference from
`DashboardScopeProvider`, which calls `useDashboardScope()` internally): the money scope has three
consumers at different depths — the picker writes it, the hero reads it as a prop, and the board
reads it through context. State owned inside the provider would be unreachable by the first two.

---

## 2. Existing types this feature reads

Listed to make explicit what is depended on and what must not be touched.

### `Transaction` — the projection contract

`projectForPerson` (spec 051) is the sole attribution rule. Under person scope a transaction becomes:

| Field | Household scope | Person scope |
|---|---|---|
| `amount_cents` | as stored | the person's **stored** share (never a recomputed even split) |
| `owner_ids` | as stored | `[personId]` |
| `shares` | as stored | `{ [personId]: share }` |
| everything else | as stored | as stored |

And the row is **dropped entirely** when the person owns no share. Transfers are the exception:
included at **full** amount when the person is sender or recipient, dropped otherwise, never split.

**Consequence for `ActivityBody`**: its owner line renders `ownersDisplay(tx).label`, which reads
`owner_ids`. Under person scope that becomes the single selected person — correct, and worth knowing
when reading the test expectations.

**Consequence for `HouseholdBalancesBody`**: this projection destroys the payer↔co-owner relationship
a debt is derived from, which is why that widget must never receive projected rows. See research D5.

### `Budget` — the limits half

`scopeBudgets(budgets, scope)` (spec 054):

- **household scope** — only rows with `person_id == null`; returns the same array reference when no
  row is owned, which is every household that has not used per-person budgets.
- **person scope** — only that person's rows, with **no fallback** to the household limit (FR-011).

### `PairBalance` — the balances rows

From `lib/finance/balances.ts` (spec 053): `{ fromId, toId, amountCents }`, antisymmetric by
construction, roster taken from the ledger rather than the active member list so a removed member's
debt stays visible. The people axis filters this array by
`row.fromId === personId || row.toId === personId`; it never re-derives it.

---

## 3. What is deliberately not modeled

| Not added | Why |
|---|---|
| A persisted "last selected person" | FR-020. The current behavior is per-visit, and persisting it would mean a user's dashboard silently opens on someone else's money after a reload. |
| A URL parameter for the scope | The app is a static export with no server routing layer for this; and the time axis is not in the URL either. Consistency, and out of scope. |
| A per-person widget enable/disable set | Widget preferences stay per-device and per-household. The people axis changes *what a widget reports*, not *which widgets exist*. |
| A `personScoped: boolean` field on `WidgetDefinition` | Would put the decision in the registry, one indirection away from the body that implements it, and would tempt the board into filtering widgets by scope. A body either calls the hook or it does not; that is the whole declaration. |
