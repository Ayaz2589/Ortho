---
description: "Task list for Bank-Statement PDF Import CLI"
---

# Tasks: Bank-Statement PDF Import CLI

**Input**: Design documents from `specs/004-bank-statement-import/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: REQUIRED. Constitution Principle VI (NON-NEGOTIABLE) + SC-007 require all money/date/split/reconcile/dedupe logic to be developed test-first and locked by deterministic tests. Test tasks below MUST be written first and observed to fail before their implementation task.

**Organization**: By user story (US1 P1 → US2 P2 → US3 P3). All paths are relative to repo root `/Users/ayazuddin/Development/personal/Ortho`.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: parallelizable (different file, no incomplete dependency)
- **[Story]**: US1 / US2 / US3 (omitted for Setup, Foundational, Polish)

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Add `pdfjs-dist` to `web/package.json` devDependencies and run `cd web && npm install` (legacy build: import from `pdfjs-dist/legacy/build/pdf.mjs` for Node).
- [x] T002 [P] Create the directory tree `web/scripts/import/{engine,profiles,db}/` and `web/test/import/fixtures/` (add an empty `index`/placeholder where needed so the dirs commit).
- [x] T003 [P] Create the root `Makefile` with `ingest` and `ingest-help` targets per `contracts/cli.md` (maps `FILE/BANK/DRY_RUN/YES/ADMIN` → `cd web && npx tsx scripts/import/cli.ts` flags).

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ Blocks all user stories.**

- [x] T004 Create `web/scripts/import/engine/types.ts` defining all shared types/interfaces: `StatementPeriod`, `ParsedSection`, `ParsedTransaction`, `ParsedStatement`, `ReconResult`, `BankProfile`, `RunOptions` — exactly per `data-model.md` and `contracts/bank-profile.md`. Import `TransactionCategory`/`TransactionKind`/`TransactionScope` from `@/lib/types`.

**Checkpoint**: shared types exist — user stories can begin.

---

## Phase 3: User Story 1 - Preview a statement before anything is written (Priority: P1) 🎯 MVP

**Goal**: Detect the bank, parse the TD PDF into transactions, suggest categories, flag non-spending rows, reconcile against printed subtotals, and print a dry-run preview — with **no DB access**.

**Independent Test**: `cd web && npm test` (golden + unit suites pass) and `make ingest FILE="iOS/temp/View PDF Statement_2026-05-25.pdf" DRY_RUN=1` prints detected bank, `Reconciliation: OK`, a preview, and `Dry run — nothing written.`

### Tests for User Story 1 (write first, ensure FAIL) ⚠️

- [x] T005 [P] [US1] Create golden fixture input `web/test/import/fixtures/td-bank-2026-05.txt` = faithful extracted text of the sample statement (generate via the project's `extractText` once built, or the planning PDFKit dump). See `research.md` D13 for the PII note.
- [x] T006 [P] [US1] Author ground-truth `web/test/import/fixtures/td-bank-2026-05.expected.json` (expected `ParsedStatement`: period, sections w/ kind + subtotals, rows w/ dateISO/merchant/amountCents/kind).
- [x] T007 [P] [US1] `web/test/import/money.test.ts` — `parseAmountToCents` ("2,800.00"→280000, "$24,156.88"→2415688, rejects bad input).
- [x] T008 [P] [US1] `web/test/import/dates.test.ts` — `parseStatementPeriod` + `resolveStatementDate` (MM/DD→ISO noon; year inference incl. Dec→Jan period crossing).
- [x] T009 [P] [US1] `web/test/import/categorize.test.ts` — rule hits (UBER EATS→dining, EXXONMOBIL→fuel, NYCT PAYGO→transit, CON ED/VERIZON→utilities, CVS→health) + fallback.
- [x] T010 [P] [US1] `web/test/import/exclusions.test.ts` — AMEX EPAYMENT/APPLECARD/CHASE CREDIT CRD AUTOPAY→cc-payment, Transfer to SV/ML→internal-transfer, WEALTHFRONT→investment; normal rows not excluded.
- [x] T011 [P] [US1] `web/test/import/reconcile.test.ts` — pass when sums match each subtotal; fail with section + expected/computed/Δ when they don't.
- [x] T012 [P] [US1] `web/test/import/detectBank.test.ts` — TD text→`td`; unknown→none (exit 2); ambiguous→error; `--bank` override forces profile.
- [x] T013 [US1] `web/test/import/td-bank.golden.test.ts` — `tdBank.parse(fixturePages)` deep-equals `expected.json` AND `reconcile(result).ok === true` (depends on fixtures T005/T006).

### Implementation for User Story 1

- [x] T014 [P] [US1] `web/scripts/import/engine/money.ts` — `parseAmountToCents`.
- [x] T015 [P] [US1] `web/scripts/import/engine/dates.ts` — `parseStatementPeriod`, `resolveStatementDate` (noon-local ISO).
- [x] T016 [P] [US1] `web/scripts/import/engine/categorize.ts` — ordered merchant→category rules + fallback (research.md D7).
- [x] T017 [P] [US1] `web/scripts/import/engine/exclusions.ts` — exclusion classifier returning `{excluded, reason}` (D8).
- [x] T018 [P] [US1] `web/scripts/import/engine/reconcile.ts` — `reconcile(sections) → ReconResult`.
- [x] T019 [US1] `web/scripts/import/engine/extractText.ts` — pdfjs-dist (legacy/Node) → `string[]` per page.
- [x] T020 [US1] `web/scripts/import/profiles/td-bank.ts` — `detect` + `parse` (period, section boundaries incl. `(continued)` merge, MM/DD row grouping with wrapped/own-line amounts, `Checks Paid` serial form, merchant cleanup, subtotal capture). Uses T014/T015. **The core parser.**
- [x] T021 [US1] `web/scripts/import/profiles/index.ts` (registry) + `web/scripts/import/engine/detectBank.ts` (run detects; override / no-match / ambiguous).
- [x] T022 [US1] `web/scripts/import/cli.ts` — arg parse (`--file/--bank/--dry-run/--yes/--admin`), orchestrate extract→detect→parse→categorize→exclusions→reconcile, render preview via `formatMoney` from `@/lib/finance/money`, hard-block + exit 4 on recon fail, exit codes 1/2/3, end dry-run with `Dry run — nothing written.`
- [x] T023 [US1] Run `cd web && npm test` (US1 suites green) and `make ingest FILE="iOS/temp/View PDF Statement_2026-05-25.pdf" DRY_RUN=1` (reconciles OK). Fix until green.

**Checkpoint**: parsing + reconciliation + dry-run preview fully working offline. **MVP deliverable.**

---

## Phase 4: User Story 2 - Import a statement as my own transactions (Priority: P2)

**Goal**: Persist included, non-duplicate rows as personal transactions owned by the account holder; idempotent re-runs; explicit confirm.

**Independent Test**: Import the sample → expected personal transactions exist with correct fields; re-run → `imported 0 · skipped(duplicate) N`.

### Tests for User Story 2 (write first, ensure FAIL) ⚠️

- [x] T024 [P] [US2] `web/test/import/dedupe.test.ts` — dedupe key (`created_by|YYYY-MM-DD|amountCents|normMerchant`) + filtering against an existing-rows fixture (mocked).
- [x] T025 [P] [US2] `web/test/import/toTransaction.test.ts` — single-owner `ParsedTransaction`→`Transaction` yields `scope='personal'`, `household_id=null`, `splits=null`, correct `txRecord` field set.
- [x] T026 [P] [US2] `web/test/import/persist.test.ts` — with a mocked supabase client, asserts `transactions` insert payload equals the `txRecord` shape and no `transaction_shares` write for personal scope.

### Implementation for User Story 2

- [x] T027 [P] [US2] `web/scripts/import/engine/dedupe.ts` — key builder + `filterDuplicates(parsed, existing)`.
- [x] T028 [P] [US2] `web/scripts/import/engine/toTransaction.ts` — personal mapping (mirrors `txRecord`; id via `crypto.randomUUID`).
- [x] T029 [US2] `web/scripts/import/db/client.ts` — `@supabase/supabase-js` client in sign-in (`signInWithPassword`) and `--admin` (service-role) modes; minimal `.env.local` reader.
- [x] T030 [US2] `web/scripts/import/db/lookups.ts` — `listUsers()`, resolve account-holder→user id (interactive picker), `fetchExistingForDedupe(userId)`.
- [x] T031 [US2] `web/scripts/import/db/persist.ts` — insert `transactions` (txRecord shape); return summary counts; surface DB errors (exit 5).
- [x] T032 [US2] `web/scripts/import/cli.ts` — add interactive review (accept / `c` category / `x` exclude), dedupe step, final `Import N? [y/N]` confirm, persist included non-dup rows, print `Summary:` line; `YES=1` accepts defaults.
- [~] T033 [US2] Verify: import sample (rows visible in app), re-run → zero new (idempotency, SC-003). Logic verified by unit tests (dedupe/persist/toTransaction); LIVE DB import pending operator credentials (quickstart steps 4–5).

**Checkpoint**: single-owner import is end-to-end and idempotent.

---

## Phase 5: User Story 3 - Assign owners and split across people (Priority: P3)

**Goal**: Reassign owner, or assign multiple owners → shared transaction with even/custom split; graceful degrade with no 2-member household.

**Independent Test**: Assign a tx to two people 70/30 → shared tx with shares 70/30 read back identically; even split with no custom %; no household → "unavailable" + single-owner continues.

### Tests for User Story 3 (write first, ensure FAIL) ⚠️

- [x] T034 [P] [US3] `web/test/import/split.test.ts` — `evenSplit` via `effectiveSplits` parity; `validateCustomSplit` accepts sum=100, rejects otherwise, keys must equal ownerIds.
- [x] T035 [P] [US3] Extend `web/test/import/toTransaction.test.ts` — multi-owner mapping → `scope='shared'`, `household_id` set, `transaction_shares` rows from `effectiveSplits`.

### Implementation for User Story 3

- [x] T036 [P] [US3] `web/scripts/import/engine/split.ts` — `evenSplit(ownerIds)` (reuse `@/lib/format` `effectiveSplits`) + `validateCustomSplit(input, ownerIds)`.
- [x] T037 [US3] `web/scripts/import/db/lookups.ts` — add `resolveHousehold(userId)` + `eligibleCoOwners()`; return "unavailable" signal when no ≥2-member household (FR-020).
- [x] T038 [US3] `web/scripts/import/db/persist.ts` — write `transaction_shares` for shared scope (mirror `writeShares`: delete-then-insert, percent from `effectiveSplits`).
- [x] T039 [US3] `web/scripts/import/engine/toTransaction.ts` — multi-owner → shared scope + `household_id` + `owner_ids` + `splits`.
- [x] T040 [US3] `web/scripts/import/cli.ts` — review actions `o` (reassign/add owners) and `s` (split: default even, custom % with re-prompt on ≠100); show unavailable message and proceed single-owner when degraded.
- [~] T041 [US3] Verify: 70/30 split persists shares; even split persists; no-household path degrades gracefully. Split math + shared mapping + share-row shape verified by unit tests; LIVE persistence pending operator credentials + a 2-member household (quickstart step 6).

**Checkpoint**: full ownership/splitting works; all three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting

- [x] T042 [P] Write `web/scripts/import/README.md` — usage, env vars, exit codes, adding a new bank profile.
- [ ] T043 (DEFERRED) Retire the superseded iOS one-shot importer: remove `iOS/Ortho-iOS/Services/TDBankMay2026Importer.swift` and its Settings→Developer trigger (verify iOS still builds). Left in place for now — it is `#if DEBUG`-only and harmless; removing it touches SwiftUI (`SettingsView.swift`) and needs an iOS rebuild to verify. Safe follow-up.
- [~] T044 Run the `quickstart.md` validation. Done offline: step 1 (`npm test` green, 261 tests under Node ≥20.19), step 2 (real-PDF dry-run reconciles 7/7), step 3 (reconciliation-failure blocks — `reconcile.test.ts`), step 7 (unknown-bank refused — `detectBank.test.ts`). Pending operator credentials: steps 4–6 (live import / idempotency / split).
- [x] T045 [P] Add a short "Importing bank statements" note to the root `README.md`.

---

## Dependencies & Execution Order

- **Setup (T001–T003)** → no deps.
- **Foundational (T004)** → after Setup; blocks all stories.
- **US1 (T005–T023)** → after T004. Fixtures (T005/T006) gate the golden test (T013). Pure-util impls (T014–T018) gate the profile (T020) and CLI (T022).
- **US2 (T024–T033)** → after US1 (needs `ParsedStatement` + CLI shell). Independently testable.
- **US3 (T034–T041)** → after US2 (extends persist/lookups/toTransaction/cli). Independently testable.
- **Polish (T042–T045)** → after the stories it documents/retires.

### Within each story
- Tests first and FAILING → then implementation (Principle VI).
- Pure leaves (money, dates, categorize, exclusions, reconcile, split, dedupe, toTransaction) before the modules that compose them (profile, cli, persist).

### Parallel opportunities
- Setup: T002, T003 in parallel.
- US1 tests T007–T012 in parallel; impls T014–T018 in parallel (distinct files), then T019→T020→T021→T022 sequential (shared/dependent).
- US2 tests T024–T026 parallel; impls T027/T028 parallel, then T029→T030→T031→T032.
- US3 tests T034/T035 parallel; T036 parallel, then T037/T038/T039→T040.

## Parallel Example: User Story 1 tests
```
Task: money.test.ts (T007)      Task: dates.test.ts (T008)
Task: categorize.test.ts (T009) Task: exclusions.test.ts (T010)
Task: reconcile.test.ts (T011)  Task: detectBank.test.ts (T012)
```

## Implementation Strategy
- **MVP = Phases 1–3 (US1)**: a trustworthy, reconciling, dry-run preview of the TD statement. Stop and validate against the real PDF.
- **Increment 2 (US2)**: turn the preview into idempotent personal imports.
- **Increment 3 (US3)**: ownership + splitting.
- Commit after each task or logical group; never write to the DB until reconciliation passes and the operator confirms.

## Notes
- `[P]` = different files, no incomplete dependency.
- Reuse, don't re-implement: `@/lib/types` (`Transaction`), `@/lib/format` (`effectiveSplits`), `@/lib/finance/money` (`formatMoney`); persistence mirrors `web/lib/store.tsx` `txRecord`/`writeShares`.
- Total: 45 tasks (US1: 19, US2: 10, US3: 8, Setup/Foundational/Polish: 8).
