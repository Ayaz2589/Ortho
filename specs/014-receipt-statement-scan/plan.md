# Implementation Plan: Receipt & Statement Scanning

**Branch**: `014-receipt-statement-scan` | **Date**: 2026-07-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-receipt-statement-scan/spec.md`

## Summary

Add an on-device scan-to-prefill pipeline to Ortho-iOS: a "Scan" capsule in
`AddTransactionSheet` captures a receipt photo, library image, or PDF statement; a pure,
fixture-tested parser (Vision structured OCR + deterministic heuristics, optional
Foundation Models refinement) extracts one candidate (receipt → prefill the open form in
place) or many (statement → interstitial → sequential review wizard → summary). Every
accepted row saves through the existing optimistic `addTransaction` path. Statement
parsing ports the CLI ingest conventions (noon-UTC dates, duplicate flagging, category
rules, payment-row exclusion) to Swift. No backend, schema, web, or golden-vector
changes; PARITY.md records the deliberate iOS-only input-method divergence. A DEBUG-only
`-uiDemoScan <fixture>` argument drives bundled fixtures through the real pipeline for
CI screenshots in all six languages.

## Technical Context

**Language/Version**: Swift 5 / SwiftUI, `@Observable` (no ViewModels), iOS deployment target 26.2

**Primary Dependencies** (all Apple system frameworks — no new SPM packages):
- AVFoundation camera with a text-gated shutter (`ScanCameraView`, research R1 revision —
  originally VisionKit `VNDocumentCameraViewController`, replaced post-T041)
- PhotosUI `PhotosPicker` (library source), SwiftUI `.fileImporter` (PDF source)
- Vision `RecognizeDocumentsRequest` (structured/table OCR, primary) with
  `RecognizeTextRequest` line-clustering fallback
- PDFKit (text-layer extraction first, page render → OCR fallback)
- FoundationModels (`SystemLanguageModel`), availability-gated, refinement only
- Existing: supabase-swift (unchanged — saves go through `AppState.addTransaction`)

**Storage**: none new. Captures are in-memory only, discarded after parse (FR-003).
Transactions persist via the existing optimistic-write path.

**Testing**: XCTest — new `ScanParserTests` (pure parser vs bundled fixtures with
expected-JSON, test-first per constitution VI); existing 7 parity suites untouched;
`web && npm test` must stay green (catalog-parity suite gains the new keys). CI
(`ios-ci.yml`) compiles, runs suites, screenshots the scan flow via `-uiDemoScan`.

**Target Platform**: iOS 26.2+ (iPhone). Foundation Models features degrade silently on
non-Apple-Intelligence hardware (FR-018).

**Project Type**: mobile app — `iOS/` only; docs + PARITY.md touches at repo root.

**Performance Goals**: parse ≤ 5 s for a typical capture (SC-003); parsing runs off the
main actor; UI shows a quiet "Reading…" state, never blocks.

**Constraints**: on-device only, zero network during parse (SC-004); DEBUG-only demo
hooks compiled out of release; design-token-only UI; all new strings in
`Localizable.xcstrings` ×6 languages; no golden-vector diffs (SC-007).

**Scale/Scope**: 2-person household; statements up to ~200 rows; 4 new views/chrome
pieces, ~5 new service files, 1 modified sheet, fixtures + tests.

## Constitution Check

*GATE: evaluated against constitution v1.1.0 before Phase 0; re-checked after Phase 1.*

| Principle | Verdict | Notes |
|---|---|---|
| I. Tokens only | PASS | All new UI uses `AppTheme` tokens; the "guessed" affordance is `text3` text, no new colors (FR-016). |
| II. Calm over dense (NN) | PASS | One capsule, quiet captions, no red failure states (FR-017), hairlines, no shadows outside sheets. |
| III. Right form factor | PASS | Everything rides existing iOS sheet patterns; interstitial/summary are sheet content, wizard is chrome on the existing form. |
| IV. Plainspoken voice & money | PASS | Copy locked in spec ("Filled from scan — review before adding", "Couldn't read this…"); money formatting untouched (existing `Money`). |
| V. Accessible & interaction-complete | PASS | Real buttons/toggles, ≥44pt targets, VoiceOver labels on capsule/wizard controls. |
| VI. Test-driven (NN) | PASS | Parser is pure and developed test-first against fixtures; date/amount extraction is deterministic (no real clock — statement period injected); money math delegates to locked helpers (FR-023). |
| Parity constraint | PASS (documented divergence) | iOS-only input method recorded in PARITY.md (FR-022); web equivalent = CLI ingest. No web behavior changes. |

**Post-Phase-1 re-check**: PASS — design introduces no new colors, no new save paths, no
schema/vector changes; the only pbxproj-free additions ride filesystem-synchronized groups.

## Project Structure

### Documentation (this feature)

```text
specs/014-receipt-statement-scan/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── scan-parser.md   # pure-parser API + fixture format
│   ├── scan-ui-flow.md  # capsule/interstitial/wizard/summary behavior + strings
│   └── uidemo-scan.md   # -uiDemoScan launch-arg + CI screenshot contract
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
iOS/Ortho-iOS/
├── Services/Scan/                      # NEW — pure logic, no UI imports
│   ├── ScanModels.swift                # ScanDocumentText, ParsedCandidate, ScanParseResult
│   ├── ScanTextExtractor.swift         # capture → ScanDocumentText (Vision / PDFKit adapters)
│   ├── ScanParser.swift                # ScanDocumentText → ScanParseResult (receipt|statement|none)
│   ├── ScanHeuristics.swift            # regex totals/dates/amounts/currency; payment-row + category
│   │                                   #   rule tables ported from web/scripts/import/engine
│   ├── ScanInference.swift             # history-based category/split guess + duplicate matching
│   └── ScanRefiner.swift               # FoundationModels refinement, availability-gated
├── Features/Transactions/
│   ├── AddTransactionSheet.swift       # MODIFIED — Scan capsule + source menu, ScanPrefill
│   │                                   #   application, guessed affordances, wizard chrome
│   └── Scan/                           # NEW — UI
│       ├── ScanCaptureView.swift       # document-camera wrapper; PhotosPicker/fileImporter glue
│       ├── ScanSession.swift           # @Observable flow state machine (see data-model.md)
│       ├── StatementInterstitialView.swift
│       └── ScanSummaryView.swift
├── Resources/ScanFixtures/             # NEW — bundled fixture images/PDFs + expected JSON
│   └── (receipt-*.png|pdf, statement-*.pdf, *.expected.json)
├── Ortho_iOSApp.swift                  # MODIFIED — -uiDemoScan plumbing (DEBUG only)
└── Localizable.xcstrings               # MODIFIED — new keys ×6 languages

iOS/Ortho-iOSTests/
└── ScanParserTests.swift               # NEW — fixture-driven parser tests (loads fixtures
                                        #   from the APP bundle — zero pbxproj edits)

iOS/Ortho-iOS.xcodeproj/project.pbxproj # MODIFIED — one build setting:
                                        #   INFOPLIST_KEY_NSCameraUsageDescription

.github/workflows/ios-ci.yml            # MODIFIED — scan-flow screenshot steps
PARITY.md                                # MODIFIED — divergence row (FR-022)
docs/ios.md                              # MODIFIED — scan pipeline + -uiDemoScan
web/lib/i18n/*.ts                        # MODIFIED — shared-key parity for new strings
                                         #   (catalog-parity suite requires byte-identical
                                         #   shared keys; web renders nothing new)
```

**Structure Decision**: everything rides the existing per-feature layout — pure logic in
`Services/`, UI in `Features/Transactions/`, and the filesystem-synchronized Xcode groups
mean only the camera-permission build setting touches the pbxproj. Test fixtures are
bundled in the **app** target (`Resources/ScanFixtures/`, auto-synced) and read by both
`-uiDemoScan` and `ScanParserTests` from the app bundle, avoiding the test-target
Copy-Bundle-Resources pbxproj surgery that golden vectors need.

## Verification topology (binding for tasks.md ordering)

1. **Parser first, test-first**: `ScanParserTests` + fixtures are written failing, then
   heuristics/parser until green — this is runnable only on CI, so parser work batches
   into the single iOS push discipline (one push, watch `ios-ci.yml`).
2. **Web side runs locally**: the only web change is i18n shared-key additions —
   `cd web && npm test` (catalog-parity + full suite) is the fast local gate.
3. **UI verification is CI screenshots**: `-uiDemoScan` fixtures drive the prefilled
   form, interstitial, wizard row, and summary shots per language.
4. **Live camera/photo/file sources**: operator-verified on the Mac simulator/device
   (explicitly out of CI scope per spec US4).

## Complexity Tracking

No constitution violations to justify. The one debatable addition — porting the CLI's
category/exclusion regex tables into Swift rather than sharing them — is required
because the CLI is TypeScript-only and deliberately outside the golden-vector harness;
the tables are convention mirrors (documented in PARITY.md), not vectored math.
