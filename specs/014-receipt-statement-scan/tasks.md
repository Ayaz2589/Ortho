# Tasks: Receipt & Statement Scanning

**Input**: Design documents from `/specs/014-receipt-statement-scan/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED — constitution Principle VI (test-first) is non-negotiable; the parser
is pure and fixture-locked. **iOS tests cannot run in this Linux sandbox**: "write failing
tests first" means test code + fixtures are authored and committed before the
implementation they lock, and the whole batch is verified in the single CI push (Phase 7),
mirroring the spec-013 batch discipline.

**Organization**: By user story, US1→US4 sequential (the pipeline builds up), with [P]
parallelism inside phases. One iOS push at the end — don't push per-task.

## Format: `[ID] [P?] [Story?] Description with file path`

## Path Conventions

Per plan.md: pure logic in `iOS/Ortho-iOS/Services/Scan/`, UI in
`iOS/Ortho-iOS/Features/Transactions/Scan/`, fixtures in
`iOS/Ortho-iOS/Resources/ScanFixtures/`, tests in `iOS/Ortho-iOSTests/`. The Xcode
project is filesystem-synchronized — new Swift/resource files need NO pbxproj edits.

**Sequential-file constraints** (never [P] against each other):
`AddTransactionSheet.swift` (T011→T019→T025→T026), `Localizable.xcstrings`
(T012→T021→T027→T028), `ScanHeuristics.swift` (T008→T016), `ScanSession.swift`
(T010→T020), `Ortho_iOSApp.swift` (T029), `ScanParserTests.swift` (T006→T014→T022).

---

## Phase 1: Setup

**Purpose**: Baselines, fixture tooling, and the draft PR that carries the work.

- [X] T001 Baseline: `cd web && npm install && npx tsc --noEmit && npm test` all green
      (record count); confirm branch `014-receipt-statement-scan`; skim
      `docs/ios.md` §demo-mode + `web/scripts/import/engine/{dates,dedupe,categorize,exclusions}.ts`
      (the conventions being ported)
- [X] T002 Commit the spec-kit artifacts (spec.md, plan.md, research.md, data-model.md,
      contracts/, quickstart.md, checklists/, CLAUDE.md pointer) as
      `spec(014): receipt & statement scanning — spec, plan, contracts, tasks`; push and
      open a **draft PR** `014: receipt & statement scanning` against `main` (note in the
      body it's stacked on the open 013 PR until that merges)
- [X] T003 Build the synthetic fixture set per contracts/scan-parser.md §Fixture format:
      generate (script of choice, e.g. Python Pillow/reportlab — throwaway, not committed)
      `receipt-grocery.png`, `receipt-restaurant.png`, `receipt-eur.png`,
      `receipt-duplicate.png`, `statement-card.pdf` (2 pages, text layer, ≥12 rows incl. 1
      credit, 1 `PAYMENT THANK YOU` row, 2 rows matching `context.existing`),
      `statement-scanned.png`, `unreadable.png` — commit binaries into
      `iOS/Ortho-iOS/Resources/ScanFixtures/` (synthetic data only; no real merchants'
      real transactions)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared types every story consumes.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Create `iOS/Ortho-iOS/Services/Scan/ScanModels.swift` — `ScanDocumentText`
      (pages/lines/tables + normalized frames), `ParsedCandidate`, `GuessedField`,
      `ScanParseResult`, `ScanContext` (existingTransactions, people, defaultCurrency,
      injected referenceDate) exactly per data-model.md; header comment naming the
      contract file
- [X] T005 Write the `*.expected.json` files for every T003 fixture in
      `iOS/Ortho-iOS/Resources/ScanFixtures/` per the contracts/scan-parser.md schema —
      these are the assertions of record; hand-computed values, authored BEFORE any
      parser code exists

**Checkpoint**: types + fixture truth exist — story implementation can begin.

---

## Phase 3: User Story 1 - Scan a receipt into the add form (Priority: P1) 🎯 MVP

**Goal**: Scan capsule → camera/library/file → on-device parse → the open add form
prefills merchant/date/total in place; calm failure state; nothing saves without Add.

**Independent Test**: `ScanParserTests` receipt cases green on CI; `-uiDemoScan
receipt-grocery` screenshot shows the prefilled form (wired fully in US4, stub here).

### Tests for User Story 1 (write first — they must fail without the implementation)

- [X] T006 [US1] Create `iOS/Ortho-iOSTests/ScanParserTests.swift`: fixture loader
      reading `ScanFixtures` + expected JSON from the APP bundle (research R9 — no
      pbxproj), decode helpers, and receipt test cases: `receipt-grocery`,
      `receipt-restaurant` (labeled TOTAL beats row-count — R5 tie-break),
      `unreadable` → `.none`; refiner NEVER invoked (contract §determinism)

### Implementation for User Story 1

- [X] T007 [P] [US1] Create `iOS/Ortho-iOS/Services/Scan/ScanTextExtractor.swift` —
      image → `ScanDocumentText` via `RecognizeDocumentsRequest` (tables + lines +
      frames), fallback `RecognizeTextRequest` Y-clustering; async, off-main; capture
      data released after extraction (FR-003); no parsing decisions (contract §stages)
- [X] T008 [P] [US1] Create `iOS/Ortho-iOS/Services/Scan/ScanHeuristics.swift` (receipt
      half): amount-token → cents (no FP dollar math, FR-023), date formats → 
      `DateComponents`, grand-total detection (TOTAL/AMOUNT DUE/bottom-emphasized per
      R5), merchant-line pick + processor-prefix normalizer (`TST*`, `SQ *`, digits) —
      pure, `en_US_POSIX`-invariant
- [X] T009 [US1] Create `iOS/Ortho-iOS/Services/Scan/ScanParser.swift` — detection
      order R5 (≥3 rows / confident total / 1–2 rows / none), receipt path emitting one
      `ParsedCandidate` (amount>0 enforced); statement path returns rows parsed so far
      (fleshed out in US2); deterministic per contract
- [X] T010 [US1] Create `iOS/Ortho-iOS/Features/Transactions/Scan/ScanCaptureView.swift`
      + `ScanSession.swift` — source menu plumbing (`VNDocumentCameraViewController`
      representable, `PhotosPicker`, `.fileImporter`), phases
      idle→capturing→parsing→receiptPrefilled|failed (interstitial arm stubbed), Retake
      reopens last source, cancel restores untouched form, all capture data released on
      idle (data-model §transitions)
- [X] T011 [US1] Modify `iOS/Ortho-iOS/Features/Transactions/AddTransactionSheet.swift` —
      Scan capsule (add-mode, non-transfer only, `doc.viewfinder`, capsule style) next to
      "Copy from recent"; "Reading…" inline state; `ScanPrefill` application (4th prefill
      source alongside SettleUpPrefill/copy — same validation, FR-006); "Filled from
      scan" caption; quiet failure block + Retake (contract scan-ui-flow §Entry/§Receipt/§Failure)
- [X] T012 [US1] Add US1 string keys (`scan.capsule`, `scan.source.*`, `scan.reading`,
      `scan.filled_caption`, `scan.failed.*`) to `iOS/Ortho-iOS/Localizable.xcstrings`
      with en/bn/es/ja/zh-Hans/ko values (terminology consistent with existing catalog)
- [X] T013 [US1] Add `INFOPLIST_KEY_NSCameraUsageDescription` build setting to
      `iOS/Ortho-iOS.xcodeproj/project.pbxproj` (all configurations; plain-text edit —
      the ONLY pbxproj change in the feature)

**Checkpoint**: receipt scan complete in code; verification rides Phase 7.

---

## Phase 4: User Story 2 - Statement review wizard (Priority: P2)

**Goal**: PDF/photo statement → interstitial (counts + skip-duplicates toggle) →
sequential wizard on the existing form → per-row optimistic saves → summary.

**Independent Test**: `statement-card` / `statement-scanned` fixture cases green;
wizard walk adds exactly the accepted rows.

### Tests for User Story 2 (write first)

- [X] T014 [US2] Extend `iOS/Ortho-iOSTests/ScanParserTests.swift`: `statement-card`
      (multi-page order, credits→income, `PAYMENT THANK YOU` → `isPaymentRow`,
      duplicate rows claimed greedily one-to-one vs `context.existing`, within-batch
      twins both kept), `statement-scanned` (OCR-table path), noon-UTC/year-inference
      date cases (period-relative, FR-019)

### Implementation for User Story 2

- [X] T015 [P] [US2] Extend `iOS/Ortho-iOS/Services/Scan/ScanTextExtractor.swift` — PDF
      branch: PDFKit text-layer first, render(2×)+OCR only for layerless pages,
      per-page sequential processing, pages concatenated in order (R3, R12)
- [X] T016 [US2] Extend `iOS/Ortho-iOS/Services/Scan/ScanHeuristics.swift` — statement
      half, porting `web/scripts/import/engine` conventions (R6): row parse from tables
      + line fallback, MM/DD + statement-period → year inference (dates.ts algorithm),
      credit/debit direction, payment/exclusion regex table (exclusions.ts +
      `PAYMENT THANK YOU`/`AUTOPAY`), duplicate key (calendar-day, amountCents) greedy
      matcher (FR-015 — key divergence from CLI documented in R6)
- [X] T017 [US2] Complete the statement arm of
      `iOS/Ortho-iOS/Services/Scan/ScanParser.swift` — ordered candidates, ≥1-row
      statement outcome (R5 rule 3), dedup + payment flags applied via T016
- [X] T018 [P] [US2] Create
      `iOS/Ortho-iOS/Features/Transactions/Scan/StatementInterstitialView.swift` and
      `ScanSummaryView.swift` per contracts/scan-ui-flow.md §Interstitial/§Summary
      (counts plural-aware, toggle default ON, Cancel discards session; summary Done
      dismisses + releases)
- [X] T019 [US2] Wizard chrome in
      `iOS/Ortho-iOS/Features/Transactions/AddTransactionSheet.swift`: progress header
      `{i} of {n}`, `Add and next`/`Add and finish` (exactly one
      `appState.addTransaction` per accept, FR-009), `Skip`, toolbar `Stop`; server
      failure keeps the wizard on the failed row behind the standard rollback alert
- [X] T020 [US2] Complete the `ScanSession` state machine in
      `iOS/Ortho-iOS/Features/Transactions/Scan/ScanSession.swift`:
      interstitial→reviewing(cursor)→summary, dispositions, pre-skip of payment rows +
      (toggle-conditional) duplicates, counts; invariants per data-model.md
- [X] T021 [US2] Add US2 keys (`scan.interstitial.*`, `scan.wizard.*`,
      `scan.summary.*`) to `iOS/Ortho-iOS/Localizable.xcstrings` ×6 with plural
      variants; বাংলা Latin digits ride the existing locale

**Checkpoint**: full statement flow in code.

---

## Phase 5: User Story 3 - Smart, editable guesses (Priority: P3)

**Goal**: history-first category + owners/split guesses, FX detection, receipt
duplicate line, text3 "guessed" affordances that clear on touch.

**Independent Test**: `receipt-eur` (originalAmount + currency) and history-seeded
category/split cases green; `receipt-duplicate` shows the inline line.

### Tests for User Story 3 (write first)

- [X] T022 [US3] Extend `iOS/Ortho-iOSTests/ScanParserTests.swift`: `receipt-eur`
      (FR-014 — original amount, never foreign-as-USD), `receipt-duplicate`
      (`duplicateOf` claimed, FR-015), history-tier cases from fixture `context.history`
      (dominant category, ties→most recent; owners/split from most recent match; CLI
      rule table as tier 2; NO 'entertainment' fallback — form default when silent,
      FR-013/R7), `guesses` set contents exact

### Implementation for User Story 3

- [X] T023 [P] [US3] Create `iOS/Ortho-iOS/Services/Scan/ScanInference.swift` —
      merchant normalizer reuse, history matcher (frequency → recency), owners/split
      guess from most recent match, categorize rule table ported from
      `web/scripts/import/engine/categorize.ts` (tier 2), duplicate matcher hookup;
      pure, context-injected
- [X] T024 [P] [US3] Create `iOS/Ortho-iOS/Services/Scan/ScanRefiner.swift` —
      `SystemLanguageModel` availability gate, `@Generable` merchant-cleanup +
      category-when-silent constrained to `TransactionCategory`, ~2 s timeout,
      input-unchanged on any failure (R4); disabled under `-uiDemoScan` and in tests
- [X] T025 [US3] Guessed affordances in
      `iOS/Ortho-iOS/Features/Transactions/AddTransactionSheet.swift`: text3 `Guessed`
      label beside guessed fields' labels, cleared permanently per field on first edit
      (FR-016); VoiceOver "guessed value" labels (contract §Accessibility)
- [X] T026 [US3] Receipt duplicate caption above Add in
      `iOS/Ortho-iOS/Features/Transactions/AddTransactionSheet.swift` —
      `scan.duplicate_line` with merchant + localized date, informational only; FX
      prefill path: candidate `currency != .usd` seeds the existing original-amount
      field via existing `Money` conversion (FR-014)
- [X] T027 [US3] Add US3 keys (`scan.guessed`, `scan.duplicate_line`) to
      `iOS/Ortho-iOS/Localizable.xcstrings` ×6

**Checkpoint**: all in-app behavior complete.

---

## Phase 6: User Story 4 - Verifiable without a camera (Priority: P3)

**Goal**: `-uiDemoScan` fixtures through the real pipeline; CI screenshot matrix;
catalog parity across all six languages including the web-side shared keys.

**Independent Test**: local `cd web && npm test` green (catalog parity); CI artifact
contains the scan shots per contracts/uidemo-scan.md.

### Implementation for User Story 4

- [X] T028 [US4] Web catalog parity: add the shared-key translations to
      `web/lib/i18n/*.ts` byte-identically where the catalog-parity contract requires,
      and extend `web/test/i18n/catalog-parity.test.ts` allowlists for iOS-only
      `scan.*` keys as designed in spec 013; then `cd web && npx tsc --noEmit && npm
      test` — ALL green locally (US4 #4). This is the only web change permitted
- [X] T029 [US4] `-uiDemoScan <fixture>` + `-uiDemoScanStep
      <interstitial|row|summary>` in `iOS/Ortho-iOS/Ortho_iOSApp.swift` (+
      `RootTabView`/`TransactionsView` presentation glue as needed): implies `-uiDemo`,
      injected referenceDate, real pipeline, refiner off, unknown fixture ⇒
      assertionFailure, `#if DEBUG` throughout (contracts/uidemo-scan.md)
- [X] T030 [US4] Extend `.github/workflows/ios-ci.yml` screenshot matrix:
      `<lang>-scan-receipt.png` ×6 (`receipt-duplicate` fixture),
      `en|bn|ja-scan-{interstitial,row,summary}.png` (`statement-card` +
      `-uiDemoScanStep`), artifact naming per contract

**Checkpoint**: everything authored; local web gate green.

---

## Phase 7: iOS batch push & CI verification 🔁 (verifies US1–US4)

**Purpose**: the ONE push carrying all iOS work, then the CI loop (013 discipline).

- [X] T031 Pre-push review: `git status`/`git diff` over `iOS/**`,
      `.github/workflows/ios-ci.yml`, `web/**` — exactly the staged work, fixtures
      present, no stray files, no golden-vector diffs (SC-007); logical commits per
      story are fine, **one push**
- [X] T032 `GH_TOKEN=placeholder gh run watch --exit-status`; on red:
      `gh run view --log-failed`, fix, re-push (fix-up pushes only) until **GREEN** —
      build + ScanParserTests + all 7 existing parity suites
- [X] T033 Download `simulator-screenshots`
      (`gh api repos/Ayaz2589/Ortho/actions/runs/<run>/artifacts` →
      `.../artifacts/<id>/zip`); walk quickstart.md §3 checklist (translated, no
      overflow/tofu, Latin digits in বাংলা, guessed markers + duplicate line visible,
      wizard chrome correct); fix + re-push if not (SC-006)

**Checkpoint**: CI green with visual evidence — US1/US2/US3/US4 verified to CI's limit.

---

## Phase 8: Polish & Cross-Cutting

- [X] T034 [P] PARITY.md: 014 note — scan = deliberate iOS-only input method (web
      equivalent: CLI ingest), ported-convention table incl. the duplicate-key
      divergence (R6), Reimbursement-never-pickable reaffirmed (FR-022)
- [X] T035 [P] Docs refresh: `docs/ios.md` (Services/Scan pipeline, fixtures,
      `-uiDemoScan`, screenshot matrix), `docs/index.md` if the cross-cutting list
      needs the scan divergence, `CI-SETUP.local.md` (new screenshot names)
- [X] T036 Final gates: `cd web && npx tsc --noEmit && npm test` green; latest CI run
      green; walk quickstart.md confirming every US validation satisfied or explicitly
      operator-pending; then mark the draft PR **ready for review** with story summary,
      screenshot links, and the operator-pending list
- [ ] T037 **[OPERATOR-PENDING]** Live checks on the Mac per quickstart.md §4 (camera/
      Photos/Files sources, permission-denial path, airplane-mode parse, SC-003 timing,
      Foundation-Models refinement on device) — report results; out of sandbox scope

## Phase 9: Post-T037 device-feedback fixes (2026-07-03)

T037's first pass found every real-world capture failing ("Couldn't read this"):
web-banking screenshots have no TOTAL label and month-name dates; one garbled
total line sank real receipt photos. Diagnosis: the decision layer was too
strict, and Foundation Models only ever ran AFTER a successful parse. Three
fixes agreed with the operator ("add all three"):

- [X] T038 Forgiving fallback tier: month-name statement rows + full dates in
      `ScanHeuristics`; `strongestAmount` (currency-marked preferred, else largest);
      `ScanParser` tier 4 best-effort receipt with merchant/amount/date all Guessed
      (`GuessedField` gains `.amount`/`.date`; hero + date row show/clear the tags).
      Locked by fixtures `statement-screenshot.png` + `receipt-no-total.png`
      (+ expected JSON, unit tests, and a `fallback` CI screenshot)
- [X] T039 Foundation-Models extraction rescue: `ScanRefiner.rescue` (@Generable
      `ExtractedTransaction`, ≤5 s, amounts/dates re-parsed through the heuristics)
      consulted by `ScanSession` via an injected rescue closure ONLY when parse
      returned `.none` on a text-bearing capture — nil in fixtures/`-uiDemoScan`,
      so the determinism contract is untouched
- [X] T040 Device diagnostics: session retains the extracted `ScanDocumentText`
      (in-memory, FR-003); DEBUG-only "What the scan read" disclosure on the
      failure state + os_log (category `scan`) — the phone becomes the debugger,
      and failing captures become fixtures
- [ ] T041 **[OPERATOR-PENDING]** Re-run the T037 checklist on device with the
      fixes in place (the original failing captures should now prefill), then the
      remaining items: permission-denial, airplane mode, SC-003 timing

T041's first device pass: single items prefill correctly, but a PHOTO of a
banking-app transaction list collapsed into one receipt (a "Total…" label wins
tier 2, or the fallback picks one amount) — app lists stack each transaction
over 2–3 OCR lines, so the one-line row regex never fires. And the document
camera auto-snapped before the shot was lined up. Two more fixes:

- [X] T042 Stacked app-list rows: `ScanHeuristics.bareDate` + `stackedRows`
      (amount anchors ↔ bare-date lines, direction-aware nearest-first matching,
      "Total balance" headers lose every claim) as detection tier 2, BEFORE the
      grand-total tier; plus the description-first one-line variant
      ("UBER TRIP  Jul 1  $24.51") for structured-table cell joins. Locked by
      `statement-app-list.png` (with a Total-balance trap) + unit tests
- [X] T043 Text-gated camera: `ScanCameraView` (custom AVFoundation) replaces
      the document camera — shutter disabled until live fast-OCR sees readable
      text in consecutive frames, auto-capture only after ~2.5 s of sustained
      readability, document deskew retained via segmentation + perspective
      correction; permission-denied and no-camera states handled in-view
      (6 new catalog keys ×6 languages). Trade-off: single capture per session
      (multi-page statements ride the PDF/file source) — research R1 revised
- [ ] T044 **[OPERATOR-PENDING]** Device pass on the two fixes: photograph a
      banking-app list (expect the wizard with one row per transaction) and
      confirm the camera waits for a lined-up shot with the capture button
      enabling only when text is readable

---

## Authoring notes (implementation)

- The Services pipeline files (extractor/heuristics/parser/inference) were
  authored as complete units within the US1 batch for file coherence; the
  statement halves listed under US2/US3 landed in the same files. Tests and
  expected-JSON were still authored before the implementation they lock.
- New catalog keys use the repo's literal-English-key convention (not the
  contract's illustrative `scan.*` names).
- T028 required NO web catalog edits: all scan keys are iOS-only, which the
  catalog-parity suite handles natively (verified green locally).

## Deferred cleanups (from the 7-angle implementation review — real but non-blocking)

- Six copies of the accent-capsule button recipe across the scan flow (+ the
  pre-existing ones) — extract a shared capsule ButtonStyle in DesignSystem.
- Noon-UTC construction now exists in three DEBUG/demo places besides the
  form's `noonUTC(ofLocalDay:)` — consolidate into one Date helper.
- `ScanHeuristics.parseAmount` converts Decimal→minor units via a Double
  round-trip; share an exact-decimal `Money.minorUnits(_:fractionDigits:)`
  with `Money.toUSDCents` instead.
- `convertedFromNote` and the duplicate-line date format bypass the
  `Money`/`DateFormatters` conventions (unlocalized grouping / FormatStyle vs
  CLDR pattern drift).
- `scanCaptionVisible` is derivable from `phase == .receiptPrefilled &&
  appliedScan != nil`; `sheetNav`'s wizard/normal button branches duplicate
  their modifier chains.
- `ScanRefiner`'s 2 s timeout still `await work.value` after cancel — a
  slow-to-cancel model call delays the (edit-guarded, so harmless) refined
  re-apply; a task-group race would make the timeout hard.
- CI scan screenshots use fixed `sleep 10` × 15 launches (~2.5 min of pure
  sleep) — a readiness poll would trim most of it.

## Dependencies & Execution Order

```
Phase 1 (T001 baseline → T002 draft PR; T003 fixtures [P] with T002)
Phase 2 (T004 types, T005 expected-JSON — T005 after T003+T004)
  └─► Phase 3 US1: T006 tests → T007,T008 [P] → T009 → T010 → T011 → T012; T013 [P] anytime
        └─► Phase 4 US2: T014 → T015,T018 [P] / T016 → T017 → T019 → T020 → T021
              └─► Phase 5 US3: T022 → T023,T024 [P] → T025 → T026 → T027
                    └─► Phase 6 US4: T028 [P] / T029 → T030
Phase 7 (T031 → T032 → T033)   ← needs everything above staged
Phase 8 (T034,T035 [P] → T036 → T037 operator)
```

US2–US4 build on US1's pipeline (extractor/parser/session grow in place), so stories
run sequentially; parallelism lives inside phases.

## Parallel Opportunities

- T002 ∥ T003 (PR vs fixture generation); T007 ∥ T008 (different new files);
  T015 ∥ T018; T023 ∥ T024; T028 ∥ T029; T034 ∥ T035
- T013 (pbxproj one-liner) can land any time after Phase 1

## Implementation Strategy

**MVP = Phase 3 (US1)**: receipt scan alone is shippable value; its verification rides
the single batched push. Then US2 (wizard) → US3 (inference) → US4 (demo/CI), one CI
batch (Phase 7), docs + PR-ready (Phase 8), operator live checks last (T037). Commit
per logical task group; **one** iOS push, fix-ups only after.

## Notes

- Test-first here means authored-and-committed-before-implementation; execution proof
  is CI (this sandbox cannot run XCTest) — same discipline as spec 013.
- Never regenerate golden vectors in this feature; a vector diff in review = a bug.
- All new UI strings go through the catalog in the same task that introduces them; the
  catalog-parity suite (web) is the local tripwire.
