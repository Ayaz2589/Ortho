# Research: Receipt & Statement Scanning (spec 014)

All Technical Context unknowns resolved. Each decision below records what was chosen,
why, and what was rejected.

## R1. Capture UI

**Decision**: VisionKit `VNDocumentCameraViewController` wrapped in
`UIViewControllerRepresentable` for the camera source; SwiftUI `PhotosPicker` for the
library source; SwiftUI `.fileImporter` (UTType.pdf + images) for Files.

**Rationale**: The document camera gives edge detection, perspective correction, and
multi-page capture for free, with Apple's own UX — nothing to design, nothing to
maintain. `PhotosPicker` and `.fileImporter` run out-of-process, so neither needs a
permission string; only the camera does (`NSCameraUsageDescription`, added as the
`INFOPLIST_KEY_NSCameraUsageDescription` build setting since the project generates its
Info.plist).

**Alternatives considered**: `DataScannerViewController` (live text scanning) — rejected:
optimized for live viewfinder text/QR capture, not for producing a corrected document
image, and no PDF story. Custom AVFoundation camera — rejected: pure liability, worse UX.

## R2. OCR / document understanding

**Decision**: Vision `RecognizeDocumentsRequest` (iOS 26) as the primary engine — it
returns a structured `DocumentObservation` with detected **tables** (statement rows),
paragraphs, and text lines with bounding boxes. A fallback path builds the same neutral
`ScanDocumentText` model from classic `RecognizeTextRequest` observations clustered into
lines by Y-coordinate. The parser consumes only `ScanDocumentText`, never Vision types.

**Rationale**: Statements are literally tables; the structured request removes the
hardest problem (row segmentation). Keeping Vision types out of the parser makes the
parser a pure, fixture-testable function and lets the fallback (and PDF text layer, R3)
share one downstream path.

**Alternatives considered**: `RecognizeTextRequest` only — rejected as primary (manual
table reconstruction is exactly the error-prone part); third-party OCR (MLKit,
Tesseract) — rejected: new dependency, worse iOS integration, no benefit at 26.2.

## R3. PDF handling

**Decision**: Try the PDF **text layer first** via PDFKit (`PDFPage.string` /
attributed-string runs with positions); if a page has no meaningful text layer (scanned
PDF), render the page at 2× with PDFKit and send the image through the R2 OCR path.
Multi-page PDFs concatenate per-page `ScanDocumentText` in order (spec US2 #6).

**Rationale**: Digital bank statements have perfect text layers — extracting them is
lossless and instant, exactly what the CLI's `extractText` does with pdf parsing on the
web side. OCR-ing a rendered digital PDF would only add errors.

**Alternatives considered**: always render+OCR — rejected (adds errors, slower);
text-layer only — rejected (breaks scanned/photographed statements).

## R4. Foundation Models refinement

**Decision**: `ScanRefiner` checks `SystemLanguageModel.default.availability`; when
available it runs a guided-generation (`@Generable`) request that (a) cleans a raw
merchant string ("TST* BLUE BOTTLE 04722" → "Blue Bottle") and (b) suggests a category
**only when history is silent** (FR-013), from the closed `TransactionCategory` list.
Hard timeout (~2 s); any failure/timeout silently keeps heuristic output (FR-018).
Never invoked for amounts or dates — those stay deterministic.

**Rationale**: Guided generation constrained to the existing enum can't invent
categories; on-device means zero privacy/network cost. Keeping it out of the
amount/date path preserves determinism and the fixture-test story (fixtures assert the
heuristic baseline; refinement is additive polish).

**Alternatives considered**: cloud LLM — rejected (violates FR-003/SC-004); FM as the
primary parser — rejected (non-deterministic, unavailable on some devices, untestable
in CI simulators).

## R5. Receipt vs statement auto-detection

**Decision**: Deterministic rule in `ScanParser`, in order:
1. If the document yields ≥ 3 parseable **transaction rows** (date + amount on one
   line/table row) → statement path.
2. Else if a confident **grand total** exists (largest amount labeled TOTAL/AMOUNT
   DUE/BALANCE-style, or the bottom-most emphasized amount) → receipt path.
3. Else if 1–2 transaction rows parsed → statement path with that row count (the
   one-row wizard is still a correct, reviewable outcome — spec edge case).
4. Else → `.none` → calm failure copy.

**Rationale**: Matches the spec's tie-break ("single-total detection wins when a grand
total is confidently present" — receipts with itemized lines still have a labeled
total; statements never label a single row TOTAL without a table around it). Fully
deterministic and fixture-lockable.

## R6. Statement conventions ported from the CLI (`web/scripts/import/engine/`)

The wizard is "ingest with a face" — these are convention **ports**, kept
behavior-identical and documented in PARITY.md (they are not golden-vectored; the CLI
is deliberately outside that harness):

| Convention | CLI source | iOS port decision |
|---|---|---|
| Dates: "MM/DD" + statement period → **noon-UTC ISO**, year inferred from period | `engine/dates.ts` (`T12:00:00.000Z`) | Same algorithm in `ScanHeuristics`; the receipt path uses the parsed calendar day through the form's existing date convention. |
| Duplicate flagging: match against **existing DB rows only**, never within the batch; flagged rows are excluded by default but re-includable | `engine/dedupe.ts` | Same semantics; key differs (below). Within-batch identical rows all enter the wizard. |
| Category suggestion: ordered UPPERCASED-merchant regex table, first match wins | `engine/categorize.ts` | Table ported to Swift as tier 2 (after history, before FM refinement — R7). iOS does **not** adopt the CLI's 'entertainment' fallback; with no signal the form default is unchanged (FR-013). |
| Non-spending exclusion: card-payment patterns (`AMEX EPAYMENT`, `APPLECARD`, `CHASE CREDIT CRD`, `CREDIT CRD AUTOPAY`, `GSBANK PAYMENT`, …) flagged + default-excluded | `engine/exclusions.ts` | Ported verbatim as the FR-012 payment-row detector, plus generic `PAYMENT THANK YOU`/`AUTOPAY` patterns. |
| Credits → income, debits → expense | profiles | Same mapping (FR-011). |

**Duplicate key divergence (deliberate)**: the CLI keys on
`(creator, day, amountCents, source)` because an import run knows its source card. A
scanned receipt has no reliable source, so iOS keys on **(calendar day, amountCents)**
household-wide (FR-015, spec assumption). Each parsed row claims at most one existing
transaction (greedy, matching the CLI's set semantics). Recorded in PARITY.md.

## R7. Category/split inference order

**Decision**: For each candidate: (1) **history** — normalize merchant (uppercase,
strip processor prefixes like `TST*`/`SQ *`, collapse digits/whitespace) and look for
the dominant category among the household's past transactions with a matching
normalized merchant (most frequent; ties → most recent). The same match supplies the
owners/split guess (most recent matching transaction's owners + split). (2) **CLI rule
table** (statement rows benefit most). (3) **FM refinement** (R4) only if 1–2 produced
nothing. (4) Otherwise leave the form's manual defaults untouched. Every inferred field
carries a guess marker (FR-016).

**Rationale**: History is the household's own truth and produces the owners/split guess
for free; the rule table gives CLI-consistent statement behavior; FM is a last resort.

## R8. Wizard architecture

**Decision**: A single `@Observable ScanSession` object owns the flow state machine
(see data-model.md) and lives in `AddTransactionSheet`'s scope. The wizard **reuses
AddTransactionSheet itself**: a new optional `scan: ScanPrefill?` input (sibling of the
existing `SettleUpPrefill` pattern) prefills fields and guess markers; wizard chrome
(progress header, "Add and next", "Skip", "Stop") renders only when the session is in
`.reviewing`. Accepted rows call the existing `appState.addTransaction` — no new save
machinery (FR-009).

**Rationale**: The form already handles validation, splits, FX, and both add/edit
modes; a parallel form would drift. The prefill-payload pattern is established
(SettleUpPrefill, Copy) — this is the fourth prefill source, exactly as designed.

**Alternatives considered**: separate wizard form — rejected (drift, double
maintenance); checklist review screen — rejected by the user (sequential wizard locked).

## R9. Fixtures, tests, and `-uiDemoScan`

**Decision**: Fixture receipts (PNG) and statements (PDF) + `*.expected.json` live in
the **app** target at `Resources/ScanFixtures/` — the filesystem-synchronized project
picks them up with zero pbxproj edits, `-uiDemoScan <name>` loads them by name, and
`ScanParserTests` reads them from the app bundle (`Bundle(for: AppState.self)`), so the
test target needs no Copy-Bundle-Resources surgery either. Fixtures are synthetic
(generated receipt/statement images and PDFs — no real personal data in the public
repo). `-uiDemoScan` implies `-uiDemo` (demo data, no auth), runs the real
extractor+parser+inference pipeline against the demo transaction history, and lands on
the receipt-prefilled form or the statement interstitial; `-uiDemoScanStep
<interstitial|row|summary>` (DEBUG) advances the statement flow for screenshots.

**Rationale**: One fixture set serves unit tests, demo mode, and CI screenshots; the
app-bundle trick avoids the one genuinely fiddly pbxproj edit class documented in
CI-SETUP.local.md. Synthetic fixtures keep the public repo clean of real financial data.

**Release-build cost accepted**: bundled fixtures ship in release (~a few hundred KB);
acceptable for now, revisitable with an asset-exclusion build phase if size ever matters.

## R10. Failure & permission UX

**Decision**: Parse failure or empty result → in-form quiet state with the locked copy
and a Retake button that reopens the last-used source (FR-017). Camera permission
denied → the system alert is the only prompt; the source menu keeps Photos/Files
usable. No custom permission-nagging UI.

## R11. Localization

**Decision**: All new user-facing strings go into `Localizable.xcstrings` with
translations for en/bn/es/ja/zh-Hans/ko in the same change (the 013 catalog-parity
suite locks coverage). Shared keys that conceptually exist on web get added to
`web/lib/i18n/*` byte-identically per the catalog-parity contract; scan-only strings
are iOS-only keys (the parity suite's iOS-only allowlist covers them). Counts in
interstitial/summary use localized plural formats; বাংলা keeps Latin digits via the
existing `bn-BD-u-nu-latn` locale plumbing.

## R12. Concurrency & memory

**Decision**: Extraction+parsing runs in a detached task off the main actor;
`ScanSession` publishes progress on the main actor. Captured images are downscaled to
OCR-appropriate resolution before processing and all capture data is released when the
session ends (FR-003). PDF pages process sequentially to bound memory on 100+ row
statements.
