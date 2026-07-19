---
description: "Task list for Transaction Tags & Richer Notes (spec 027)"
---

# Tasks: Transaction Tags & Richer Notes

**Input**: Design documents from `specs/027-transaction-tags/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/migration.md, contracts/filter-engine.md

**Tests**: REQUIRED. Constitution Principle VI (Test-Driven & Regression-Safe) is NON-NEGOTIABLE —
every unit is written test-first (RED → GREEN → refactor); the pure filter engine is re-locked in
`shared/test-vectors/transaction-filters.json`.

**Working tree**: the writable clone at repo root (`/Users/ayazuddin/Development/personal/Ortho`),
branch `feat/transaction-tags`. All web commands run from `web/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: may run in parallel (different files, no ordering dependency)
- **[Story]**: US1 (tag + filter, MVP), US2 (reuse/dedup), US3 (notes + search), FND (foundational), POL (polish)

---

## Phase 1: Setup

- [ ] T001 Confirm sandbox is ready: `if [ -d /run/sandbox/source ]; then echo clone; fi`, `git rev-parse --abbrev-ref HEAD` == `feat/transaction-tags`, local Supabase up (`supabase status`), `web/.env.local` targets `127.0.0.1:54321`. (Bootstrap already ran.)

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: schema + type foundation. No story UI can compile until these land.

- [ ] T002 [FND] Write migration `supabase/migrations/20260718120001_transaction_tags.sql` per `contracts/migration.md`: `transactions.notes`, `tags`, `transaction_tags`, RLS, explicit grants. Heavily-commented header (spec ref + client invariants), repo migration style.
- [ ] T003 [FND] Apply + verify: `supabase db reset` clean; confirm `tags`/`transaction_tags` exist and the `tags_household_lower_name_idx` rejects a case-insensitive duplicate (quick `psql`/Studio check). Depends on T002.
- [ ] T004 [P] [FND] `web/lib/types.ts`: add `Tag` interface; add optional `tags?: string[]` + `notes?: string | null` to `Transaction` (doc-comments per data-model.md). Keep `PICKABLE_CATEGORIES`/enums untouched.
- [ ] T005 [P] [FND] `web/lib/supabase/rows.ts`: add `TagRow`, `TransactionTagRow`; add `notes: string | null` to `TransactionRow`.

**Checkpoint**: `npx tsc --noEmit` still green (all new type fields optional/additive); DB reset clean.

---

## Phase 3: User Story 1 — Tag a transaction and filter by it (Priority: P1) 🎯 MVP

**Goal**: attach tags to a transaction; filter the Transactions list by tag (OR-within, AND-across); remove tag filters.

**Independent Test**: tag one of two transactions "vacation", filter by "vacation" → only it shows; clear → both return.

### Tests first (RED)

- [ ] T006 [P] [US1] `web/test/transaction-filters.test.ts`: add failing cases — `tags` dimension single/multi (OR), AND with kind, absent-tag→empty, and "empty `tags` criteria unchanged from today". Assert against `filterTransactions`. (Fails: `FilterCriteria.tags` / `Transaction.tags` not yet wired.)
- [ ] T007 [P] [US1] `web/test/transactions-filter-ui.test.tsx`: add failing tests — FilterPanel renders a Tags section with chips derived from tags present on transactions (alphabetized), toggling sets the filter; ActiveFilterChips shows a removable tag chip and removing it clears the tag. (Fails: no tag UI.)
- [ ] T008 [P] [US1] Store test (`web/test/store.*.test.tsx` — mirror existing rehydrate tests): `rehydrateTransactions` materializes `tx.tags` (ids) from `transaction_tags` rows and defaults to `[]`; `writeTags` deletes-then-inserts join rows; a `writeTags` failure surfaces an error WITHOUT rolling back the parent (contrast with `writeShares`). (Fails: not implemented.)

### Implementation (GREEN)

- [ ] T009 [US1] `web/lib/transactionFilters.ts`: add `tags: string[]` to `FilterCriteria` (+ `emptyCriteria`), the tag dimension in `filterTransactions` (`(tx.tags ?? []).some(...)`), and `activeFilterCount` +1. Update the stale "Mirrored in Swift" header to the single-implementation regression framing. Makes T006 pass.
- [ ] T010 [US1] `web/lib/store.tsx`: `loadAll` adds parallel selects for `tags` (household-scoped) + `transaction_tags`; thread a `tagsByTx` map into `rehydrateTransactions` (sets `tx.tags`); expose `tags: Tag[]`; add internal `writeTags(tx)` (delete+insert, no parent rollback) called after `writeShares` in `addTransaction`/`updateTransaction`; add `notes` to `txRecord` and the `transactions` column projection. Makes T008 pass.
- [ ] T011 [US1] `web/lib/useTransactionFilters.ts`: derive `tagOptions` ({id,name}, present-on-transactions, alphabetized, resolved via `store.tags`); add `toggleTag` (extend the `toggleIn` key union to include `tags`); build `ctx.tagNames` (id→name) from `store.tags`.
- [ ] T012 [US1] `web/components/web/FilterPanel.tsx`: add a Tags `<section>` of `Chip`s (gated on `tagOptions.length > 0`), matching the Source section. `web/components/web/ActiveFilterChips.tsx`: add removable tag chips (label = tag name) + wire into `f.count`. Makes T007 pass.

**Checkpoint**: US1 fully functional — tag via store, filter via panel, chips clear. `npm test` green for touched suites.

---

## Phase 4: User Story 2 — Create, reuse & de-duplicate household tags (Priority: P2)

**Goal**: tags are household-owned, reusable, and typing an existing name (any case) reuses it — no duplicates.

**Independent Test**: tag one tx "Vacation", type "vacation" on another → same single tag attached; filter list shows one "vacation".

### Tests first (RED)

- [ ] T013 [P] [US2] Store test: `addTag(name)` trims, rejects empty-after-trim, returns the existing roster tag on a case-insensitive match (no new id, no duplicate insert), and otherwise creates a `Tag` with a client uuid + optimistic insert. (Fails: `addTag` absent.)
- [ ] T014 [P] [US2] `web/test/` tag-editor test (new, jsdom): typing a new name + Enter adds a chip and calls `addTag`; typing an existing name reuses it; the × removes the chip from the transaction only. (Fails: no `TagEditor`.)

### Implementation (GREEN)

- [ ] T015 [US2] `web/lib/store.tsx`: implement `addTag(name): Tag` (dedup + optimistic create + async persist with rollback/error, per research D5); expose it from the context. Makes T013 pass.
- [ ] T016 [US2] `web/components/web/TagEditor.tsx` (NEW): inline chip editor — existing-tag suggestions (from `store.tags`), free-text add (Enter/blur → `addTag` → push id), remove chip; calm chips + labelled input, tokens only, hit targets ≥ 40px. Makes T014 pass.

**Checkpoint**: US1 + US2 both pass; the tag roster de-duplicates and is reusable across transactions.

---

## Phase 5: User Story 3 — Richer notes + search (Priority: P3)

**Goal**: record a free-form note on a transaction; find transactions by searching notes or tag names.

**Independent Test**: add note "reimburse Sam"; search "reimburse" → found. Search a tag name → tagged txs found.

### Tests first (RED)

- [ ] T017 [P] [US3] `web/test/transaction-filters.test.ts`: add failing cases — query matches `tx.notes`; query matches a tag name via `ctx.tagNames`; both alongside the existing merchant/source/category/owner matches. (Fails: `matchesQuery` not extended.)
- [ ] T018 [P] [US3] Form/detail test: the tx form renders a Notes field that round-trips through save (empty→null); `TransactionDetailBody` shows notes + tag chips when present. (Fails: no notes/notes-display.)

### Implementation (GREEN)

- [ ] T019 [US3] `web/lib/transactionFilters.ts`: extend `matchesQuery` to also match `tx.notes` and tag names via optional `ctx.tagNames` (per contracts/filter-engine.md). Makes T017 pass.
- [ ] T020 [US3] `web/components/transactions/TransactionDetailBody.tsx`: render tag chips + notes (only when present), calm styling. Makes the detail half of T018 pass.

---

## Phase 6: Form integration (US1 + US2 + US3 converge on the shared form)

- [ ] T021 [US1] `web/components/web/TxForm.tsx` `useTxForm`: add `tags: string[]` + `notes: string` state (seed from `src`), include both in the built `tx` (in `base`, so all branches carry them), expose setters in the returned API. Makes the form-save half of T018 + US1 tagging pass end-to-end.
- [ ] T022 [US1] `web/components/web/TxForm.tsx` `TxFormFields`: render `<TagEditor>` + a Notes text row in the expense/income branch (after the Source/date card), reusing `ow-card`/`Row`. Shared by the desktop drawer and the mobile new/edit pages (no per-canvas fork).

**Checkpoint**: create/edit a transaction with tags + notes on both desktop and mobile forms; all three stories work end-to-end.

---

## Phase 7: Golden vectors (re-lock the pure engine)

- [ ] T023 [FND] `web/scripts/gen-vectors.ts`: add `tags` ids to `FSET` (+ one `notes`), `tagNames` to `FCTX`, and the new `FILTER_CASES` from contracts/filter-engine.md (tag single/multi/AND/absent, search-by-tag-name, search-by-notes). Update the `ftx` default to include `tags: []`.
- [ ] T024 [FND] Regenerate + lock: `cd web && npm run gen:vectors`; review `git diff shared/test-vectors/transaction-filters.json` (must be limited to the new cases + tags/tagNames/notes fields); `npm test -- transaction-filters` (incl. `*.parity.test.ts`) green. Depends on T009, T019, T023.

---

## Phase 8: Polish & Cross-Cutting

- [ ] T025 [P] [POL] i18n: add any new UI strings ("Tags", "Notes", "Add a tag", "Remove {0} filter" reuse) to all five catalogs (`web/lib/i18n/*`) and confirm `catalog-reachability`/`render-locale` locks pass. (Only if new user-facing strings were introduced.)
- [ ] T026 [P] [POL] Reconcile docs: add the tags/notes capability row to `PARITY.md`; update `docs/web.md` (filter stack + store loadAll fan-out + new component) and `docs/supabase.md` (§4.1 schema, §4.4 migration-history table, §5 key files) to mention the migration and tables.
- [ ] T027 [P] [POL] Mark the backlog item delivered: update `docs/future_tasks/4.4-transaction-tags-notes.md` with a "Delivered in specs/027-transaction-tags" pointer (and reflect in `FUTURE-TASKS.md` if it indexes it).
- [ ] T028 [POL] Full gates: `cd web && npm test` (whole suite) + `npx tsc --noEmit` green; `supabase db reset` clean. Run the quickstart.md manual smoke if a dev server is convenient.
- [ ] T029 [POL] Commit, push to `feat/transaction-tags`, open PR (only in the writable clone; push before the sandbox is removed).

---

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational (T002–T005)** blocks everything.
- **US1 (T006–T012)** is the MVP — after Foundational. T006/T007/T008 (RED) before T009–T012 (GREEN). T009 before T011 (hook imports criteria). T010 before T011 (hook reads `store.tags`).
- **US2 (T013–T016)** after US1's store/roster (T010). T013 before T015; T014 before T016; T016 depends on T015 (`addTag`).
- **US3 (T017–T020)** after Foundational; independent of US2. T017 before T019; T018 before T019/T020.
- **Form integration (T021–T022)** after `TagEditor` (T016) + `addTag` (T015) + types (T004); it wires all three stories into the shared form.
- **Vectors (T023–T024)** after the engine changes (T009 + T019).
- **Polish (T025–T029)** last; T028 gates the PR (T029).

### Parallel opportunities

- T004 ‖ T005 (different files).
- Within a story, the RED test tasks marked [P] are independent files and can be authored together.
- T025 ‖ T026 ‖ T027 (docs/i18n, different files).

## Implementation Strategy

1. Setup + Foundational (schema + types) → compiles green, additive.
2. **US1 (MVP)**: tag data + filter UI → STOP, validate the tag→filter→clear loop.
3. **US2**: reuse/dedup + the tag editor → validate no-duplicate behavior.
4. **US3**: notes + search → validate search-by-notes/tag-name.
5. Converge on the shared form (T021–T022), re-lock vectors (T023–T024), reconcile docs, run gates, open PR.
