# Contract: DB operations (must mirror the web store)

`db/transactions.ts` reproduces `web/lib/store.tsx` semantics so CLI rows are indistinguishable from app rows. `txRecord` and `shareRows` are imported from `db/persist.ts` (spec 004).

## getOne
```ts
supabase.from('transactions').select('*').eq('id', id).maybeSingle()
// + fetch its transaction_shares to derive owner_ids/splits for edit display
```
`null` data ⇒ not found (RLS hides inaccessible rows).

## listTransactions(userId, filter, admin)
```ts
let q = supabase.from('transactions').select('*')
if (!admin) q = q.eq('created_by', userId)
if (filter.category) q = q.eq('category', filter.category)
if (filter.source)   q = q.eq('source', filter.source)
if (filter.scope)    q = q.eq('scope', filter.scope)
if (filter.kind)     q = q.eq('kind', filter.kind)
if (filter.startISO) q = q.gte('date', filter.startISO)
if (filter.endISO)   q = q.lt('date', filter.endISO)
q = q.order('date', { ascending: false }).limit(filter.limit ?? 200)
```

## createOne(tx)   (mirrors store addTransaction)
```ts
await supabase.from('transactions').insert(txRecord(tx))     // exact web shape
const rows = shareRows(tx)                                    // [] for personal
if (rows.length) await supabase.from('transaction_shares').insert(rows)
```

## updateOne(tx)   (mirrors store updateTransaction + writeShares)
```ts
await supabase.from('transactions').update(txRecord(tx)).eq('id', tx.id)
await supabase.from('transaction_shares').delete().eq('transaction_id', tx.id)
const rows = shareRows(tx)                                    // [] for personal
if (rows.length) await supabase.from('transaction_shares').insert(rows)
```

## deleteOne(id)   (mirrors store deleteTransaction)
```ts
await supabase.from('transactions').delete().eq('id', id)     // shares cascade (FK)
```

## Errors & access
- Any `{ error }` from Supabase → throw (CLI exit code 5), surfacing `error.message`.
- Sign-in mode: RLS enforces `created_by = auth.uid()` for personal writes and household membership for shared; the CLI adds no extra checks.
- `ADMIN=1`: service-role client bypasses RLS; `created_by` may be set to another user (e.g. via the importer's holder resolution).

## Tests (mocked client)
A fake `supabase` records `.from(table)` + method/payload calls; assert:
- `createOne` inserts the exact `txRecord` shape; shares only when shared.
- `updateOne` issues update-by-id then delete-then-insert shares (none for personal).
- `deleteOne` issues a single `delete().eq('id', …)`.
- `listTransactions` chains the right `.eq/.gte/.lt/.order/.limit` for a given `TxFilter`.
