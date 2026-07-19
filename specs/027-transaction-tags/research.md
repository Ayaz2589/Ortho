# Research: Transaction Tags & Richer Notes

Design decisions and the alternatives weighed, with the reasoning that resolved each. Nothing here
is [NEEDS CLARIFICATION]; the spec's Assumptions section records the product-level defaults, this
records the technical ones.

## D1. Normalized `tags` table + `transaction_tags` join vs. a `text[]` column

**Decision**: Normalized `tags(id, household_id, name, created_at)` + `transaction_tags(transaction_id, tag_id)` join. `transactions` gains a plain `notes text` column.

**Why**:
- The backlog item (`docs/future_tasks/4.4-transaction-tags-notes.md`) and the feature request both explicitly ask for "a `tags` table + join".
- It mirrors the established `household_people` (roster) + `transaction_shares` (join) pattern the codebase already uses, so RLS, rehydration, and the atomic write all have a proven shape to copy.
- Household-scoped reuse + case-insensitive de-duplication (FR-003/FR-004) fall out naturally from a roster with a unique index; a `text[]` per row would fragment ("Vacation" vs "vacation") and make "distinct tags in the household" a scan-and-dedup every render.

**Rejected**: `transactions.tags text[]`. Simpler migration, but no dedup/reuse story, no clean "rename later", and it doesn't match the requested design or the codebase's roster+join idiom.

## D2. Tag identity

**Decision**: A tag's identity is its **trimmed, case-insensitively-unique name within a household**. Enforced by `create unique index on tags (household_id, lower(btrim(name)))` and by client-side `addTag` dedup (case-insensitive trimmed match against the in-memory roster before creating).

**Why**: Free-form tags only stay useful if "work", "Work", and "work " collapse to one. A DB unique index is the backstop; the client dedup avoids a failed insert on the common path and lets the optimistic UI reuse the existing id immediately.

**Consequence**: No "rename tag" / "merge tags" management surface in v1 (Assumptions). Orphan tags (attached to nothing) are harmless and remain in the roster; they simply stop appearing as filter chips because the filter list is derived from tags present on transactions (FR-010).

## D3. Domain shape — ids vs names in `Transaction.tags`

**Decision**: `Transaction.tags` is an array of **tag ids** (like `owner_ids`). The store holds the household `tags: Tag[]` roster and resolves ids → names for display and for search (`FilterContext.tagNames`).

**Why**: Consistent with `owner_ids` (ids in the domain, names resolved via `resolveUser`), rename-safe, and it keeps the join integrity obvious. The pure filter engine only ever compares strings, so ids-vs-names is invisible to it and to the vectors.

**Rejected**: names-as-identity in the domain. Would make search trivial but couples the ledger to display strings and complicates any future rename.

## D4. Type optionality — minimize churn, keep the CLI compiling

**Decision**:
- `FilterCriteria.tags: string[]` — **required**. Every construction site goes through `emptyCriteria()` (the app hook and the import CLI both spread it), so adding `tags: []` there covers all callers with zero other edits, and the criteria stays uniform with `sources`/`owners`/`categories`.
- `FilterContext.tagNames?: Record<string, string>` — **optional**. The CLI passes `{ ownerNames }` and never searches tag names; making `tagNames` optional keeps `scripts/import/tx.ts` and the existing filter unit-test `CTX` literals valid without edits. `matchesQuery` treats absent `tagNames` as "no tag-name search".
- `Transaction.tags?: string[]` and `Transaction.notes?: string | null` — **optional**. Dozens of test/fixture/CLI sites build `Transaction` literals; optional fields (like the existing `paid_by?`) keep them all compiling. The filter reads `tx.tags ?? []`; `rehydrateTransactions` always materializes `tags` to at least `[]`.

**Why**: The constitution's test-first discipline is easier to honor when the type change itself doesn't cascade into unrelated fixtures. Optionality here is the same call already made for `paid_by`.

## D5. Optimistic tag creation (`addTag`)

**Decision**: The store exposes `addTag(name): Tag`. It trims, rejects empty, returns the existing roster tag on a case-insensitive match, or creates a new `Tag` with a client `crypto.randomUUID()` id, inserts it into state immediately, and persists async (rollback + error banner on failure — the store's standard pattern). The tag editor calls `addTag` and adds the returned id to the transaction's `tags`.

**Why**: Matches the app's optimistic-with-rollback data layer, gives the form a synchronous id for the join, and centralizes dedup in one place (so both the desktop and mobile forms get it for free).

**Rejected**: resolving/creating tags lazily inside `writeTags` from names. Would push name→id resolution into the write path and make the form carry raw names, diverging from the `owner_ids` model.

## D6. `writeTags` atomicity

**Decision**: `writeTags(tx)` mirrors `writeShares`: delete `transaction_tags` for the transaction, then insert a row per `tx.tags` id. It runs after `writeShares` in `addTransaction`/`updateTransaction`. Unlike shares, tags carry **no sum invariant**, so a `writeTags` failure surfaces the error banner but does **not** roll back the parent transaction or its shares — an untagged-but-otherwise-correct transaction is a safe partial state, and the next `loadAll` reconciles.

**Why**: Shares must be all-or-nothing because a share-less parent silently corrupts dashboards (the existing rollback rationale). Tags are additive metadata; rolling back a correct transaction because a label didn't attach would be worse than a missing label. Keeping the write ordered-but-independent is both simpler and safer.

## D7. Notes field

**Decision**: `transactions.notes text` (nullable). The form stores a string; on save an empty-after-trim note is written as `null` (FR-011). `matchesQuery` includes `tx.notes` in the free-text search (FR-012).

**Why**: `source` already exists but means "which card/account paid" — it is not a free-form note. A dedicated nullable column is the minimal additive change and keeps `source` semantics intact.

## D8. Filter/search wiring

**Decision**: Reuse the shared `FilterPanel` + `ActiveFilterChips` (already used by both the compact bottom-sheet and the desktop drawer) — add a "Tags" chip section and removable tag chips. `useTransactionFilters` derives `tagOptions` ({id,name}, present-on-transactions, alphabetized) and a `toggleTag` setter, and builds `ctx.tagNames` from the store roster. The tag dimension is OR-within / AND-across, identical to sources/owners.

**Why**: One wiring point covers every canvas; the semantics already match user expectations set by the other multi-selects; no new UI surface.

## D9. iOS / cross-language parity

**Decision**: None required. Per the constitution (v2.0.0) and `docs/index.md`, iOS is **frozen** — the golden vectors are now a single-implementation regression suite, not a cross-language lock. The stale "Mirrored in Swift" comment atop `transactionFilters.ts` will be updated to reflect the single-implementation reality. No Swift is touched.

## D10. CLI scope

**Decision**: The import/CRUD CLI neither sets nor filters by tags in v1. `emptyCriteria()` gaining `tags: []` and `tagNames` being optional means the CLI keeps compiling and behaving identically; imported transactions are simply untagged (Assumptions, FR-015).

**Why**: Tags are an in-app curation concern; bank imports have no tag signal. Keeping the CLI out of scope avoids parsing/flag surface with no user demand.
