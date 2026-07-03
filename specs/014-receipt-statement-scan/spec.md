# Feature Specification: Receipt & Statement Scanning

**Feature Branch**: `014-receipt-statement-scan`

**Created**: 2026-07-03

**Status**: Draft

**Input**: User description: "Receipt and statement scanning for the iOS app: capture a photo of a
paper receipt, a screenshot from Photos, or a PDF statement from Files, process it entirely
on-device, and prefill transaction entry so the user reviews and edits each transaction before
anything saves." Plus a set of locked UX decisions from the preceding design discussion (single
Scan capsule in the add form, auto-detect receipt vs statement, receipt = one transaction for the
total, sequential statement wizard, heuristics-first inference stack, on-device-only processing,
iOS-only with a documented web divergence).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Scan a receipt into the add form (Priority: P1)

A household member has a paper receipt in hand. From the Transactions tab they tap `+` as always,
tap the new **Scan** capsule at the top of the add form, photograph the receipt with the system
document camera, and watch the form they are already in fill itself: amount, merchant, and date.
They glance over the values, fix anything wrong exactly as if they had typed it, and tap Add.
Nothing is saved until they tap Add.

**Why this priority**: This is the core value — turning the highest-friction moment (typing a
transaction from paper) into a review-and-confirm moment. It is independently shippable and
useful with zero inference features.

**Independent Test**: With a bundled fixture receipt image fed through the real parse pipeline,
the add form prefills merchant, date, and total correctly; editing any field and saving produces
exactly one transaction through the existing add path.

**Acceptance Scenarios**:

1. **Given** the add form is open, **When** the user taps Scan, **Then** they are offered Camera,
   Photo Library, and Choose File as sources, and the form is otherwise unchanged.
2. **Given** a legible single-purchase receipt is captured, **When** processing completes,
   **Then** the current form prefills amount (grand total including tax/tip), merchant, and
   receipt date in place, a quiet caption reads "Filled from scan — review before adding", and
   the Add button obeys the exact same validation as manual entry.
3. **Given** a prefilled form, **When** the user edits any field, **Then** the field behaves
   identically to manual entry and its "guessed" affordance (if any) disappears.
4. **Given** an unreadable capture, **When** processing fails to find a total, **Then** calm copy
   appears — "Couldn't read this. Try a flatter, brighter photo." — with a Retake action, no
   error red anywhere, and the form's existing contents are untouched.
5. **Given** the user cancels the camera or picker, **Then** the form is exactly as they left it.

---

### User Story 2 - Import a statement through the review wizard (Priority: P2)

A household member has a monthly card statement — a PDF in Files, a screenshot in Photos, or
paper. They open the add form, tap Scan, and pick the file. The app detects a table of many
rows and switches to an interstitial: "34 rows found · 3 look like duplicates", with a
"Skip duplicates" toggle already on and a Start review button. Each remaining row then opens
the familiar add form, prefilled, with a progress header ("12 of 34"), a primary **Add and
next**, a secondary **Skip**, and **Stop** always available. Accepted rows save one at a time
through the normal add path. At the end (or on Stop) a summary reports what happened:
"28 added · 4 skipped · 2 duplicates left out."

**Why this priority**: Statements are where the volume is, but the flow builds entirely on the
receipt pipeline plus wizard chrome; it needs US1's extraction to exist first.

**Independent Test**: A bundled fixture statement PDF fed through the real pipeline yields the
interstitial with the correct row and duplicate counts; walking the wizard adds exactly the
accepted rows to the transaction list and no others.

**Acceptance Scenarios**:

1. **Given** a capture whose parse yields multiple transaction rows, **When** processing
   completes, **Then** the interstitial appears with the row count, the duplicate count, the
   pre-enabled "Skip duplicates" toggle, and Start review — and nothing has been saved.
2. **Given** the wizard is on row 12 of 34, **When** the user taps "Add and next", **Then** that
   row is saved via the existing optimistic add (visible in the list immediately, rolled back
   with the standard error alert if the server write fails) and row 13 appears prefilled.
3. **Given** the wizard is mid-run, **When** the user taps Stop, **Then** no further rows are
   presented, rows already added remain, and the summary reflects added/skipped/left-out counts.
4. **Given** a statement row is a credit, **Then** it prefills as income; a debit prefills as an
   expense; either direction can be flipped in the form before saving.
5. **Given** a statement row matches a card-payment/transfer pattern (e.g. "PAYMENT THANK YOU"),
   **Then** it is flagged and default-skipped like a duplicate — it never prefills as an expense.
6. **Given** a multi-page PDF statement, **Then** rows from all pages appear in one wizard run.

---

### User Story 3 - The scanner makes smart, editable guesses (Priority: P3)

Beyond merchant/date/amount, the scanner suggests: a category (from this household's own history
with that merchant first, refined by on-device intelligence only when history is silent), a
foreign-currency original amount when the receipt is not in USD, a same-amount-same-day duplicate
warning, and an owners/split guess from history with that merchant. Every guess is visibly a
guess — a subtle tertiary-text affordance that clears the moment the field is touched — and no
guess ever blocks saving.

**Why this priority**: Pure accelerator on top of US1/US2; the feature is complete and correct
without it, just less magical.

**Independent Test**: With seeded history ("Trader Joe's" categorized Groceries 12 times, split
50/50), scanning a Trader Joe's fixture prefills category Groceries and the 50/50 owners/split,
both marked as guessed; a fixture with a € total fills the original-amount field and converts via
the existing rates; a fixture matching an existing same-amount-same-day transaction shows the
calm inline duplicate line on the receipt path.

**Acceptance Scenarios**:

1. **Given** history contains a dominant past category for the scanned merchant, **Then** that
   category prefills, marked as guessed; **Given** no history, **Then** on-device refinement may
   suggest one, and absent that the category default is unchanged from manual entry.
2. **Given** a receipt total in a supported non-USD currency, **Then** the existing
   original-amount field fills with that amount and currency and the USD amount is derived
   through the existing conversion — never by treating the foreign figure as USD.
3. **Given** an existing transaction with the same amount on the same calendar day, **When** a
   receipt prefills, **Then** a single calm inline line notes the possible duplicate and the user
   can still add normally.
4. **Given** any guessed field, **When** the user touches it, **Then** the guessed affordance
   disappears and never returns for that entry.

---

### User Story 4 - The scan flow is verifiable without a camera (Priority: P3)

Development happens in Linux sandboxes and verification happens on CI simulators — neither has a
camera. A developer-only launch argument (`-uiDemoScan <fixture>`) feeds a bundled fixture image
or PDF through the *real* parse pipeline at launch, so CI screenshots capture the prefilled form,
the interstitial, the wizard, and the summary — in all six app languages, with every new string
translated.

**Why this priority**: It is the enforcement mechanism for everything above from this
environment; without it the feature is unreviewable from a sandbox.

**Independent Test**: CI screenshot matrix includes scan-flow screens per language; the existing
cross-catalog parity suite stays green with the new keys present in all six languages.

**Acceptance Scenarios**:

1. **Given** a DEBUG build launched with `-uiDemoScan <receipt-fixture>`, **Then** the app boots
   into demo data with the add form open and prefilled from the fixture via the real pipeline.
2. **Given** a DEBUG build launched with `-uiDemoScan <statement-fixture>`, **Then** the app
   boots into the interstitial for that fixture.
3. **Given** a release build, **Then** the argument is inert (compiled out like `-uiDemo`).
4. **Given** the new user-facing strings, **Then** all six language catalogs contain them and
   the catalog-parity suite passes.

---

### Edge Cases

- Capture is readable but contains neither a single total nor a row table (e.g. a menu, a
  random photo): treated as the unreadable case — calm copy + Retake, nothing prefilled.
- Ambiguous parse (e.g. a receipt whose line items look like a table): single-total detection
  wins when a grand total is confidently present; otherwise the statement path is used — the
  wizard on a one-row "statement" is still a correct, reviewable outcome.
- Receipt with tip adjusted after printing (restaurant slips): the printed total prefills; the
  user edits the amount like any other correction.
- Refund/credit on a receipt (negative total): prefills as income, flippable.
- Statement rows with ambiguous or missing dates: the row still enters the wizard with the date
  left at the form's default, never a fabricated date.
- Statement spanning a year boundary or with rows outside the current month: dates prefill as
  parsed; the existing date-picker convention (noon-UTC of the local calendar day) applies on
  save, matching the CLI import convention.
- 100+ row statements: the wizard is unbounded; Stop and the summary make partial runs safe;
  progress header keeps position visible.
- Duplicate detection when several same-amount-same-day rows exist on both sides: each parsed
  row matches at most one existing transaction (no double-claiming); extras enter the wizard
  normally.
- Camera/photo permission denied: the system permission UX applies; the other two sources
  remain usable; no custom nagging.
- Device without on-device intelligence support: baseline extraction and history-based guesses
  work identically; only the no-history category refinement silently degrades.
- Server write fails mid-wizard: the standard optimistic rollback + "Something didn't save"
  alert applies to that row; the wizard does not advance past it silently.
- App backgrounded mid-wizard: already-added rows persist (they were real adds); the wizard
  session itself does not need to survive process death.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The add-transaction form MUST present a "Scan" affordance alongside the existing
  "Copy from recent" affordance, in add mode only, with no other new chrome anywhere in the app.
- **FR-002**: The Scan affordance MUST offer exactly three sources: camera capture, photo
  library, and file selection (PDF included).
- **FR-003**: All capture processing MUST happen on-device; the captured image/PDF MUST never be
  uploaded or persisted, and MUST be discarded after parsing. No network traffic may result from
  a scan (the eventual transaction save uses the existing path).
- **FR-004**: The system MUST auto-detect the capture type: a confidently detected single grand
  total routes to the receipt path; a detected table of transaction-like rows routes to the
  statement path. There MUST NOT be a manual mode picker.
- **FR-005**: The receipt path MUST prefill the open add form in place with amount (grand
  total), merchant, and date, plus any US3 guesses, and MUST show a single quiet caption
  indicating the form was filled from a scan.
- **FR-006**: Prefilled values MUST pass through the form's existing validation, editing, and
  save behavior unchanged; scanning MUST NOT introduce any new save path or relax any rule.
- **FR-007**: The statement path MUST present an interstitial before any review: row count,
  duplicate count, a "Skip duplicates" toggle defaulting to on, and a Start review action.
  Nothing may be saved at this stage.
- **FR-008**: The statement wizard MUST present rows sequentially in the existing add form with
  a progress indicator, primary "Add and next", secondary "Skip", and an always-available Stop.
- **FR-009**: Each accepted wizard row MUST save individually through the existing optimistic
  add (immediate local append, rollback + standard error alert on failure). There MUST be no
  batch/atomic multi-row write.
- **FR-010**: The wizard MUST end (on completion or Stop) with a summary of added, skipped, and
  left-out-as-duplicate counts.
- **FR-011**: Statement credits MUST prefill as income and debits as expenses; the direction
  MUST remain flippable per row before saving.
- **FR-012**: Rows matching card-payment/transfer patterns MUST be flagged and default-skipped;
  they MUST never prefill as expenses, and Reimbursement MUST remain unpickable as a category.
- **FR-013**: Category suggestion MUST consult the household's own transaction history for the
  merchant first; on-device intelligence MAY refine only when history is silent; absent both,
  the default category MUST equal manual entry's default.
- **FR-014**: A non-USD total MUST fill the existing original-amount field and derive USD
  through the existing conversion rates; foreign figures MUST never be stored as USD directly.
- **FR-015**: Duplicate detection MUST use same-amount + same-calendar-day against existing
  transactions; on the receipt path it surfaces as one calm inline line (never blocking); on
  the statement path it drives the pre-skip counts; each parsed row may claim at most one
  existing transaction.
- **FR-016**: Every inferred (guessed) field MUST carry a subtle tertiary-text "guessed"
  affordance — no highlight colors — cleared permanently for that entry when the field is
  touched. Guesses MUST never block saving.
- **FR-017**: An unreadable or unparseable capture MUST produce the calm failure copy with a
  Retake action, use no red, and leave the form's prior contents untouched.
- **FR-018**: Baseline extraction (totals, dates, amounts, table rows) MUST work without
  on-device intelligence; intelligence-dependent refinement MUST degrade silently.
- **FR-019**: Statement date handling MUST follow the existing CLI import convention (local
  calendar day, noon-UTC on save); the wizard MUST NOT introduce a second convention.
- **FR-020**: All new user-facing strings MUST live in the string catalog, translated in all six
  languages, keeping the cross-catalog parity suite green.
- **FR-021**: A DEBUG-only `-uiDemoScan <fixture>` launch argument MUST drive bundled fixtures
  through the real parse pipeline for CI screenshots; it MUST be compiled out of release builds.
- **FR-022**: The parity contract (PARITY.md) MUST record scanning as a deliberate iOS-only
  input method (web/desktop equivalent: the CLI import), with no web work in this feature.
- **FR-023**: The feature MUST require no backend or schema changes and no golden-vector
  changes; any money arithmetic MUST go through the existing locked helpers.

### Key Entities

- **Capture**: a transient image or PDF from camera/library/files; exists only in memory for
  the duration of parsing; never persisted or transmitted.
- **Parsed candidate**: one potential transaction extracted from a capture — raw and cleaned
  merchant text, date (optional), amount in cents, direction (credit/debit), detected currency,
  per-field guess markers, payment-row flag, duplicate match (at most one existing transaction).
- **Scan session**: the outcome of one capture — either a single candidate (receipt path) or an
  ordered list of candidates plus counts (statement path) with per-row dispositions
  (pending / added / skipped / left-out-duplicate) driving the wizard and its summary.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For each bundled fixture receipt, the prefilled merchant, date, and total match
  the fixture's known values exactly, and saving produces exactly one transaction.
- **SC-002**: For the bundled fixture statement, the interstitial counts equal the fixture's
  known row/duplicate counts, and a full wizard walk-through results in exactly the accepted
  rows appearing in the transaction list — zero unreviewed saves anywhere in the feature.
- **SC-003**: A user can go from tapping Scan on a clear receipt to a saved transaction in
  under 30 seconds, with processing itself completing in under 5 seconds on target hardware.
- **SC-004**: Zero captures are persisted or transmitted: parsing runs with no network access
  and leaves no image/PDF artifacts on disk.
- **SC-005**: Payment/transfer statement rows from fixtures are default-skipped 100% of the
  time and never appear as expenses without explicit user override.
- **SC-006**: All scan-flow screens render fully translated in all six languages in the CI
  screenshot matrix, with the catalog-parity suite green.
- **SC-007**: The existing test suites (web 619+, iOS parity suites) remain green with zero
  golden-vector diffs.

## Assumptions

- Receipts and statements are primarily English-language and US-format (the household's actual
  banks); extraction quality for other formats is best-effort, and the review step is the
  safety net either way.
- "Same amount + same calendar day" is an acceptable duplicate heuristic for a two-person
  household's volume; merchant text is too unstable across receipts/statements to require.
- The statement fixture set can be modeled on the formats the CLI importer already handles
  (e.g. the TD Bank precedent), keeping one family of parsing conventions.
- Camera and photo-library permission prompts use standard system copy; a purpose string for
  camera access is a required addition but involves no design work.
- Wizard sessions are ephemeral: process death mid-wizard loses only the un-reviewed remainder,
  which the user can re-import; already-added rows are durable.
- On-device intelligence availability varies by device; the household's devices meeting the
  app's already-modern minimum OS make the heuristics-first baseline the compatibility floor.
- iOS remains the canonical app; this feature widens the documented input-method divergence
  rather than the product surface, so web parity is intentionally not violated in spirit.
