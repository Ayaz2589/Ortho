# Phase 1 Data Model: Household reimbursement & settle-up

One new persisted column; one reused row shape; one derived value. Money is USD cents.

## transactions.paid_by (NEW column)

| Field | Type | Null? | Notes |
|---|---|---|---|
| `paid_by` | `household_people.id` (uuid) | yes | The member who **paid** money out. For an **expense**: who fronted it (default = creator). For a **transfer**: the **sender** (ower paying back). Null for income and for legacy expenses whose creator has no linked person. |

Backfill on migration: for existing `kind='expense'` rows, `paid_by` = the `household_people` row where `linked_user_id = transactions.created_by` and `household_id` matches.

## transaction kinds & categories (extended enums)

- `transaction_kind`: `expense | income | **transfer**` (new).
- `transaction_category`: existing spend categories + `income` + `**transfer**` (new — needed because `category` is NOT NULL).

## Transfer (reimbursement) row shape — reuses existing columns

A reimbursement is an ordinary `transactions` row with:

| Column | Value |
|---|---|
| `kind` | `'transfer'` |
| `paid_by` | sender (the ower paying back) |
| `owner_ids` | `[recipient]` (the payer being reimbursed) |
| `shares` | `{ recipient: amount_cents }` (one row; preserves the shares-sum invariant) |
| `amount_cents` | the reimbursement amount (> 0) |
| `category` | `'transfer'` |
| `merchant` / `source` | empty / a neutral label (form hides them) |

Invariants: `paid_by != recipient` (two distinct members); `amount_cents > 0`; transfers never run `computeShares`/`validateSplit`; the share-less rehydrate fallback must treat a `transfer` distinctly (never "creator owns all").

## MemberBalance (derived — not stored)

`balanceBetween(viewer, other, transactions) → number` (signed cents; **positive ⇒ other owes viewer**). Computed from expense shares + `paid_by` and transfer sender/recipient/amount (see contracts). Presented per other member relative to the viewer: "X owes you $Y" (>0), "You owe X $Y" (<0), or "Settled" (0).

## Reused, unchanged

- `transaction_shares` (still sums to `amount_cents`, for every kind), `owner_ids`, `computeShares`/`validateSplit` (expense/income only), `orderedOwnerIds`, the cents invariant, member-scoped RLS on `transactions`, the create/update path, and the `household_people` member model (soft-remove via `removed_at`; FK keeps referenced people resolvable).

## Aggregate guards (must exclude transfers)

Every spend/income/budget/insight/per-owner aggregate already filters `kind === 'expense'` (or `'income'`), so a `transfer` kind is excluded automatically — but this MUST be audited on both surfaces and the dashboard (e.g. web `spentBy`, `categoryExpenseTotal`, `expenseTotal`, insights, dashboard cards; iOS `spent(by:in:)`, `incomeTotal`/`expenseTotal`, InsightEngine) to confirm none treats `transfer` as spend/income.
