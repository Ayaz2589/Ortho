# Tasks: Income Deposit Accounts (spec 033)

**Branch**: `feat/income-deposit-accounts`
**Input**: `specs/033-income-deposit-accounts/` — spec.md, plan.md, data-model.md, contracts/store-api.md

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[US#]**: Maps to user story in spec.md
- TDD: test tasks must be written **RED** before their implementation tasks

---

## Phase 1: Foundation

**Purpose**: DB table + type layer — everything else depends on these.

- [X] T001 Create migration `supabase/migrations/20260730120000_deposit_accounts.sql` — `deposit_accounts` table, index, and RLS policies mirroring the `cards` block in `20260521120000_initial_schema.sql`
- [X] T002 [P] Add `DepositAccountRow` interface to `web/lib/supabase/rows.ts` (mirrors `CardRow`)
- [X] T003 [P] Add `DepositAccount` interface to `web/lib/types.ts` (mirrors `Card`)

**Checkpoint**: Type layer complete — store and UI tasks can now proceed in parallel.

---

## Phase 2: User Story 1 — Configure Deposit Accounts in Settings (Priority: P1) 🎯 MVP

**Goal**: Users can add and delete named deposit accounts in Settings.

**Independent Test**: Navigate to Settings → Deposit Accounts, add "Chase Checking" → appears in list; delete it → disappears.

### RED tests (write first, must FAIL before implementation)

- [X] T004 Write failing store tests in `web/test/store/deposit-accounts.test.tsx`:
  - `depositAccounts` bootstraps empty from `loadAll` (fail-open when table missing — PGRST205)
  - `addDepositAccount("Chase Checking")` — optimistic insert + Supabase write recorded
  - `addDepositAccount` rollback — server error reverts local state
  - `deleteDepositAccount(id)` — optimistic remove + Supabase delete recorded
  - `deleteDepositAccount` rollback — server error restores entry

### Implementation

- [X] T005 Add `depositAccounts` state and `setDepositAccounts` to `web/lib/store.tsx` (alongside `cards` state at line ~297)
- [X] T006 Add `addDepositAccount` and `deleteDepositAccount` actions to `web/lib/store.tsx` (mirrors `addCard`/`deleteCard` at line ~1057)
- [X] T007 Add `depositAccountsRes` to the `loadAll` fan-out in `web/lib/store.tsx` — fail-open (PGRST205/42P01 → empty array, same guard as `tagsRes`)
- [X] T008 Expose `depositAccounts`, `addDepositAccount`, `deleteDepositAccount` in the store context return value and AppContext type (`web/lib/store.tsx`)
- [X] T009 [P] Create `web/components/settings/AddDepositAccountModal.tsx` (mirrors `AddCardModal.tsx` — modal title "New account", placeholder "e.g. Chase Checking", helper copy about deposit accounts)
- [X] T010 [P] Create `web/app/(app)/settings/deposit-accounts/page.tsx` (mirrors `cards/page.tsx` — uses `depositAccounts`, `deleteDepositAccount`, `AddDepositAccountModal`)
- [X] T011 Add "Deposit Accounts" `LinkRow` entry to `web/app/(app)/settings/page.tsx` (below the `Cards` row, household-guarded)

**Checkpoint**: US1 done — Settings → Deposit Accounts is fully functional.

---

## Phase 3: User Story 2 — "Deposit to" Picker on Income Transactions (Priority: P1)

**Goal**: The income transaction form's "Deposit to" dropdown shows the user's configured deposit accounts.

**Independent Test**: With "Chase Checking" and "Joint Savings" configured, open New → Income → "Deposit to" lists exactly those two. With none configured, shows "No accounts yet".

### RED tests (write first, must FAIL before implementation)

- [X] T012 Write failing form tests in `web/test/transactions/tx-form-income-deposit.test.tsx`:
  - Income form: "Deposit to" `<select>` lists configured deposit account names (not hardcoded strings)
  - Income form: when `depositAccounts` is empty, shows "No accounts yet" placeholder
  - Income form: orphan source value (not in current list) still renders verbatim in `<option>`
  - Direction toggle expense→income: source resets to first deposit account (or `''` if none)
  - Direction toggle income→expense: source resets to first card (or `''` if none)
  - Expense form: "Paid with" is unaffected — still uses `cards`, not deposit accounts

### Implementation

- [X] T013 In `web/components/web/TxForm.tsx`: remove `INCOME_SOURCES` constant and pull `depositAccounts` from `useApp()`
- [X] T014 In `web/components/web/TxForm.tsx`: derive `incomeSources = useMemo(() => depositAccounts.map(a => a.name), [depositAccounts])` alongside existing `expenseSources`
- [X] T015 In `web/components/web/TxForm.tsx`: update `sources` line (currently `isIncome ? INCOME_SOURCES : expenseSources`) to `isIncome ? incomeSources : expenseSources`
- [X] T016 In `web/components/web/TxForm.tsx`: update `setDir` income branch — initial `source` default becomes `incomeSources[0] ?? ''` (was `INCOME_SOURCES[0]`)
- [X] T017 In `web/components/web/TxForm.tsx`: update `useState` for `source` initial value — income path uses `incomeSources[0] ?? ''`

**Checkpoint**: US2 done — income "Deposit to" picker is live and reactive.

---

## Phase 4: User Story 3 — Round-trip Persistence (Priority: P2)

**Goal**: Selected deposit account name survives save → reload → edit → copy.

**Independent Test**: Save income with "Joint Savings" → reload → edit → "Deposit to" still shows "Joint Savings". Copy via "Copy from most common" → pre-fills "Joint Savings".

### RED tests (extend `tx-form-income-deposit.test.tsx`)

- [X] T018 Add test: edit existing income transaction with `source: 'Joint Savings'` — "Deposit to" pre-fills "Joint Savings"
- [X] T019 Add test: copy income transaction (via `loadFrom`) with `source: 'Joint Savings'` — form pre-fills "Joint Savings"
- [X] T020 Add test: legacy source value `'ACH · Checking'` (old hardcoded string) renders verbatim as orphan option

### Implementation

No new implementation needed — `loadFrom` already calls `setSource(tx.source)`, and the orphan-value passthrough already exists in `TxFormFields`. Tests T018–T020 should go GREEN after T013–T017.

**Checkpoint**: All three user stories complete and tested.

---

## Phase 5: i18n

**Purpose**: All 6 locale files updated with deposit-account strings.

New keys needed (mirror cards key shapes):

| Key | English value |
|-----|--------------|
| `'Deposit Accounts'` | `'Deposit Accounts'` |
| `'Add account'` | `'Add account'` |
| `'New account'` | `'New account'` |
| `'No accounts yet'` | `'No accounts yet'` |
| `'e.g. Chase Checking'` | `'e.g. Chase Checking'` |
| `'Accounts appear in the Deposit to menu when you log income. Existing transactions keep their original account name.'` | _(full English)_ |

- [X] T021 [P] Add 6 translation keys to `web/lib/i18n/en.ts`
- [X] T022 [P] Add 6 translation keys to `web/lib/i18n/es.ts`
- [X] T023 [P] Add 6 translation keys to `web/lib/i18n/ja.ts`
- [X] T024 [P] Add 6 translation keys to `web/lib/i18n/ko.ts`
- [X] T025 [P] Add 6 translation keys to `web/lib/i18n/bn.ts`
- [X] T026 [P] Add 6 translation keys to `web/lib/i18n/zh.ts`

---

## Phase 6: Polish & Docs

- [X] T027 Apply migration to local Supabase: `supabase db reset` (from repo root) and verify `deposit_accounts` table exists
- [X] T028 Run full test suite `cd web && npm test` — confirm green, no regressions in existing card/tx-form tests
- [X] T029 [P] Update `docs/supabase.md` — add `deposit_accounts` to the table inventory (alongside `cards`)
- [X] T030 [P] Update `CLAUDE.md` active feature note to reflect spec 033 shipped
- [X] T031 [P] Update `docs/sandbox/sandbox-history.md` — mark this sandbox as last-seen and confirm no unpushed work before removal

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundation)**: Start immediately
- **Phase 2 (US1 Settings)**: Requires T002 + T003 (types)
- **Phase 3 (US2 TxForm)**: Requires T005–T008 (store) — `depositAccounts` must be in store context
- **Phase 4 (US3 Round-trip)**: Requires T013–T017 (TxForm wiring) — tests go GREEN automatically
- **Phase 5 (i18n)**: Can start after T009–T010 (components exist to translate); all T021–T026 are parallel
- **Phase 6 (Polish)**: Requires all phases complete

### TDD Gate

Within each phase: RED test tasks → implementation tasks → verify GREEN. Never write implementation before the test exists and fails.

### Parallel Opportunities Within Phases

- T002 and T003 are parallel (different files)
- T009 and T010 are parallel once T005–T008 are done
- T021–T026 are all parallel (different locale files)
- T029, T030, T031 are parallel

---

## Implementation Strategy

### MVP (Phase 1 + 2 only)

1. T001–T003: foundation
2. T004–T011: store + Settings UI
3. **Validate**: Settings → Deposit Accounts works end-to-end

### Full delivery

Continue sequentially: Phase 3 → 4 → 5 → 6.

### Checklist

- [X] All RED tests written and confirmed FAILING before implementation
- [X] `npm test` green after each phase
- [X] No regressions in card/TxForm/settings existing tests
- [X] `supabase db reset` succeeds with new migration
