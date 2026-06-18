# Tasks: Household reimbursement & settle-up

**Input**: Design documents from `/specs/012-household-reimbursement/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/reimbursement.md, quickstart.md
**Tests**: REQUIRED — Constitution VI (test-driven; money/relationship logic locked by golden vectors). Failing tests precede implementation.
**Organization**: by user story (US1 P1 → US2 P1 → US3 P1 → US4 P2), after a foundational phase (migration + shared balance logic).

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: parallelizable (different files, no incomplete dependency). Web and iOS tracks for a story touch different files → run in parallel.
- Web: `web/`. iOS: `iOS/Ortho-iOS/`. Shared vectors: `shared/test-vectors/`. Migration: `supabase/migrations/`.

---

## Phase 1: Setup

- [x] T001 Confirm baseline on branch `012-household-reimbursement`: `cd web && npm test` green (Node ≥22, sandbox off) and `cd iOS && xcodebuild test -scheme Ortho-iOS` green; record web/iOS test counts for the PARITY.md bump.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the migration + the shared, mirrored, vector-locked balance logic every story depends on. ⚠️ Complete before Phase 3.

- [x] T002 Write the migration `supabase/migrations/20260618120000_member_reimbursement.sql`: `alter type transaction_kind add value if not exists 'transfer'`; `alter type transaction_category add value if not exists 'transfer'`; `alter table transactions add column paid_by uuid references household_people(id)`; backfill `paid_by` for `kind='expense'` rows from `created_by` via `household_people.linked_user_id` (+ matching `household_id`). Additive/reversible; the new enum values are NOT referenced in-migration.
- [x] T003 [P] Add a `member-balance` vector block to `web/scripts/gen-vectors.ts` (cases: worked $150 100/50 you-paid → +50; reverse; payer-not-an-owner → full amount; reimbursement zeroes; partial; over-reimbursement flips sign; multi-expense net mixed payers; a 3rd member's tx doesn't affect viewer↔other) and run `cd web && npm run gen:vectors` to emit `shared/test-vectors/member-balance.json`.
- [x] T004 [P] Write FAILING Vitest `web/test/member-balance.parity.test.ts` asserting every case in `member-balance.json` via `balanceBetween`.
- [x] T005 Implement pure `balanceBetween(viewer, other, transactions)` (+ optional `balancesForViewer`) in `web/lib/balances.ts` per the contract; make T004 pass.
- [x] T006 [P] Write FAILING XCTest `iOS/Ortho-iOSTests/MemberBalanceParityTests.swift` asserting `member-balance.json`.
- [x] T007 Implement `balanceBetween` in `iOS/Ortho-iOS/Balances.swift` (mirror); make T006 pass; register the test file + vector resource in `iOS/Ortho-iOS.xcodeproj/project.pbxproj` (mirror the existing parity-test membership pattern).

**Checkpoint**: balance math identical web↔iOS and vector-locked; migration ready.

---

## Phase 3: User Story 1 — Record who paid an expense (P1)

**Goal**: every expense carries a payer (default = you, editable), round-tripping through create/edit/reload.
**Independent test**: add expense → payer defaults to you; change it; reload persists; legacy expenses show creator as payer.

- [x] T008 [P] [US1] Web: add `paid_by: string | null` to `Transaction` (and keep `TransactionKind`/`TransactionCategory` ready for `'transfer'`) in `web/lib/types.ts`.
- [x] T009 [US1] Web: persist + rehydrate `paid_by` in `web/lib/store.tsx` (txRecord/addTransaction/updateTransaction + rehydrateTransactions); default `paid_by` = current person on create; keep the share-less fallback correct.
- [x] T010 [US1] Web: add a "Paid by" member picker (default current person, shown when >1 member) to `web/components/web/TxForm.tsx` (useTxForm + TxFormFields); show "Paid by <member>" in the transaction detail (`web/components/transactions/TransactionDetailBody.tsx`).
- [x] T011 [P] [US1] Web: FAILING Vitest `web/test/paid-by.test.tsx` — new expense defaults paid_by to the current person; editing changes it; it round-trips through the store. Make T009/T010 satisfy it.
- [x] T012 [P] [US1] iOS: add `paidBy` to `Models/Transaction.swift`; persist/rehydrate in `App/AppState.swift` + `Services/TransactionsAPI.swift` (default current person on create); add the "Paid by" picker to `Features/Transactions/AddTransactionSheet.swift` and show it in `TransactionDetailSheet.swift`; add XCTest coverage.

**Checkpoint**: who-paid recorded + editable on both surfaces.

---

## Phase 4: User Story 2 — See the running balance (P1)

**Goal**: a clear per-other-member balance ("X owes you $Y" / "You owe X $Y" / "Settled") in the transactions section.
**Independent test**: $150 expense 100/50 paid by you → "Tasnuva owes you $50"; flips/updates as shares/payer change; same on iOS+web.

- [x] T013 [US2] Web: expose a balance selector from `web/lib/store.tsx` (or a hook) using `balances.ts` over the current member + transactions.
- [x] T014 [US2] Web: render a balance line/card in the transactions section (`web/app/(app)/transactions/page.tsx` + `web/components/web/TransactionsDesktop.tsx`) — tokens only, **owing not red**, "Settled" at zero.
- [x] T015 [P] [US2] Web: FAILING Vitest `web/test/balance-display.test.tsx` — the worked example renders "Tasnuva owes you $50"; reverse renders "You owe …". Make T013/T014 satisfy it.
- [x] T016 [P] [US2] iOS: expose the balance from `App/AppState.swift` via `Balances.swift`; render the balance line in `Features/Transactions/TransactionsView.swift` (owing not red); add XCTest for the AppState balance.

**Checkpoint**: balance visible + correct on both surfaces.

---

## Phase 5: User Story 3 — Settle up / record a reimbursement (P1)

**Goal**: a `transfer` reimbursement (ower → payer) that reduces the balance and is excluded from all spend/income aggregates.
**Independent test**: "owes you $50" → Settle up pre-fills $50 → save → "Settled"; no spend/income/budget/per-owner number changes; row shows "Tasnuva → Ayaz $50".

- [x] T017 [P] [US3] Web: add `'transfer'` to `TransactionKind` + `'transfer'` to `TransactionCategory` in `web/lib/types.ts`; teach `web/lib/transactionFilters.ts` the `transfer` kind (filter/label).
- [x] T018 [US3] Web: add a 'Transfer' direction to `web/components/web/TxForm.tsx` (From→To member pair + amount; no category/source/split/merchant); persist as `{kind:'transfer', paid_by:sender, owner_ids:[recipient], shares:{recipient:amount}, category:'transfer'}` via the existing create path; validate amount>0 and From≠To.
- [x] T019 [US3] Web: add a "Settle up" button beside the balance (T014) that opens the Transfer form pre-filled (From=ower, To=payer, amount=owed); render transfer rows distinctly in the list/detail (`web/components/transactions/TransactionRow.tsx`, `TransactionDetailBody.tsx`, `TransactionsDesktop.tsx`).
- [x] T020 [US3] Web: AUDIT + guard — confirm `kind === 'transfer'` is excluded from `spentBy`, `categoryExpenseTotal`, `expenseTotal`, insights, dashboard cards, and the per-owner breakdown (`web/lib/store.tsx`, `lib/finance/insights.ts`, dashboard components).
- [x] T021 [P] [US3] Web: FAILING Vitest `web/test/transfer-exclusion.test.tsx` — adding a transfer reduces the balance by its amount and changes NO spend/income/budget/per-owner figure; the transfer row renders directionally. Make T018–T020 satisfy it.
- [x] T022 [P] [US3] iOS: add `transfer` to `TransactionKind`/`TransactionCategory`; add the Transfer mode (From→To + amount) to `AddTransactionSheet.swift` persisting the same shape; add the "Settle up" entry beside the balance; render transfer rows distinctly (`TransactionRow.swift`/`TransactionDetailSheet.swift`); audit that `transfer` is excluded from every iOS aggregate (`AppState` spend/income/per-owner, InsightEngine); add XCTest mirroring T021.

**Checkpoint**: full settle-up loop works on both surfaces; aggregates clean.

---

## Phase 6: User Story 4 — Parity doc + tests (P2)

- [x] T023 Update `PARITY.md`: add a "Member reimbursement / settle-up balance" row in the transaction block (after the splits/data-contract rows), iOS ✅ / web ✅ / CLI — , source `lib/balances.ts ↔ Balances.swift → member-balance.json`; note the `transfer` kind + category extend the "Category / kind / source taxonomy" row and that filtering/listing learns `transfer`; bump the audit header date + web/iOS test counts.
- [x] T024 Run `cd web && npm run gen:vectors`; confirm `member-balance.json` is the ONLY new/changed vector (no diff to `transaction-splits.json` etc.).
- [x] T025 Run full `cd web && npm test` and `cd iOS && xcodebuild test -scheme Ortho-iOS`; both green; record final counts into PARITY.md.
- [ ] T026 Manual quickstart walkthrough (both surfaces) per `quickstart.md` steps 1–7 (who-paid, balance, settle, no-pollution, activity row, parity, edges).

---

## Dependencies & Execution

- **Order**: Setup (T001) → Foundational (T002–T007) → US1 (T008–T012) → US2 (T013–T016) → US3 (T017–T022) → Polish (T023–T026).
- **Foundational blocks everything** (migration + `balanceBetween`). US2 needs US1 (`paid_by`). US3 needs US2 (a balance to reduce) + the `transfer` kind.
- **Parallel**: Foundational T003∥(then T004→T005) and T006 (then →T007), web track ∥ iOS track within each story (e.g. US1 {T008–T011} ∥ {T012}; US3 web {T017–T021} ∥ iOS {T022}).

## MVP

US1 + US2 + US3 together are the shippable core (you can record who paid, see what's owed, and settle it). US1 alone (who-paid) and US2 alone (balance from history) are independently demoable increments; US4 is the parity/test hardening.
