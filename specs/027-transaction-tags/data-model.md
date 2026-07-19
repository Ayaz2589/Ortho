# Data Model: Transaction Tags & Richer Notes

## Database (Supabase Postgres)

### New table: `tags`

The per-household free-form label roster (mirrors `household_people`).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `default gen_random_uuid()`; clients may supply their own (optimistic create). |
| `household_id` | `uuid` NOT NULL | `references households(id) on delete cascade`. |
| `name` | `text` NOT NULL | `check (char_length(btrim(name)) between 1 and 50)`. Stored as entered (trimmed by the client); display name. |
| `created_at` | `timestamptz` NOT NULL | `default now()`. |

Indexes:
- `create unique index tags_household_lower_name_idx on tags (household_id, lower(btrim(name)))` — case-insensitive uniqueness per household (the dedup backstop).
- `create index tags_household_id_idx on tags (household_id)`.

### New table: `transaction_tags` (join)

The many-to-many attachment (mirrors `transaction_shares`; a **set**, each pair at most once).

| Column | Type | Notes |
|---|---|---|
| `transaction_id` | `uuid` NOT NULL | `references transactions(id) on delete cascade`. |
| `tag_id` | `uuid` NOT NULL | `references tags(id) on delete cascade`. |
| PK | `(transaction_id, tag_id)` | Set semantics — re-attaching a tag is a no-op. |

Index: `create index transaction_tags_tag_id_idx on transaction_tags (tag_id)`.

### Altered table: `transactions`

- `add column notes text` — nullable free-form note. No default; absent = `null`.

### RLS (enabled on both new tables)

- **`tags`** — plain household-member read/write, like `household_people` / `cards` / `budgets`:
  - `select using (is_household_member(household_id))`
  - `for all using (is_household_member(household_id)) with check (is_household_member(household_id))`
- **`transaction_tags`** — piggyback on the parent transaction's visibility/writability, like `transaction_shares`:
  - `select using (exists (select 1 from transactions t where t.id = transaction_id and is_household_member(t.household_id)))`
  - `for all` write guarded by `t.created_by = auth.uid() or is_household_owner(t.household_id)` in both `using` and `with check`.

### Grants (explicit — spec 024 lesson: new PG17 stacks don't auto-grant DML)

- `grant select, insert, update, delete on tags to authenticated;` and `to service_role;`
- `grant select, insert, update, delete on transaction_tags to authenticated;` and `to service_role;`

(`notes` needs no grant — column on an already-granted table.)

### Migration file

`supabase/migrations/20260718120001_transaction_tags.sql` — timestamp after the last existing
migration (`20260717120000_plaid_connect.sql`). Heavily commented header naming the spec, the
design intent, and the client-side invariants (tag identity = trimmed/lower name; the join is a
set), per the repo's migration style. Applies cleanly on `supabase db reset`.

## Domain types (`web/lib/types.ts`)

```ts
export interface Tag {
  id: string
  household_id: string
  name: string
  created_at: string
}

export interface Transaction {
  // …existing fields unchanged…
  paid_by?: string | null
  owner_ids: string[]
  shares: Record<string, number>
  /** Tag ids attached to this transaction (household `tags` roster). Optional so
   *  existing fixtures/importers need not set it; rehydration always materializes
   *  it to at least []. Orthogonal to category. */
  tags?: string[]
  /** Free-form note. Optional; null/absent = no note. */
  notes?: string | null
}
```

## Row types (`web/lib/supabase/rows.ts`)

```ts
export interface TransactionRow {
  // …existing…
  paid_by: string | null
  notes: string | null   // NEW
}

export interface TagRow {
  id: string
  household_id: string
  name: string
  created_at: string
}

export interface TransactionTagRow {
  transaction_id: string
  tag_id: string
}
```

The `transactions` column projection in `store.loadAll` adds `notes`; two new selects fetch
`tags` (`*`, household-scoped) and `transaction_tags` (`transaction_id, tag_id`).

## Invariants

- **Tag identity**: unique per household by `lower(btrim(name))` — DB index + client `addTag` dedup.
- **Set join**: `(transaction_id, tag_id)` PK; attaching an existing tag is idempotent.
- **Cascade**: deleting a transaction removes its `transaction_tags` rows only (tags survive); deleting a tag removes its attachments everywhere.
- **No sum invariant** (unlike `transaction_shares`): tags are independent metadata; a failed tag write does not roll back the parent transaction.
- **Household scope**: every read/write is `is_household_member`-gated; a member only ever sees/creates/filters their own household's tags and notes.
- **Additivity**: a transaction with `tags = []`/`tags` absent and `notes = null` is byte-for-byte behaviorally identical to a pre-feature transaction across the ledger, insights, budgets, splits, and import.

## Derived state (client)

- `store.tags: Tag[]` — the household roster, loaded in `loadAll`, kept in sync by `addTag`.
- `rehydrateTransactions(rows, shares, tagsByTx, …)` — sets each `tx.tags` from `transaction_tags`.
- `useTransactionFilters.tagOptions: { id; name }[]` — tags present on the household's transactions, alphabetized (drives the filter chips; excludes orphan/absent tags per FR-010).
- `FilterContext.tagNames: Record<string,string>` — id→name for free-text search over tag names.
