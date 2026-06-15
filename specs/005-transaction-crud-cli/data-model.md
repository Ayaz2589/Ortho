# Phase 1 Data Model: Transaction CRUD make commands

Reuses the existing persisted schema (unchanged). New in-memory types are CLI-only.

## In-memory types (new)

### TxFilter (engine/filters.ts)
| Field | Type | Notes |
|------|------|------|
| `startISO` | `string?` | Inclusive month-window start (from `MONTH`); `date >= start`. |
| `endISO` | `string?` | Exclusive month-window end; `date < end`. Half-open `[start,end)`. |
| `category` | `TransactionCategory?` | Exact match. |
| `source` | `string?` | Exact match (e.g. `TD Bank`). |
| `scope` | `'personal' \| 'shared'?` | Exact match. |
| `kind` | `'expense' \| 'income'?` | Exact match. |
| `limit` | `number?` | Max rows (default 200). |

**Validation**: `MONTH` must match `YYYY-MM`; `category`/`scope`/`kind` must be valid enum values; `limit` a positive integer. Invalid → reject with a clear message, no query run.

### TxInput (engine/validate.ts — for add/edit)
| Field | Type | Notes |
|------|------|------|
| `merchant` | `string` | Non-empty (trimmed). |
| `amountCents` | `number` | `> 0`, integer (via `parseAmountToCents`). |
| `category` | `TransactionCategory` | In the 11-value enum; default `entertainment` (expense) / `income`. |
| `kind` | `'expense' \| 'income'` | Default `expense`. |
| `scope` | `'personal' \| 'shared'` | Default `personal`. |
| `dateISO` | `string` | Noon-UTC ISO; default today. |
| `source` | `string` | Default `''` (or `manual`). |
| `ownerIds` | `string[]` | Default `[operator]`; >1 ⇒ shared. |
| `splits` | `Record<string,number> \| null` | Even (null) or custom summing to 100. |

## Persisted schema (existing — unchanged)

### transactions (insert/update mirror `web/lib/store.tsx` `txRecord`)
`{ id, household_id, merchant, category, kind, scope, amount_cents, source, date, created_by }`
- Invariant: `scope='shared' ⇔ household_id != null`.
- `amount_cents` bigint ≥ 0; `category` enum (11); `date` timestamptz (noon-stable); `created_by` the authed user.

### transaction_shares (shared scope only; mirror `writeShares`)
One row per owner: `{ transaction_id, user_id, percent }`, `percent = effectiveSplits(tx)[user_id]`. `on delete cascade` from `transactions` (so `deleteOne` removes them automatically).

## DB operations (db/transactions.ts)
| Fn | Maps to | Notes |
|----|---------|------|
| `getOne(supabase, id)` | `select('*').eq('id', id).maybeSingle()` | `null` ⇒ not found (RLS-scoped). |
| `listTransactions(supabase, userId, filter, admin)` | `select('*')` + filters + `order(date desc)` + `limit` | non-admin adds `.eq('created_by', userId)`. |
| `createOne(supabase, tx)` | `insert(txRecord(tx))` then `shareRows` if shared | mirrors store `addTransaction`. |
| `updateOne(supabase, tx)` | `update(txRecord(tx)).eq('id')` then rewrite shares | mirrors store `updateTransaction` + `writeShares`. |
| `deleteOne(supabase, id)` | `delete().eq('id', id)` | shares cascade. |

Each returns the affected row(s)/count or throws on DB error (CLI maps to exit code 5).

## State transitions (edit)
- **personal → shared**: set `scope='shared'`, `household_id` = operator household, `owner_ids` (≥2), write `transaction_shares`.
- **shared → personal**: set `scope='personal'`, `household_id=null`, delete `transaction_shares`.
- **field-only edits** (merchant/amount/category/date/kind): `txRecord` update; shares unchanged unless owners/split edited.

## Rehydrating a fetched row for edit
A DB row has `shares?` via a joined select (or a follow-up `transaction_shares` read); `owner_ids`/`splits` are derived from shares for display (mirrors the web store's `rehydrate`), so edits start from the true current owners/splits.
