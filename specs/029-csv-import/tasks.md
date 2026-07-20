---
description: "Task list for web CSV import feature (spec 029)"
---

# Tasks: Web CSV Bank Statement Import

**Input**: Design documents from `docs/plan/csv-import.md`

**Feature**: Browser-side CSV import of bank transaction statements — a free-tier path for users who won't connect SimpleFIN/Plaid. Users download a CSV from their bank's website, upload it, review a date-grouped ledger preview (editing any row before commit), then add all checked transactions in one shot via the existing `addTransaction()` store path.

**Tests**: TDD throughout — every profile, reducer, hook, and component has tests written first (failing), then implementation to pass them.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared state dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Exact file paths in all descriptions

## Path Conventions

- Profiles: `web/scripts/import/profiles/`
- Profile tests: `web/scripts/import/profiles/__tests__/`
- Profile fixtures: `web/scripts/import/profiles/__tests__/fixtures/`
- Session layer: `web/lib/csv/`
- Session tests: `web/lib/csv/__tests__/`
- UI components: `web/components/csv/`
- Web-specific flow: `web/components/web/`
- Component tests: `web/components/csv/__tests__/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create directories and fixture files; no logic yet. All parallelizable.

- [X] T001 [P] Create fixture directories `web/scripts/import/profiles/__tests__/fixtures/` and `web/lib/csv/__tests__/`
- [X] T002 [P] Create fixture file `web/scripts/import/profiles/__tests__/fixtures/amex-sample.csv` with 5 representative Amex CSV rows (header + 3 purchases + 1 payment)
- [X] T003 [P] Create fixture file `web/scripts/import/profiles/__tests__/fixtures/citi-sample.csv` with 5 representative Citi CSV rows (header + 3 purchases + 1 payment)
- [X] T004 [P] Create fixture file `web/scripts/import/profiles/__tests__/fixtures/capital-one-sample.csv` with 5 representative Capital One CSV rows (header + 3 purchases + 1 payment)
- [X] T005 [P] Create fixture file `web/scripts/import/profiles/__tests__/fixtures/bofa-sample.csv` with 5 representative Bank of America CSV rows (header + 3 purchases, note: no explicit payment column — detect via Payee)
- [X] T006 [P] Create fixture file `web/scripts/import/profiles/__tests__/fixtures/wellsfargo-sample.csv` with 5 representative Wells Fargo CSV rows (NO header row — positional columns: date, amount, *, *, description)
- [X] T007 [P] Create fixture file `web/scripts/import/profiles/__tests__/fixtures/td-bank-csv-sample.csv` with 5 representative TD Bank checking CSV rows (header + 3 debit + 1 credit + balance column)

**Checkpoint**: Fixture directories and CSV sample files exist — profile tests can now import them.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The CSV registry (`csv-index.ts`) is the single shared dependency for the hook layer and UI — it must exist (even empty) before Phase 3's import tests compile.

- [X] T008 Create `web/scripts/import/profiles/csv-index.ts` with `CSV_PROFILES: BankProfile[]` exporting only `chaseCsv` initially; add a `// TODO: add remaining profiles` comment. This is the registry the `useCsvImport` hook and all tests will import.
- [X] T009 Verify TypeScript compiles: run `cd web && npx tsc --noEmit` and confirm zero new errors from T008

**Checkpoint**: `CSV_PROFILES` registry exists and TypeScript is clean — all profile phases (US1) and the session layer (US2) can proceed.

---

## Phase 3: User Story 1 — Bank CSV Profiles (Priority: P1) 🎯 MVP

**Goal**: Every supported bank's CSV can be auto-detected, parsed into `ParsedStatement`, with payment rows excluded, merchants cleaned, categories inferred, and dates resolved to ISO timestamps. Golden fixture tests lock the parser output so regressions are caught.

**Independent Test**: `cd web && npm test -- --testPathPattern=profiles` passes green with all 7 profiles producing expected `ParsedStatement` output from their fixture CSVs.

### Tests for User Story 1 (write FIRST — must FAIL before implementation)

- [X] T010 [P] [US1] Write `web/scripts/import/profiles/__tests__/amex-csv.test.ts`: (a) `detect()` returns true for Amex fixture, false for Chase/Citi headers; (b) `parse()` golden snapshot of `ParsedStatement` from amex-sample.csv — verify row count, merchant names, amountCents, kind, excluded flag on payment row, category guesses
- [X] T011 [P] [US1] Write `web/scripts/import/profiles/__tests__/citi-csv.test.ts`: same shape — detect true/false, parse golden snapshot from citi-sample.csv, verify Debit rows are expenses, Credit rows are income, payment row excluded
- [X] T012 [P] [US1] Write `web/scripts/import/profiles/__tests__/capital-one-csv.test.ts`: detect true/false, parse golden snapshot from capital-one-sample.csv, verify ISO date parsing (YYYY-MM-DD input), payment row excluded via Description "PAYMENT"
- [X] T013 [P] [US1] Write `web/scripts/import/profiles/__tests__/bofa-csv.test.ts`: detect true/false, parse golden snapshot from bofa-sample.csv, verify negative Amount = expense, Address column stripped from merchant
- [X] T014 [P] [US1] Write `web/scripts/import/profiles/__tests__/wellsfargo-csv.test.ts`: detect true/false (no-header CSV), parse golden snapshot from wellsfargo-sample.csv, verify positional column parsing
- [X] T015 [P] [US1] Write `web/scripts/import/profiles/__tests__/td-bank-csv.test.ts`: detect true/false (must NOT match existing `td-bank.ts` PDF profile), parse golden snapshot from td-bank-csv-sample.csv, verify Credit=income/Debit=expense, Balance column ignored
- [X] T016 [US1] Write `web/scripts/import/profiles/__tests__/csv-index.test.ts`: import `CSV_PROFILES`; assert Chase, Amex, Citi, Capital One, BoA, Wells Fargo, and TD Bank profiles are all present; assert no PDF-only profile (amex-gold, apple-card, td-bank) is in CSV_PROFILES; run `detectBank(amexFixtureText, null, CSV_PROFILES)` and assert it returns `{ ok: true, profile.id: 'amex' }`

**Verify all T010–T016 tests FAIL (import errors / assertion failures) before writing implementations.**

### Implementation for User Story 1

- [X] T017 [P] [US1] Implement `web/scripts/import/profiles/amex-csv.ts`: detect on `Date,Description,Card Member,Account #,Amount` header; parse with single Amount column (positive=expense, negative=payment/credit); clean merchant; infer category via `categorize()`; exclude payment rows; extract `cardMember` field from `Card Member` column
- [X] T018 [P] [US1] Implement `web/scripts/import/profiles/citi-csv.ts`: detect on `Date,Description,Debit,Credit` header; parse with two amount columns (Debit=expense cents, Credit=income cents); exclude payment rows matching `/PAYMENT/i` in Description
- [X] T019 [P] [US1] Implement `web/scripts/import/profiles/capital-one-csv.ts`: detect on `Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit` header; parse ISO dates (YYYY-MM-DD → ISO timestamp); two amount columns; exclude payment rows via Description `/PAYMENT/i`
- [X] T020 [P] [US1] Implement `web/scripts/import/profiles/bofa-csv.ts`: detect on `Posted Date,Reference Number,Payee,Address,Amount` header; parse single Amount column (negative=expense); strip Address field from merchant display; infer payment exclusion via Payee text
- [X] T021 [P] [US1] Implement `web/scripts/import/profiles/wellsfargo-csv.ts`: detect on no-header positional shape (first line matches `"MM/DD/YYYY","[-]N.NN"` pattern); parse columns by position [0]=date, [1]=amount, [4]=description; negative amount=expense
- [X] T022 [P] [US1] Implement `web/scripts/import/profiles/td-bank-csv.ts`: detect on `Date,Description,Credit,Debit,Balance` header (must NOT conflict with PDF td-bank.ts detect which looks for PDF text); parse Credit=income/Debit=expense; ignore Balance column
- [X] T023 [US1] Update `web/scripts/import/profiles/csv-index.ts` to import and export all 7 profiles: `[chaseCsv, amexCsv, citiCsv, capitalOneCsv, bofaCsv, wellsFargoCsv, tdBankCsv]`; add a comment slot for `santanderCsv` marked `// TODO: blocked on format research`

**Checkpoint**: `cd web && npm test -- --testPathPattern=profiles` is fully green — all 7 bank profiles parse their fixture CSVs correctly.

---

## Phase 4: User Story 2 — Session / Hook Layer (Priority: P1)

**Goal**: A pure reducer manages the import session state machine (`idle → reading → list-view → importing → summary / undetected`). A React hook wraps it with file reading, bank detection, draft map construction, and duplicate detection. All logic is pure and unit-testable without mounting any component.

**Independent Test**: `cd web && npm test -- --testPathPattern=csv` (lib/csv) passes green — reducer transitions and hook behavior are verified in isolation.

### Tests for User Story 2 (write FIRST — must FAIL before implementation)

- [X] T024 [US2] Write `web/lib/csv/__tests__/csvImportModels.test.ts`: verify `parsedTransactionToDraft()` converts a `ParsedTransaction` into a `CsvDraftRow` with correct id (UUID), merchant, category, amountCents, dateISO, checked=true for normal rows, checked=false for excluded rows, isPaymentRow=true only when `excludeReason === 'card-payment'`, duplicateOf=null
- [X] T025 [US2] Write `web/lib/csv/__tests__/csvImportSession.test.ts`: test all reducer transitions:
  - `idle` + `file/parsed` → `list-view` with draft map populated
  - `idle` + `file/parsed` (undetected) → `undetected`
  - `list-view` + `draft/update` → draft map entry updated, phase unchanged
  - `list-view` + `draft/toggleChecked` → `checked` toggled for target id
  - `list-view` + `draft/skip` → `checked: false` for target id
  - `list-view` + `import/start` → `importing` phase
  - `importing` + `import/done` → `summary` phase with counts
  - Test preskip: payment rows arrive with `checked: false` and `isPaymentRow: true`
- [X] T026 [US2] Write `web/lib/csv/__tests__/useCsvImport.test.tsx`: using `renderHook` + a mocked `File` object containing Chase fixture CSV text, verify: phase transitions from `idle` → `list-view` after calling `loadFile()`; `drafts` array has correct length; `toggleChecked` flips a row; `updateDraft` updates a field; `startImport()` calls `addTransaction` once per checked draft

### Implementation for User Story 2

- [X] T027 [US2] Implement `web/lib/csv/csvImportModels.ts`: export `CsvDraftRow` interface (as specified in plan §3.4); implement `parsedTransactionToDraft(tx: ParsedTransaction, duplicateOf?: string | null): CsvDraftRow` using `crypto.randomUUID()` for id; export `checkedDrafts(drafts: CsvDraftRow[])` helper returning only `checked && !isPaymentRow` rows; export `totalSpendCents(drafts: CsvDraftRow[])` summing checked drafts
- [X] T028 [US2] Implement `web/lib/csv/csvImportSession.ts`: pure reducer with discriminated-union state (`CsvImportState`) and action types (`CsvImportAction`); phases: `idle | reading | list-view | importing | summary | undetected`; `list-view` state holds `drafts: Record<string, CsvDraftRow>`, `bankLabel: string`, `period: StatementPeriod`; `summary` state holds `addedCount`, `skippedCount`, `excludedCount`, `duplicatesCount`, `totalSpendCents`; export `initialCsvImportState`
- [X] T029 [US2] Implement `web/lib/csv/useCsvImport.ts`: React hook using `useReducer(csvImportReducer, initialCsvImportState)`; expose `loadFile(file: File): Promise<void>` which reads text, calls `detectBank(text, null, CSV_PROFILES)`, calls `profile.parse([text])`, builds draft map via `parsedTransactionToDraft`, dispatches `file/parsed`; expose `drafts` (sorted by dateISO desc), `toggleChecked(id)`, `updateDraft(id, patch)`, `skipDraft(id)`, `startImport()` (iterates checked drafts, calls `addTransaction()` per draft, dispatches `import/done`), `phase`, `bankLabel`, `period`

**Checkpoint**: `cd web && npm test -- --testPathPattern=lib/csv` passes — session reducer and hook are verified in isolation without mounting any UI.

---

## Phase 5: User Story 3 — UI Components (Priority: P2)

**Goal**: Three components render the import session: `CsvImportList` (date-grouped ledger preview), `CsvRowEditModal` (per-row full edit), `CsvImportSummary` (post-import recap). `CsvImportFlow` dispatches across phases. Visual design matches the calm Ortho design system (hairlines, no shadows on inset cards, sage/sand accents only).

**Independent Test**: `cd web && npm test -- --testPathPattern=components/csv` passes — components render correctly for each phase/state combination and fire the right callbacks.

### Tests for User Story 3 (write FIRST — must FAIL before implementation)

- [X] T030 [US3] Write `web/components/csv/__tests__/CsvImportList.test.tsx`: render with 3 mock `CsvDraftRow` items spanning 2 dates; assert date group headers render; assert normal row shows merchant + amount + chevron; assert payment row (`isPaymentRow:true`) is dimmed and has no chevron; assert duplicate row (`duplicateOf:'some-id'`) shows muted styling; assert clicking a normal row fires `onEdit(id)`; assert checked count badge updates when rows are toggled
- [X] T031 [US3] Write `web/components/csv/__tests__/CsvRowEditModal.test.tsx`: render with one `CsvDraftRow`; assert merchant input shows draft value; assert "Save" button calls `onSave` with updated fields; assert "Skip this transaction" calls `onSkip(id)`; assert duplicate rows show "Possible duplicate" line + "Include anyway" checkbox
- [X] T032 [US3] Write `web/components/csv/__tests__/CsvImportSummary.test.tsx`: render with `addedCount=35`, `totalSpendCents=261423`, `skippedCount=2`, `excludedCount=3`, `duplicatesCount=2`; assert "35 transactions added" headline; assert "$2,614.23" total; assert breakdown counts; assert "Done" button fires `onDone`
- [X] T033 [US3] Write `web/components/csv/__tests__/CsvImportFlow.test.tsx`: using a mocked `useCsvImport` hook, assert: `idle` phase renders nothing (or the file picker trigger); `undetected` phase renders bank list + "Close" button; `list-view` phase renders `CsvImportList`; `summary` phase renders `CsvImportSummary`

### Implementation for User Story 3

- [X] T034 [US3] Implement `web/components/csv/CsvImportList.tsx`: date-grouped list using `groupByDay()` from `web/lib/format` (or equivalent); date headers use `dayLabel()` / `shortDate()` matching Transactions ledger format; normal rows show `merchant`, `category`, `amountCents` (formatted), chevron `→`; payment rows dimmed (`opacity-50`), no chevron, not tappable; duplicate rows muted with `~` prefix; sticky "Add N transactions" CTA bar at bottom; calls `onEdit(id)` on row tap
- [X] T035 [US3] Implement `web/components/csv/CsvRowEditModal.tsx`: full-screen modal (uses existing `WebModal` chrome on desktop, bottom sheet on mobile) with editable fields: merchant (text input), category (full picker, same as TxForm), amount (numeric input), date (date input), owners (multi-select, defaults all), split (even/percent/amount — reuse TxForm split editor), tags (tag picker), notes (textarea); "Save" dispatches `updateDraft(id, patch)` and closes; "Skip" dispatches `skipDraft(id)` and closes; duplicate rows show "Possible duplicate of {date} · ${amount}" + "Include anyway" toggle
- [X] T036 [US3] Implement `web/components/csv/CsvImportSummary.tsx`: shows added count headline, spend total, breakdown (skipped / excluded / duplicates left out), "Done" button calling `onDone`; all amounts formatted via existing `formatMoney()` / cents helpers
- [X] T037 [US3] Implement `web/components/web/CsvImportFlow.tsx`: phase dispatcher using `useCsvImport()`; `idle` → renders nothing (hook driven externally); `reading` → spinner overlay; `undetected` → supported bank list + Close; `list-view` → `CsvImportList` + optional `CsvRowEditModal` overlay for the currently-edited row; `importing` → progress overlay; `summary` → `CsvImportSummary`; wrap in `next/dynamic` with `{ ssr: false }` so the entire CSV engine is deferred

**Checkpoint**: `cd web && npm test -- --testPathPattern=components/csv` is green — all component render/interaction behaviors verified.

---

## Phase 6: User Story 4 — Entry Point Wiring + Polish (Priority: P2)

**Goal**: The CSV import flow is reachable from both the desktop Transactions header (chip button) and the mobile transactions page (picker modal option). i18n strings are added. PARITY.md is updated.

**Independent Test**: TypeScript compiles clean (`npx tsc --noEmit`); existing Transactions component tests still pass; `CsvImportFlow` renders when the "Import CSV" button is clicked.

### Tests for User Story 4 (write FIRST — must FAIL before implementation)

- [X] T038 [US4] Write test in `web/components/web/__tests__/TransactionsDesktop.test.tsx` (or add to existing test file): assert "Import CSV" chip button renders in the header; assert clicking it triggers file input activation (mock `useCsvImport.loadFile` and verify it's called after file selection)
- [X] T039 [US4] Write test (or extend existing) for `web/app/(app)/transactions/page.tsx`: assert the scan picker modal now has a third option "Import a CSV file"; assert selecting it opens file picker

### Implementation for User Story 4

- [X] T040 [US4] Wire into `web/components/web/TransactionsDesktop.tsx`: add an `"Import CSV"` `ChipIconButton` to the left of the existing scan button; on click, trigger a hidden `<input type="file" accept=".csv,text/csv">` and pass the selected file to `useCsvImport().loadFile()`; render `<CsvImportFlow>` (dynamically imported) when the import session is active
- [X] T041 [US4] Wire into `web/app/(app)/transactions/page.tsx`: add "📊 Import a CSV file" as the third option in the existing scan picker modal; on select, open a hidden file input and pass file to `useCsvImport().loadFile()`; render `<CsvImportFlow>` when active
- [X] T042 [P] [US4] Add i18n strings to the appropriate locale file (find with `grep -r "Import a PDF" web/` to locate the locale file): add keys for `'Import a CSV file'`, `'Import CSV'`, `'We don\'t recognise this bank\'s CSV format yet.'`, `'Supported banks'`, `'{0} transactions found'`, `'{0} payment rows excluded'`, `'{0} likely duplicates excluded'`, `'Add {0}'`, `'Skip this transaction'`, `'Include anyway'`
- [X] T043 [P] [US4] Update `PARITY.md`: find the "CSV import" row (or add one if missing) and change status from "CLI only" to "web + CLI"; update the feature description to note that web uses the same engine as the CLI

**Checkpoint**: `cd web && npx tsc --noEmit && npm test` passes fully — all new and existing tests green.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [X] T044 [P] Run `cd web && npm test` with full coverage report; confirm `web/lib/csv/` coverage ≥ 90% (reducer + models are pure functions — no excuses); confirm `web/scripts/import/profiles/` covers all new profiles
- [X] T045 [P] TypeScript strict check: `cd web && npx tsc --noEmit` — zero errors; check for any lingering `any` types introduced during implementation and replace with proper types
- [X] T046 Run a full end-to-end flow trace (manual or scripted): load Chase fixture CSV → verify `list-view` renders correctly → edit one row's merchant → toggle skip on another row → click "Add N transactions" → verify `summary` shows correct counts

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — all T001–T007 run in parallel immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion; T008–T009 must finish before Phase 3+ imports compile
- **US1 — Bank Profiles (Phase 3)**: Depends on Phase 2 (csv-index.ts exists); T010–T016 (tests) run in parallel; T017–T022 (implementations) run in parallel; T023 (update registry) runs after T017–T022
- **US2 — Session Layer (Phase 4)**: Depends on Phase 2 (csv-index.ts) and Phase 3 (profiles must be in registry for `detectBank` test in T026); T024–T026 (tests) can start once Phase 2 is done; T027–T029 (implementations) follow their tests
- **US3 — UI (Phase 5)**: Depends on Phase 4 (useCsvImport hook must exist); T030–T033 (tests) can start once T029 is done; T034–T037 (implementations) follow their tests
- **US4 — Wiring (Phase 6)**: Depends on Phase 5 (CsvImportFlow must exist); T038–T039 (tests) first, then T040–T043
- **Polish (Final Phase)**: All prior phases complete

### User Story Dependencies

- **US1 (Bank Profiles)**: Unblocked after Foundational — no dependency on US2/US3/US4
- **US2 (Session Layer)**: Unblocked after US1 (needs profiles in registry for integration test)
- **US3 (UI)**: Unblocked after US2 (needs hook)
- **US4 (Wiring)**: Unblocked after US3 (needs CsvImportFlow)

### Within Each Phase

1. Write all tests for the phase → confirm they FAIL (import errors count as FAIL)
2. Implement to make them pass → green
3. Run `npm test` to confirm no regressions before moving to next phase

---

## Parallel Opportunities

### Phase 1 — all parallel
```
T001 fixture dirs | T002 amex fixture | T003 citi fixture | T004 capital-one fixture
T005 bofa fixture | T006 wellsfargo fixture | T007 td-bank-csv fixture
```

### Phase 3 — tests parallel, impls parallel
```
Tests:   T010 amex | T011 citi | T012 capital-one | T013 bofa | T014 wellsfargo | T015 td-bank
Impls:   T017 amex | T018 citi | T019 capital-one | T020 bofa | T021 wellsfargo | T022 td-bank
```

### Phase 6 — polish parallel
```
T042 i18n strings | T043 PARITY.md update
```

---

## Implementation Strategy

### MVP (US1 + US2 only — no UI yet)

1. Complete Phase 1 (Setup)
2. Complete Phase 2 (Foundational — csv-index stub)
3. Complete Phase 3 (US1 — all 7 bank profiles, tests green)
4. Complete Phase 4 (US2 — session reducer + hook, tests green)
5. **STOP and validate**: `npm test` green, TypeScript clean — the engine is complete and could power a CLI or headless import

### Full Delivery

6. Complete Phase 5 (US3 — UI components, tests green)
7. Complete Phase 6 (US4 — wiring into Transactions page, i18n, PARITY.md)
8. Complete Final Phase (coverage + typecheck + E2E trace)

---

## Notes

- TDD is non-negotiable per the project constitution (Principle VI): write the test, confirm it fails, then implement to pass it.
- All bank profiles are pure TypeScript — no IO, no clock. Tests use literal fixture CSV strings loaded from `__tests__/fixtures/`. No mocking of the CSV engine required.
- The `useCsvImport` hook test may need to mock `addTransaction` from the store and `crypto.randomUUID` (or inject a deterministic id factory).
- Wells Fargo's no-header format requires a careful `detect()` — check the positional shape, not a header string. Ensure it doesn't false-positive on other headerless CSVs.
- Santander profile is explicitly out of scope — a comment placeholder in `csv-index.ts` is sufficient.
- Do not modify the existing `PROFILES` export in `web/scripts/import/profiles/index.ts` — the CLI's `make ingest` path uses it for both PDF and CSV profiles. `CSV_PROFILES` is browser-only.
