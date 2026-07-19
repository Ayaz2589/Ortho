# Data Model: Ledger Atomic Persistence

No new tables. The feature introduces one new Postgres function and enforces existing entity relationships more strictly.

---

## Existing entities (unchanged shape, new constraint)

### `public.transactions`

| Column | Type | Constraint | Notes |
|--------|------|-----------|-------|
| id | uuid | PK | Immutable after creation |
| household_id | uuid | FK → households.id, nullable | null = personal transaction |
| merchant | text | NOT NULL | |
| category | transaction_category | NOT NULL | Postgres enum |
| kind | transaction_kind | NOT NULL | `expense | income | transfer` |
| amount_cents | bigint | NOT NULL, ≥ 0 | Integer USD cents |
| source | text | NOT NULL, default '' | |
| date | timestamptz | NOT NULL | |
| created_by | uuid | NOT NULL, FK → users.id | Immutable after creation |
| paid_by | uuid | nullable, FK → household_people.id | Required for expense settle-up |
| created_at | timestamptz | NOT NULL, default now() | Immutable |
| updated_at | timestamptz | NOT NULL, default now() | Updated by RPC |

**New invariant enforced by RPC**: Every row in `transactions` that is written via `upsert_transaction` has at least one corresponding row in `transaction_shares` whose amounts sum to `amount_cents`. Historical rows are not retroactively constrained by this migration.

### `public.transaction_shares`

| Column | Type | Constraint | Notes |
|--------|------|-----------|-------|
| transaction_id | uuid | NOT NULL, FK → transactions.id ON DELETE CASCADE | |
| person_id | uuid | NOT NULL, FK → household_people.id ON DELETE RESTRICT | |
| amount_cents | bigint | NOT NULL, ≥ 0 | Integer USD cents |
| (PK) | (transaction_id, person_id) | | |

**Existing constraint** (from 20260616 migration): `amount_cents >= 0`.  
**New invariant enforced by RPC**: `sum(amount_cents) WHERE transaction_id = X` equals `transactions.amount_cents WHERE id = X` for any transaction written via the RPC.

---

## New database object

### `public.upsert_transaction(p_tx jsonb, p_shares jsonb)`

A PL/pgSQL function that atomically writes one transaction and its share rows.

**Parameters**:
- `p_tx jsonb` — a JSON object whose keys mirror the `transactions` INSERT column set (see [contracts/upsert_transaction.md](./contracts/upsert_transaction.md))
- `p_shares jsonb` — a JSON array of `{ "person_id": "<uuid>", "amount_cents": <bigint> }` objects

**Returns**: `void` (raises exception on validation failure)

**Security**: `security invoker` — runs with caller's permissions; RLS policies on both tables apply as normal.

**Behaviour**:
1. Validate `jsonb_array_length(p_shares) >= 1` — raises `check_violation` if empty
2. Validate `sum(s->>'amount_cents') = (p_tx->>'amount_cents')::bigint` — raises `check_violation` if mismatch
3. `INSERT … ON CONFLICT (id) DO UPDATE` the transaction row
4. `DELETE FROM transaction_shares WHERE transaction_id = v_id`
5. `INSERT INTO transaction_shares …` for all share rows

Steps 3–5 execute within the implicit Postgres transaction of the function call — all commit or none do.

**Error codes**:
- `23514` (check_violation) — sum mismatch or empty shares
- `23503` (foreign_key_violation) — unknown person_id or household_id
- `42501` (insufficient_privilege) — RLS blocked the write

---

## State transitions

```
Before this feature:
  addTransaction() → INSERT transactions → INSERT transaction_shares
                                        ↑ failure path: DELETE transactions (may also fail → orphan)

After this feature:
  addTransaction() → rpc('upsert_transaction', {tx, shares})
                   → [atomic: INSERT/UPSERT tx + DELETE+INSERT shares]
                   → success or full rollback (no orphan possible)
```
