# Contract: `upsert_transaction` RPC

Called via `supabase.rpc('upsert_transaction', { p_tx, p_shares })`.

---

## Request

### `p_tx` (jsonb)

```jsonc
{
  "id":           "<uuid>",           // required — the transaction's stable id
  "household_id": "<uuid>",           // required for shared; null for personal
  "merchant":     "Whole Foods",      // required
  "category":     "groceries",        // required — valid transaction_category enum value
  "kind":         "expense",          // required — "expense" | "income" | "transfer"
  "amount_cents": 4200,               // required — non-negative integer cents
  "source":       "Chase Sapphire",   // required (empty string if unknown)
  "date":         "2026-07-18T00:00:00.000Z", // required — ISO 8601 timestamptz
  "created_by":   "<uuid>",           // required — the creating user's id
  "paid_by":      "<uuid>" | null     // nullable — the person who fronted the money
}
```

**Validation rules** (enforced by RPC):
- `id`, `merchant`, `category`, `kind`, `amount_cents`, `source`, `date`, `created_by` are required.
- `amount_cents` must be a non-negative integer (bigint).
- On conflict (`id` already exists): `merchant`, `category`, `kind`, `amount_cents`, `source`, `date`, `paid_by`, `updated_at` are updated. `household_id`, `created_by`, `created_at` are immutable.

### `p_shares` (jsonb — array)

```jsonc
[
  { "person_id": "<uuid>", "amount_cents": 2100 },
  { "person_id": "<uuid>", "amount_cents": 2100 }
]
```

**Validation rules** (enforced by RPC):
- Array must be non-empty (at least one share required).
- `sum(amount_cents)` across all share objects must equal `p_tx.amount_cents` exactly.
- Each `person_id` must be a valid `household_people.id` (enforced by FK on insert).
- Each `amount_cents` must be a non-negative integer.

---

## Response

### Success

HTTP 200, body: `null` (void function — no return value).

### Failure

HTTP 400 (PostgREST surfaces Postgres exceptions as 400):

```jsonc
{
  "code":    "23514",        // check_violation
  "message": "SHARES_MISMATCH: shares sum 3000 != transaction amount 4200",
  "details": null,
  "hint":    null
}
```

| `code` | Cause |
|--------|-------|
| `23514` | Sum mismatch or empty shares (RPC inline check) |
| `23503` | Unknown `person_id`, `household_id`, or `created_by` (FK violation) |
| `42501` | RLS blocked the write — caller is not a household member |

---

## Caller mapping

| Caller | Wraps | Replaces |
|--------|-------|---------|
| `store.tsx addTransaction()` | `supabase.rpc('upsert_transaction', ...)` | `supabase.from('transactions').insert()` + `writeShares()` + compensating rollback |
| `store.tsx updateTransaction()` | `supabase.rpc('upsert_transaction', ...)` | `supabase.from('transactions').update()` + `writeShares()` + compensating restore |
| `persist.ts persist()` | `supabase.rpc('upsert_transaction', ...)` | sequential `from('transactions').insert()` + `from('transaction_shares').insert()` + delete-on-rollback |

---

## TypeScript call shape

```ts
const { error } = await supabase.rpc('upsert_transaction', {
  p_tx: {
    id: tx.id,
    household_id: tx.household_id ?? null,
    merchant: tx.merchant,
    category: tx.category,
    kind: tx.kind,
    amount_cents: tx.amount_cents,
    source: tx.source,
    date: tx.date,
    created_by: tx.created_by,
    paid_by: tx.paid_by ?? null,
  },
  p_shares: tx.owner_ids.map((pid) => ({
    person_id: pid,
    amount_cents: effectiveShares(tx)[pid] ?? 0,
  })),
})
```
