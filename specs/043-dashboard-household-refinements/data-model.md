# Data Model: Dashboard & Household Refinements

No database schema changes. This feature adds one derived (computed) type and reuses existing transaction
data. Types live in `web/lib/finance/personSummary.ts`.

## Reused existing entities (unchanged)

- **Transaction** (`web/lib/types.ts`): `kind: 'expense' | 'income' | 'transfer'`, `amount_cents`,
  `owner_ids: string[]`, `shares: Record<string, number>`, `paid_by?: string | null`, `date`. Split
  purchases carry per-owner cents in `shares`; `effectiveShares(tx)` (in `web/lib/format.ts`) returns the
  per-owner cents (falling back to an even split when `shares` is empty). **Not modified.**
- **Transfer**: a `kind === 'transfer'` transaction. `paid_by` = sender, `owner_ids[0]` = recipient,
  `amount_cents` = amount, `shares` empty. Helpers `isTransfer(tx)` and `transferParties(tx) → {from, to}`
  in `web/lib/transaction.ts`. **Not modified.**
- **Person** (`web/lib/types.ts` / store `people`): household member with `id`, `name`, `removed_at`.
  Active members (`removed_at == null`) populate the selector.

## New derived entity: PersonSummary (computed, not stored)

```ts
export interface PersonSummary {
  income: number            // cents attributed to the person over the period
  expenses: number          // cents = Σ the person's share of expense splits over the period
  transfersReceived: number // cents received as transfers over the period
  transfersSent: number     // cents sent as transfers over the period
  net: number               // income − expenses + transfersReceived − transfersSent
}

export function personSummary(
  transactions: Transaction[],
  personId: string,
  start: Date,   // inclusive
  end: Date,     // exclusive (matches existing widget/hero windowing)
): PersonSummary
```

**Computation rules** (all over `tx` with `start ≤ date < end`):

| Field | Rule |
| --- | --- |
| `income` | `Σ effectiveShares(tx)[personId]` for `tx.kind === 'income'` where `personId ∈ owner_ids`. |
| `expenses` | `Σ effectiveShares(tx)[personId]` for `tx.kind === 'expense'` where `personId ∈ owner_ids`. |
| `transfersReceived` | `Σ tx.amount_cents` for transfers with `transferParties(tx).to === personId`. |
| `transfersSent` | `Σ tx.amount_cents` for transfers with `transferParties(tx).from === personId`. |
| `net` | `income − expenses + transfersReceived − transfersSent`. |

**Invariants / properties** (unit + property tested):
- Integer cents throughout; no floating math.
- **Share conservation (SC-003)**: for any single expense, `Σ over members effectiveShares(tx)[m]` equals
  `tx.amount_cents` — so summing each member's `personSummary.expenses` over all members reproduces the
  household expense total (no double-count, no lost cents).
- A transfer where the person is neither `from` nor `to` contributes 0.
- A member with no activity → all-zero summary (calm empty state, never an error).
- Pure and deterministic given inputs; window is `[start, end)`.

## UI state (not persisted)

- **Selected member** (`MemberSummary`): `string | null` — a person `id`, or `null` = "Everyone". React
  state on the dashboard; not written to storage or DB. `null` renders no personal row.

## Savings comparison (derived, no new type)

- Reuses `savingsRate(incomeCents, expenseCents)` (`web/lib/reports/savings.ts`) on two month buckets — the
  selected month and its previous calendar month — both bucketed from `transactions` the same way the widget
  already does. "Previous month exists" is decided from `availableMonths` (from the dashboard scope).

## Removed entities

- **`balanceBetween(viewer, other, transactions)`** (`web/lib/balances.ts`) — the who-owes-whom net
  computation. Deleted. No replacement (the feature is removed, not reworked).
</content>
