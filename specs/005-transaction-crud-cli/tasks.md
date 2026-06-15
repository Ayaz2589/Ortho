---
description: "Task list for Transaction CRUD make commands (CLI)"
---

# Tasks: Transaction CRUD make commands (CLI)

**Input**: Design documents from `specs/005-transaction-crud-cli/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/. Builds on spec 004 (`web/scripts/import/`).

**Tests**: REQUIRED (Constitution Principle VI + SC-005). Money/date/filter/split + DB-payload logic is written test-first and locked by deterministic tests; the Supabase client is mocked.

**Organization**: By user story (US1 list P1 → US2 add P2 → US3 edit P2 → US4 rm P3). Paths relative to repo root.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: parallelizable (different file, no incomplete dependency)

---

## Phase 1: Setup

- [x] T001 Extend the root `Makefile` with `tx-list`, `tx-add`, `tx-edit`, `tx-rm` targets per `contracts/cli.md` (each maps its vars → `cd web && npx tsx scripts/import/tx.ts <sub> …`, using the same spaces-safe pattern as `ingest`). Add them to `.PHONY` and `ingest-help`.

---

## Phase 2: Foundational (Blocking Prerequisites)

- [x] T002 Create `web/scripts/import/tx.ts` skeleton: read `argv[2]` subcommand (`list|add|edit|rm`), a shared `--flag value`/env parser, `makeClient` auth wiring (OTP default, `--admin`), `die(code,msg)` + exit codes (0/1/5), and a dispatch switch with stub handlers. No business logic yet.
- [x] T003 [P] Create `web/scripts/import/db/transactions.ts` with `getOne(supabase, id)` (`select('*').eq('id', id).maybeSingle()` + fetch its `transaction_shares` to derive `owner_ids`/`splits`), importing `txRecord`/`shareRows` from `db/persist.ts`. Other CRUD fns added per story.

**Checkpoint**: dispatcher + auth + `getOne` exist — stories can begin.

---

## Phase 3: User Story 1 - List my transactions (Priority: P1) 🎯 MVP

**Goal**: `make tx-list` prints a money-aligned, newest-first table, narrowable by month/category/source/scope/kind/limit. Read-only.

**Independent Test**: `npm test` green for filters/render/list; `make tx-list MONTH=2026-05 KIND=expense` shows only matching rows correctly formatted; empty filter prints `No transactions match.`

### Tests (write first, ensure FAIL) ⚠️
- [x] T004 [P] [US1] `web/test/import/filters.test.ts` — `parseFilters` (combinable, validates enums/limit) and `monthRange('2026-05')`→`[2026-05-01, 2026-06-01)` incl. Dec→Jan rollover; invalid `MONTH`/enum rejected.
- [x] T005 [P] [US1] `web/test/import/render.test.ts` — `renderTable` columns + alignment, `formatMoney` income `+` / expense `−`, short id, empty-list message; `renderDetail` labelled view.
- [x] T006 [P] [US1] `web/test/import/transactions.test.ts` — `listTransactions` chains the right query for a `TxFilter` (mock records `.eq('created_by')`, `.eq(category/source/scope/kind)`, `.gte/.lt('date')`, `.order(date desc)`, `.limit`); admin omits the `created_by` scope.

### Implementation
- [x] T007 [P] [US1] `web/scripts/import/engine/filters.ts` — `TxFilter`, `parseFilters`, `monthRange` (pure).
- [x] T008 [P] [US1] `web/scripts/import/engine/render.ts` — `renderTable(rows)` + `renderDetail(tx)` using `@/lib/finance/money` `formatMoney` (pure).
- [x] T009 [US1] `web/scripts/import/db/transactions.ts` — add `listTransactions(supabase, userId, filter, admin)`.
- [x] T010 [US1] `web/scripts/import/tx.ts` — `list` handler: `parseFilters` → auth → `listTransactions` → `renderTable`; empty → message; read-only, no confirm.
- [x] T011 [US1] Run `cd web && npm test` (US1 suites green) + `tsc --noEmit`; smoke `make tx-list LIMIT=5` (auth path reachable). Fix until green.

**Checkpoint**: list works end-to-end. **MVP.**

---

## Phase 4: User Story 2 - Add a transaction by hand (Priority: P2)

**Goal**: `make tx-add` validates like the web form and persists one transaction (personal, or shared with owners/split).

**Independent Test**: add a personal row → persists with exact fields; add a 70/30 shared row → shares persist; invalid amount/merchant rejected.

### Tests (write first, ensure FAIL) ⚠️
- [x] T012 [P] [US2] `web/test/import/validate.test.ts` — `validateAmount` (>0, comma/`$`, rejects 0/neg/garbage via `parseAmountToCents`), `validateCategory` (enum), `validateMerchant` (non-empty), `parseDay('YYYY-MM-DD')`→noon-UTC ISO + injected-today default.
- [x] T013 [P] [US2] Extend `web/test/import/transactions.test.ts` — `createOne` inserts the exact `txRecord` shape; inserts `transaction_shares` only for shared scope.

### Implementation
- [x] T014 [P] [US2] `web/scripts/import/engine/validate.ts` — validators (reuse `engine/money.ts` `parseAmountToCents`; `TransactionCategory` list).
- [x] T015 [US2] `web/scripts/import/db/transactions.ts` — add `createOne(supabase, tx)` (mirror store `addTransaction`).
- [x] T016 [US2] `web/scripts/import/tx.ts` — `add` handler: gather fields (flags + prompts for missing), validate, default date/category; for shared, reuse `lookups`/`evenSplit`/`validateCustomSplit` owner+split picker; confirm; `createOne`; print short id.
- [x] T017 [US2] Verify: `npm test` + add a personal row and a shared 70/30 row (or assert via tests); idempotent re-list shows them.

**Checkpoint**: create works.

---

## Phase 5: User Story 3 - Edit a transaction (Priority: P2)

**Goal**: `make tx-edit ID=…` shows current values, edits fields (incl. personal↔shared), and writes back mirroring the store.

**Independent Test**: edit category+amount → only those change; personal→50/50 shared → shares written + scope/household set; shared→personal → shares removed; bad id → not found.

### Tests (write first, ensure FAIL) ⚠️
- [x] T018 [P] [US3] Extend `web/test/import/transactions.test.ts` — `updateOne` issues `update(txRecord).eq('id')` then delete-then-insert `transaction_shares` (none for personal); a personal save removes existing shares.

### Implementation
- [x] T019 [US3] `web/scripts/import/db/transactions.ts` — add `updateOne(supabase, tx)` (mirror store `updateTransaction` + `writeShares`).
- [x] T020 [US3] `web/scripts/import/tx.ts` — `edit` handler: `getOne` (→ not-found path) → `renderDetail` → field-by-field edits (validated) → owners/split for shared → confirm → `updateOne`; `No changes.` when nothing edited.
- [x] T021 [US3] Verify: `npm test`; edit a field and a personal↔shared transition (or assert via tests).

**Checkpoint**: update works.

---

## Phase 6: User Story 4 - Delete a transaction (Priority: P3)

**Goal**: `make tx-rm ID=…` shows the row, supports `DRY_RUN`, deletes on confirm (shares cascade).

**Independent Test**: dry-run deletes nothing; confirmed delete removes the row + shares; bad id → not found.

### Tests (write first, ensure FAIL) ⚠️
- [x] T022 [P] [US4] Extend `web/test/import/transactions.test.ts` — `deleteOne` issues a single `delete().eq('id', id)`.

### Implementation
- [x] T023 [US4] `web/scripts/import/db/transactions.ts` — add `deleteOne(supabase, id)`.
- [x] T024 [US4] `web/scripts/import/tx.ts` — `rm` handler: `getOne` (→ not-found) → `renderDetail` → `DRY_RUN`=stop → `y/N` confirm → `deleteOne` → report.
- [x] T025 [US4] Verify: `npm test`; dry-run then real delete (or assert via tests).

**Checkpoint**: delete works; all four commands functional.

---

## Phase 7: Polish & Cross-Cutting

- [x] T026 [P] Update `web/scripts/import/README.md` — document `tx-list/add/edit/rm` (usage, flags, exit codes).
- [x] T027 [P] Update the root `README.md` "Importing bank statements" note to mention the CRUD commands.
- [x] T028 Run the offline `quickstart.md` steps + full `cd web && npm test` + `tsc --noEmit`; confirm green.

---

## Dependencies & Execution Order
- **Setup (T001)** → none. **Foundational (T002–T003)** → after setup; block all stories.
- **US1 (T004–T011)** → after foundational. Pure helpers (T007/T008) before `tx.ts list` (T010); tests (T004–T006) first.
- **US2 (T012–T017)** → after US1 (reuses `tx.ts` shell + auth). **US3 (T018–T021)** → after US2 (reuses validators + getOne). **US4 (T022–T025)** → after US3.
- **Polish (T026–T028)** → last.
- Note: `db/transactions.ts` (T003/T009/T015/T019/T023) and `transactions.test.ts` (T006/T013/T018/T022) are the same files across phases → sequential, not parallel with each other.

### Parallel example (US1)
```
T004 filters.test.ts   T005 render.test.ts   T006 transactions.test.ts   (distinct files)
then: T007 filters.ts ∥ T008 render.ts → T009 listTransactions → T010 tx.ts list
```

## Implementation Strategy
- **MVP = Phases 1–3 (US1 list)**: read-only, fully testable, immediately useful (find ids).
- Then US2 add → US3 edit → US4 rm, each an independently testable increment reusing the same write path.
- Never write to the DB without validation + explicit confirmation.

## Notes
- Reuse, don't duplicate: `@/lib/types`, `@/lib/format` (`effectiveSplits`), `@/lib/finance/money` (`formatMoney`), and 004's `db/{client,lookups,persist}`, `engine/{money,split}`.
- Total: 28 tasks (Setup 1, Foundational 2, US1 8, US2 6, US3 4, US4 4, Polish 3).
- **Verification status**: all 289 web tests pass + `tsc` clean; CLI dispatch/validation smoke-tested offline (unknown subcommand, invalid filter, usage guards). The Verify tasks' **live** add/edit/delete against real data (T017/T021/T025) need the operator's OTP sign-in and were not run autonomously — the create/update/delete/list payload shapes are locked by `transactions.test.ts`.
