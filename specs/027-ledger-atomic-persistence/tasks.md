# Tasks: Ledger Atomic Persistence

**Input**: Design documents from `specs/027-ledger-atomic-persistence/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Constitution Principle VI mandates test-first development. Test tasks are included and MUST fail before implementation begins.

**Organization**: Tasks grouped by user story. US1 (create path) and US4 (share-less invariant) share a phase — the RPC enforces both simultaneously.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story label (US1–US4 from spec.md)

---

## Phase 1: Setup

**Purpose**: Scaffold the migration file and test file so implementation can begin.

- [X] T001 Create empty migration file `supabase/migrations/20260718120000_upsert_transaction_atomic.sql` with a header comment describing the feature
- [X] T002 [P] Create empty test file `web/test/ledger-atomic.test.ts` with a top-level `describe('upsert_transaction RPC')` block and a single skipped placeholder test — confirms the file is picked up by Vitest

**Checkpoint**: `cd web && npm test` runs without errors (placeholder test skipped, all existing suites green)

---

## Phase 2: Foundational — Database Migration

**Purpose**: The `upsert_transaction` PL/pgSQL function is the single prerequisite for every user story. Nothing else can be tested until the migration is applied.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete and `supabase db reset` succeeds.

- [X] T003 Write the `upsert_transaction(p_tx jsonb, p_shares jsonb)` PL/pgSQL function body in `supabase/migrations/20260718120000_upsert_transaction_atomic.sql` per `contracts/upsert_transaction.md`:
  - Validate `jsonb_array_length(p_shares) >= 1` — raise `check_violation` `'NO_SHARES: ...'` if empty
  - Validate `sum(s->>'amount_cents') = (p_tx->>'amount_cents')::bigint` — raise `check_violation` `'SHARES_MISMATCH: shares sum X != transaction amount Y'` if not equal
  - `INSERT INTO public.transactions … ON CONFLICT (id) DO UPDATE` for all mutable columns
  - `DELETE FROM public.transaction_shares WHERE transaction_id = v_id`
  - `INSERT INTO public.transaction_shares …` for all share rows
  - `security invoker`, `set search_path = public`, `language plpgsql`
- [X] T004 Add a pre-migration diagnostic query in `supabase/migrations/20260718120000_upsert_transaction_atomic.sql` that logs the count of existing share-less transaction rows (a `DO $$ … $$` block that raises a `NOTICE` — forward-only, no data changes)
- [X] T005 Apply migration: run `supabase db reset` from repo root; verify `select proname from pg_proc where proname = 'upsert_transaction'` returns one row

**Checkpoint**: Migration applied cleanly. `upsert_transaction` function exists in local Supabase. All existing tests still green.

---

## Phase 3: US1 + US4 — Atomic Create & Share-Less Invariant (Priority: P1) 🎯 MVP

**Goal**: A new transaction and its shares are written atomically via the RPC. The database rejects any payload where shares do not sum to the transaction amount or the shares array is empty.

**Independent Test**: `web/test/ledger-atomic.test.ts` — create-path tests all pass; share-less invariant tests all pass. Query `select count(*) from transactions t where not exists (select 1 from transaction_shares s where s.transaction_id = t.id)` returns 0 for rows written after migration.

### Tests for US1 + US4 ⚠️ — Write FIRST, verify they FAIL before T009

- [X] T006 [US1] Write failing test: calling `supabase.rpc('upsert_transaction', …)` with a valid transaction and shares that sum to `amount_cents` returns no error and both the transaction row and share rows exist in `web/test/ledger-atomic.test.ts`
- [X] T007 [US1] Write failing test: calling the RPC with shares whose sum ≠ `amount_cents` returns a `check_violation` error (`code === '23514'`) and no rows are written in `web/test/ledger-atomic.test.ts`
- [X] T008 [US4] Write failing test: calling the RPC with an empty `p_shares` array returns a `check_violation` error and no transaction row is written in `web/test/ledger-atomic.test.ts`

### Implementation for US1 + US4

- [X] T009 [US1] In `web/lib/store.tsx`, rewrite `addTransaction`'s async write block to call `supabase.rpc('upsert_transaction', { p_tx: txRecord(tx), p_shares: shareRows(tx) })` — on error, revert optimistic state and call `setError`; remove the separate `from('transactions').insert()` call and the `writeShares()` invocation and all compensating-rollback logic
- [X] T010 [US1] Add a `shareRows(tx: Transaction)` helper in `web/lib/store.tsx` (mirrors `persist.ts`'s `shareRows`) that maps `tx.owner_ids` to `{ person_id, amount_cents }` objects using `effectiveShares(tx)` — this produces the `p_shares` array for the RPC
- [X] T011 [US1] Run `cd web && npm test` — T006, T007, T008 must now pass; all existing parity suites must remain green

**Checkpoint**: `addTransaction` uses the RPC. Tests pass. No compensating rollback code remains in the create path.

---

## Phase 4: US2 — Atomic Edit Path (Priority: P1)

**Goal**: Editing an existing transaction (same `id`) atomically replaces the transaction row and its share rows via the same RPC. The update is idempotent on retry.

**Independent Test**: `web/test/ledger-atomic.test.ts` — update-path tests pass. Calling the RPC twice with the same `id` but different `amount_cents` and shares leaves only the second set of values.

### Tests for US2 ⚠️ — Write FIRST, verify they FAIL before T013

- [X] T012 [US2] Write failing test: calling the RPC a second time with the same `id` but a different `amount_cents` and new shares updates the transaction row and replaces the share rows atomically — old shares are gone, new shares sum to the new amount in `web/test/ledger-atomic.test.ts`
- [X] T013 [P] [US2] Write failing test: calling the RPC update with shares that do not sum to the new `amount_cents` returns `check_violation`, the original transaction and original shares remain unchanged in `web/test/ledger-atomic.test.ts`

### Implementation for US2

- [X] T014 [US2] In `web/lib/store.tsx`, rewrite `updateTransaction`'s async write block to call `supabase.rpc('upsert_transaction', { p_tx: txRecord(tx), p_shares: shareRows(tx) })` — on error, revert optimistic state and call `setError`; remove the separate `from('transactions').update()` call, the `writeShares()` invocation, and all compensating-restore logic (the double-fallback restore block)
- [X] T015 [US2] Remove the `writeShares` helper function from `web/lib/store.tsx` — it is now dead code (both callers replaced by the RPC)
- [X] T016 [US2] Run `cd web && npm test` — T012 and T013 must now pass; all tests remain green

**Checkpoint**: Both `addTransaction` and `updateTransaction` use the RPC. `writeShares` is deleted. No compensating rollback/restore code remains in `store.tsx`.

---

## Phase 5: US3 — Import CLI Atomic Writes (Priority: P2)

**Goal**: The import CLI's `persist()` function uses `upsert_transaction` instead of the two-step insert. A crash or network drop mid-import cannot leave orphaned parent rows.

**Independent Test**: `web/test/ledger-atomic.test.ts` — CLI persist-path test passes. Running the CLI dry-run against a valid CSV produces no errors and the logged output shows the correct number of written transactions.

### Tests for US3 ⚠️ — Write FIRST, verify they FAIL before T018

- [X] T017 [US3] Write failing test: the refactored `persist()` function calls `supabase.rpc('upsert_transaction', …)` for each transaction in the array and throws a typed error on RPC failure in `web/test/ledger-atomic.test.ts` (mock the supabase client)

### Implementation for US3

- [X] T018 [US3] In `web/scripts/import/db/persist.ts`, rewrite the `persist()` function body to call `supabase.rpc('upsert_transaction', { p_tx: txRecord(tx), p_shares: shareRows(tx) })` for each transaction — remove the manual `from('transactions').insert()`, `from('transaction_shares').insert()`, and the delete-on-failure rollback block
- [X] T019 [US3] Update the module-level comment in `web/scripts/import/db/persist.ts` to remove the reference to the old two-step compensating pattern (it no longer exists)
- [X] T020 [US3] Run `cd web && npm test` — T017 must now pass; all tests remain green

**Checkpoint**: CLI `persist()` uses the RPC. The manual delete-on-failure rollback block is removed. All tests green.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verification, documentation, and cleanup.

- [X] T021 [P] Run the full quickstart.md validation: `supabase db reset`, `npm test`, SQL share-less-row query returns 0
- [X] T022 [P] Typecheck: `cd web && npx tsc --noEmit` — zero errors
- [X] T023 Update `docs/finance.md` §16 H3(b) to mark the database guarantee as Done, linking to this migration file
- [X] T024 [P] Smoke test the web UI (manual): add a new expense split, edit it, verify Supabase Studio shows correct share rows summing to `amount_cents` each time
- [X] T025 Run `cd web && npm test` one final time — full suite green, coverage thresholds met

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user stories (migration must be applied before any RPC call is possible)
- **Phase 3 (US1 + US4)**: Depends on Phase 2 — this is the MVP
- **Phase 4 (US2)**: Depends on Phase 3 (shares `shareRows` helper added in T010 is reused; `writeShares` deletion in T015 requires both callers already replaced)
- **Phase 5 (US3)**: Depends on Phase 2 (RPC must exist); can be parallelized with Phase 4 since `persist.ts` is an independent file
- **Phase 6 (Polish)**: Depends on all story phases complete

### User Story Dependencies

- **US1 + US4 (Phase 3)**: No dependency on other stories — pure MVP
- **US2 (Phase 4)**: Soft dependency on US1 (T010 adds `shareRows` that US2 reuses; T015 removes `writeShares` which must no longer be called by either path)
- **US3 (Phase 5)**: Independent of US1/US2 (different file: `persist.ts`) — can parallelize with Phase 4 after Phase 2

### Within Each Phase

- Test tasks MUST be written and confirmed FAILING before corresponding implementation tasks
- T010 (`shareRows` helper) MUST precede T014 (update path uses it)
- T015 (`writeShares` deletion) MUST follow both T009 and T014 (both callers replaced first)

---

## Parallel Opportunities

### Phase 1
```
T001 (migration file)   ║  T002 (test file)
```

### Phase 3 — Tests can be written in parallel
```
T006 (valid create test)  ║  T007 (sum-mismatch test)  ║  T008 (empty-shares test)
```

### Phase 4 — Tests can be written in parallel
```
T012 (update replaces shares)  ║  T013 (update rejects bad sum)
```

### Phase 5 + 4 — Can run in parallel after Phase 2
```
Phase 4 (US2 update path, store.tsx)  ║  Phase 5 (US3 CLI, persist.ts)
```

### Phase 6
```
T021 (quickstart)  ║  T022 (tsc)  ║  T023 (docs)  ║  T024 (smoke test)
```

---

## Implementation Strategy

### MVP First (US1 + US4 only — Phase 1 + 2 + 3)

1. Complete Phase 1: Create migration + test files
2. Complete Phase 2: Write and apply the `upsert_transaction` function
3. Complete Phase 3: Wire `addTransaction`, write + pass create-path tests
4. **STOP and VALIDATE**: `npm test` green, SQL share-less query returns 0, UI smoke test passes
5. This MVP delivers the core integrity guarantee

### Incremental Delivery

1. MVP (Phases 1–3): atomic create, share-less invariant → ✅ SC-001, SC-002, SC-003
2. Add Phase 4 (US2): atomic edit → ✅ SC-005
3. Add Phase 5 (US3): atomic CLI imports → ✅ SC-006
4. Polish (Phase 6): docs updated, typechecks clean → ✅ SC-004

---

## Notes

- `[P]` tasks touch different files or independent sections — safe to run in parallel
- `writeShares` in `store.tsx` becomes dead code after T009 + T014; delete it in T015, not before
- The `txRecord()` helper in both `store.tsx` and `persist.ts` is reused unchanged — it builds the `p_tx` payload
- `shareRows()` mirrors the old `persist.ts` `shareRows` export — add it as a store-local helper in T010
- The migration is `security invoker` — RLS applies; no privilege escalation needed
- The CLI's service-role client bypasses RLS at the connection level — `security invoker` still works for `--admin` mode
- Commit after each phase checkpoint at minimum; commit after each task for cleaner history
