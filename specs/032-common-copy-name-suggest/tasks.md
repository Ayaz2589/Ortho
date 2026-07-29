# Tasks: Most-common copy + merchant name suggestions

**Feature**: `specs/032-common-copy-name-suggest/` · **Branch**: `feat/032-common-copy-name-suggest`

**Approach**: Test-Driven (Principle VI, NON-NEGOTIABLE). Every behavior gets a failing
test first, then the implementation that satisfies it. All work is in `web/`.

**Conventions**: Vitest + @testing-library/react (jsdom via `web/test/setup.ts`). Reuse
existing test helpers under `web/test/helpers/` for building `Transaction` fixtures; add a
local factory only if none fits. Styling = existing tokens/`ow-*` classes only.

---

## Phase 1: Setup

- [x] T001 Locate the existing `Transaction` test-fixture helper(s) under `web/test/helpers/` (e.g. a `makeTransaction`/seed factory) and note the import path to reuse across the three new suites; if none exists, plan a minimal local `makeTx(partial)` factory inside the test files. No production code in this phase.

---

## Phase 2: Foundational (pure logic — BLOCKS User Story 1 and User Story 2)

> The pure module is imported by both stories, so it lands first. Test-first.

- [x] T002 Write FAILING unit tests in `web/test/lib/txSuggest.test.ts` covering Contract A from `contracts/ui-behavior.md`: `mostCommonTransactions` (freq-desc ordering, one representative most-recent entry per normalized merchant, transfers/blank excluded, deterministic tie-break by most-recent date, empty→[], cap at 40) and `knownNamesForKind` (kind filtering expense vs income, freq order, blanks excluded, empty→[]).
- [x] T003 Implement `web/lib/txSuggest.ts` to pass T002 — export `mostCommonTransactions(transactions, limit = 40)` and `knownNamesForKind(transactions, kind)`, reusing `rankedMerchants` / `normalizeMerchant` from `web/lib/csv/merchantSuggest.ts` (do NOT duplicate matching logic). Run `npx vitest run test/lib/txSuggest.test.ts` → green.

**Checkpoint**: `web/lib/txSuggest.ts` is fully unit-tested and green before any UI work.

---

## Phase 3: User Story 1 — Copy from most common (Priority: P1) 🎯 MVP

**Goal**: The New-form copy shortcut lists the household's most-frequent merchants
(one representative entry each), is relabeled "Copy from most common", and prefills as before.

**Independent test**: With "Whole Foods" ×5 and a more-recent one-off "Airport Parking",
open the New form → copy shortcut → "Whole Foods" is above "Airport Parking"; picking it
prefills a real Whole Foods entry with today's date.

- [x] T004 [US1] Write FAILING component test `web/test/web/tx-copy-most-common.test.tsx` (Contract B): opening the copy sub-view on the New form lists rows most-common-first (not date-first); the button + sub-view title read "Copy from most common"; picking a row calls `form.loadFrom` with the representative tx; empty ledger shows "Nothing to copy yet" without error.
- [x] T005 [US1] In `web/components/web/TxForm.tsx`, change `TxCopyList` to rank via `mostCommonTransactions(transactions)` instead of `sort-by-date.slice(0,40)`, and relabel `CopyFromRecentButton` + the sub-view title from "Copy from recent" to "Copy from most common". Keep the pick→`loadFrom`→today-date behavior unchanged (FR-003). Run T004 → green.
- [x] T006 [P] [US1] Add the `"Copy from most common"` key to each locale catalog `web/lib/i18n/{bn,es,ja,ko,zh}.ts` (alongside the existing `"Copy from recent"` entry; leave the old key in place so nothing else breaks). "Nothing to copy yet" is unchanged.
- [x] T007 [US1] Verify the full-page surface `web/components/web/TxFormPageClient.tsx` renders the relabeled/re-ranked copy affordance identically (it shares `TxCopyList`); wire/adjust any copy label it owns so mobile modal and desktop page match (FR-005). Extend T004 with a page-surface assertion if the page owns distinct copy chrome.

**Checkpoint**: US1 independently testable and green on both surfaces.

---

## Phase 4: User Story 2 — Merchant name suggestions (Priority: P2)

**Goal**: The add/edit form's merchant/payer input offers kind-aware as-you-type
suggestions from the household's own names, on Add and Edit, expense and income, while
free-form entry still works.

**Independent test**: Add form (expense) with a known "Whole Foods" → typing surfaces it
from the datalist; switch to Income → suggestions come from income payers, not expense
merchants; typing a new name still saves.

- [x] T008 [US2] Write FAILING component test `web/test/web/tx-merchant-suggest.test.tsx` (Contract C): on Add (expense) the merchant input is associated with a `<datalist>` (`list=` matches its `id`) containing known expense merchants; on Edit the same association holds; when kind=income the options are income payers and exclude expense merchants; typing a brand-new name leaves the field free-form and `canSave` true.
- [x] T009 [US2] In `web/components/web/TxForm.tsx` `TxFormFields`, attach a kind-aware `<datalist>` to the merchant `<input>` (~line 564): compute `knownNamesForKind(transactions, isIncome ? 'income' : 'expense')` in a `useMemo`, render a `<datalist id="tx-merchant-suggestions">` of `<option>`s, and set `list="tx-merchant-suggestions"` + `autoComplete="off"` on the input (mirroring `CsvRowEditModal`). Do NOT touch the transfer/reimbursement branch. Run T008 → green.

**Checkpoint**: US2 independently testable and green.

---

## Phase 5: Polish & Cross-Cutting

- [x] T010 [P] Update `docs/web.md` (transaction-form section) to note the "Copy from most common" ranking and the kind-aware merchant name suggestions, referencing `web/lib/txSuggest.ts`. Keep it brief.
- [x] T011 Run the full gate from `web/`: `npx tsc --noEmit` (types clean) and `npm test` (whole suite green — the money golden-vector and split suites MUST be unchanged and passing, per FR-012/SC-004).
- [ ] T012 [P] Manual smoke per `quickstart.md` — **DEFERRED**: no browser display in this run. Behavior is covered by the RTL suites (`tx-copy-most-common.test.tsx`, `tx-merchant-suggest.test.tsx`) + `txSuggest.test.ts`. Left for the reviewer / a display-capable session.

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational, T002→T003)** must finish before any story.
- **US1 (Phase 3)** and **US2 (Phase 4)** both depend only on Phase 2; they touch the same
  file (`TxForm.tsx`) in different regions, so run them **sequentially** to avoid edit
  churn (US1 then US2). Each is independently testable/deliverable once Phase 2 is green.
- **Phase 5 (Polish)** last.

### Within-story parallel opportunities

- T006 (i18n catalogs) is `[P]` — independent of the `TxForm.tsx` edit in T005.
- T010 (docs) and T012 (manual smoke) are `[P]`.
- T002/T003 are strictly sequential (test → implement). T004→T005 and T008→T009 likewise.

## Implementation Strategy

- **MVP = Phase 1 + Phase 2 + Phase 3 (US1)** — delivers the primary behavior change the
  user asked for (copy from most common), fully tested, on both surfaces.
- **Increment 2 = Phase 4 (US2)** — additive name suggestions.
- **Finalize = Phase 5** — docs + full green gate before `/review` and `/create-pr`.

## Format validation

All tasks use `- [ ] Txxx [P?] [US?] description + file path`. Setup/Foundational/Polish
carry no story label; US1/US2 tasks carry `[US1]`/`[US2]`.
