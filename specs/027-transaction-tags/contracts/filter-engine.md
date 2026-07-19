# Contract: Pure filter engine deltas (`web/lib/transactionFilters.ts`)

The vector-locked pure surface. Changes are additive and deterministic; the regression vectors in
`shared/test-vectors/transaction-filters.json` are extended and re-locked.

## Type deltas

```ts
export interface FilterCriteria {
  query: string
  categories: TransactionCategory[]
  kind: 'all' | 'expense' | 'income' | 'transfer'
  sources: string[]
  owners: string[]
  tags: string[]            // NEW — tag ids; OR-within, AND-across (like sources/owners)
  dateFrom: string | null
  dateTo: string | null
}

export interface FilterContext {
  ownerNames: Record<string, string>
  tagNames?: Record<string, string>   // NEW, optional — tag id → name, for free-text search
}
```

`emptyCriteria()` adds `tags: []` (this is what keeps the CLI and all `emptyCriteria()`-spreading
callers compiling unchanged).

## Behavior deltas

1. **Tag dimension** in `filterTransactions`, placed alongside the other multi-selects:
   ```ts
   if (c.tags.length > 0 && !(tx.tags ?? []).some((id) => c.tags.includes(id))) return false
   ```
   OR within the selected tags, AND with every other dimension. Order preserved.

2. **Richer `matchesQuery`** — the free-text query also matches notes and tag names:
   ```ts
   if (tx.notes && tx.notes.toLowerCase().includes(q)) return true
   for (const id of tx.tags ?? []) {
     const name = ctx.tagNames?.[id]
     if (name && name.toLowerCase().includes(q)) return true
   }
   ```
   (in addition to the existing merchant/source/category/owner-name matches). Absent `tagNames`/`notes` simply contribute no match.

3. **`activeFilterCount`** adds `if (c.tags.length > 0) n++`.

4. `monthBounds`, date logic, and every existing dimension are unchanged.

## Vector cases added to `scripts/gen-vectors.ts`

`FSET` transactions gain `tags` ids (and one gains `notes`); `FCTX` gains `tagNames`. New
`FILTER_CASES` (expected ids computed by re-running `filterTransactions`, then committed):

- `tag single (OR)` — one tag id selected.
- `tag multi (OR)` — two tag ids; a tx matches if it carries either.
- `AND: expense ∧ tag` — kind + tag combine by AND.
- `absent tag → empty` — a tag id no tx carries yields no rows.
- `search tag name` — query equals a tag's name; matches txs carrying it (via `tagNames`).
- `search notes` — query appears only in a tx's notes; that tx matches.

Regenerate with `cd web && npm run gen:vectors`; `transaction-filters.parity.test.ts` then asserts
the committed JSON. The stale "Mirrored in Swift … so the two clients can't drift" header comment is
updated to describe the single-implementation regression suite (iOS is frozen — constitution v2.0.0).

## Acceptance

- New hand-written unit tests in `transaction-filters.test.ts` (authored **before** the engine
  change, RED) pass after the change (GREEN): single tag, multi-tag OR, AND-with-kind, absent tag,
  search-by-tag-name, search-by-notes, and "no tags criteria → unchanged from before".
- `npm run gen:vectors` produces a diff limited to the new cases + the `tags`/`tagNames`/`notes`
  fields on `FSET`/`FCTX`; the parity test is green.
- Existing filter cases are byte-identical (additivity — a criteria with `tags: []` and no
  notes/tagNames behaves exactly as today).
