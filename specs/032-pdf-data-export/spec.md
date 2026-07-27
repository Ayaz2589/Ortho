# Feature Specification: PDF Data Export & Import (Ortho Data File)

**Feature Branch**: `032-pdf-data-export`

**Created**: 2026-07-27

**Status**: Draft

**Input**: User description: "Let users download their transactions and any housing data as a PDF, extensible for future widget/other sections. Downloadable in any language + currency combination (defaulting to current). User can also upload the PDF to refill data, avoiding duplication."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Download my data as a PDF (Priority: P1)

A household member wants a portable, human-readable record of their money data. From the app they open an export panel, confirm what to include (transactions and housing data by default), and download a single PDF. The PDF opens in any reader and shows their transactions and housing details laid out cleanly, formatted in a language and currency they chose.

**Why this priority**: The export is the foundational half of the feature and delivers standalone value — a backup/record the user can keep, print, or share — even before import exists. Nothing else works without it.

**Independent Test**: Trigger export with the default selections and confirm a valid PDF file is produced that, when opened, contains the household's transactions and housing data in readable form. Delivers a keepable record with no dependency on import.

**Acceptance Scenarios**:

1. **Given** a household with transactions and at least one property, **When** the user exports with default options, **Then** a single PDF downloads containing a transactions section and a housing section, each showing the correct records.
2. **Given** a household with transactions but no housing data, **When** the user exports, **Then** the PDF contains the transactions section and the housing section shows an empty-state line rather than being broken or omitted silently.
3. **Given** the export completes, **When** the user opens the file, **Then** amounts, dates, and names are legible and correctly formatted, and the document identifies itself (household name + generation date).

---

### User Story 2 - Choose language and currency for the export (Priority: P1)

When exporting, the user can pick any supported language and any supported display currency for the human-readable pages. The picker pre-selects whatever language and currency the app is currently using, so the common case is one click. A user who reads Bengali but wants figures in GBP can produce exactly that document.

**Why this priority**: Multi-language + multi-currency output is an explicit, distinguishing requirement of the feature and central to Ortho's audience (6 languages, 7 currencies). It rides on the same export path as US1 and must land with it.

**Independent Test**: Open the export panel and verify the language and currency selectors default to the app's current values; change them to a different combination, export, and confirm the produced PDF's visible text and figures reflect the chosen language and currency.

**Acceptance Scenarios**:

1. **Given** the app is set to English + USD, **When** the user opens the export panel, **Then** the language selector shows English and the currency selector shows USD as pre-selected.
2. **Given** the user selects বাংলা and GBP, **When** they export, **Then** the visible labels/headings render in Bengali and every amount is shown in GBP (converted from the canonical amounts), with no amount shown in red.
3. **Given** the chosen currency differs from USD, **When** amounts are rendered, **Then** the converted figures use the app's existing conversion rates and the document notes the currency used.
4. **Given** any language/currency chosen for display, **When** the same file is later imported (US3), **Then** the restored records are byte-for-byte identical to the originals regardless of the display currency chosen at export time.

---

### User Story 3 - Upload a PDF to refill my data (Priority: P1)

A user (e.g. after reinstalling, switching devices, or restoring a backup) uploads a previously exported PDF. The app reads the data embedded in the file and adds any records that are missing, so the user gets their transactions and housing data back without re-entering them.

**Why this priority**: Import is the second half of the round-trip and the reason export is more than a printout. It turns the PDF into a genuine data-portability/backup format. It depends on the export format from US1/US2.

**Independent Test**: Export a PDF, clear or start from an account missing some of those records, import the PDF, and confirm the missing records are recreated with the same amounts, dates, splits/owners, and housing details as the originals.

**Acceptance Scenarios**:

1. **Given** a PDF exported by this app, **When** the user uploads it, **Then** the app identifies it as an Ortho data file and shows what it found (counts per section) before making changes.
2. **Given** the uploaded file contains records not present in the current household, **When** the user confirms import, **Then** those records are created and a summary shows how many were added per section.
3. **Given** a file that is not an Ortho data file (e.g. an arbitrary PDF or bank statement), **When** the user uploads it, **Then** the app explains it can't read it as an Ortho data file and makes no changes.
4. **Given** a PDF exported by a newer app version with an unknown format revision, **When** the user uploads it, **Then** the app refuses gracefully with an explanatory message rather than importing corrupt/partial data.

---

### User Story 4 - Import without creating duplicates (Priority: P1)

The user imports a PDF whose records partly overlap with data already in their household (a common case: re-importing a backup that's only slightly out of date). The app recognizes records it already has and skips them, only adding the genuinely new ones, so importing is safe to repeat.

**Why this priority**: Without dedup, import is dangerous — every re-import would double the ledger. Safe, idempotent import is a hard requirement called out explicitly in the request.

**Independent Test**: Import the same PDF twice in a row. The first import adds records; the second adds zero and reports everything as already-present. Then import a PDF that overlaps a populated household and confirm only the non-overlapping records are added.

**Acceptance Scenarios**:

1. **Given** a household already containing every record in the PDF, **When** the user imports it, **Then** zero records are added and the summary reports them all as already present (skipped as duplicates).
2. **Given** the same PDF is imported twice, **When** the second import runs, **Then** it adds nothing (idempotent).
3. **Given** a record in the PDF matches an existing record by identity, **When** import runs, **Then** it is skipped by identity before any content comparison.
4. **Given** a record in the PDF has no identity match but closely matches an existing record by content (same amount, similar merchant, near date), **When** import runs, **Then** it is treated as a probable duplicate and not blindly re-added.
5. **Given** the import summary is shown, **When** the user reviews it, **Then** added and skipped-as-duplicate counts are reported per section and no record is silently double-inserted.

---

### User Story 5 - Extensible to future data sections (Priority: P2)

The product will later export/import additional sections (dashboard widget configuration, budgets, goals, etc.). Adding a new section should not require reworking the export/import pipeline — a new section registers itself with its own render + read + dedup behavior, and older files that lack the section still import cleanly.

**Why this priority**: Explicitly requested ("in the future we will add widget information and other features so let's make it extendable"). It shapes the architecture now so later additions are additive, but it delivers no end-user-visible surface on its own in v1.

**Independent Test**: With the section registry in place, a developer can add a throwaway third section and see it appear in both the exported document and the import path without editing the core pipeline; removing it leaves v1 behavior unchanged. Forward/backward compatibility is covered by importing files that have more or fewer sections than the current build knows about.

**Acceptance Scenarios**:

1. **Given** the export pipeline, **When** a new section is registered, **Then** it is included in exports and handled on import without changes to the transactions or housing sections.
2. **Given** an older file missing a section the current build supports, **When** imported, **Then** the known sections import and the missing one is simply absent (no error).
3. **Given** a file with a section the current build does not recognize, **When** imported, **Then** the recognized sections import and the unknown section is skipped with a note (no failure).

---

### Edge Cases

- **Empty household**: Exporting with no transactions and no housing data produces a valid PDF with empty-state lines per section (never a broken/blank document).
- **Large household**: Exporting hundreds–thousands of transactions produces a multi-page PDF that still opens and imports correctly (paging does not corrupt the embedded data).
- **Non-Latin scripts**: The visible pages must render Bengali, Japanese, Simplified Chinese, and Korean text legibly, not as tofu/blank glyphs.
- **Currency with no fractional units** (e.g. JPY): amounts display with the correct number of decimals for that currency.
- **Tampered / truncated file**: A PDF whose embedded data is altered, corrupted, or truncated is rejected on import with an explanation; nothing partial is written.
- **Wrong household**: Importing a file exported from a different household — the app still dedups by content and identity; it does not blindly trust the file's household id to overwrite anything (import only adds; it never deletes or mutates existing records in v1).
- **Records referencing people not in this household**: imported transactions whose owners/payer don't exist locally must resolve to something sensible (documented in Assumptions) rather than crashing.
- **Re-import after partial edits**: If some imported records were later edited by the user, re-importing the original file must not resurrect the pre-edit version as a "new" record beyond what dedup allows.

## Requirements *(mandatory)*

### Functional Requirements

#### Export

- **FR-001**: Users MUST be able to export their household data as a single downloadable PDF file from within the app.
- **FR-002**: The export MUST include, by default, a transactions section and a housing section (properties with their mortgage/lease/unit details and rental payments).
- **FR-003**: The PDF MUST contain a human-readable presentation of the data (readable in any standard PDF viewer) AND an embedded, structured, machine-readable representation of the same data that serves as the authoritative source for re-import.
- **FR-004**: Users MUST be able to choose the display language of the human-readable pages from the app's supported languages; the selector MUST default to the app's current language.
- **FR-005**: Users MUST be able to choose the display currency of the human-readable pages from the app's supported currencies; the selector MUST default to the app's current currency.
- **FR-006**: The embedded machine-readable data MUST store amounts as the canonical stored value (USD integer cents), independent of the display currency chosen at export, so that re-import is lossless and currency-choice-independent.
- **FR-007**: Displayed amounts in a non-USD currency MUST be converted using the app's existing conversion rates and MUST NOT alter the canonical embedded values.
- **FR-008**: The document MUST identify itself: household name, generation timestamp, app/format version, and the display language + currency used.
- **FR-009**: Loss/cost amounts MUST NOT be shown in red anywhere in the document (design constitution).
- **FR-010**: The export MUST succeed for an empty household, producing per-section empty-state content rather than an error or blank file.

#### Import

- **FR-011**: Users MUST be able to upload a previously exported PDF to restore/refill data.
- **FR-012**: Import MUST read the embedded machine-readable data, NOT scrape the visible text.
- **FR-013**: Before applying changes, import MUST validate the file is a recognized Ortho data file of a supported format version and show the user what it found (per-section counts). Unrecognized or unsupported-version files MUST be rejected with a clear message and MUST make no changes.
- **FR-014**: Import MUST be additive in v1: it creates missing records and never deletes or overwrites existing ones.
- **FR-015**: Import MUST avoid duplicates using two tiers: (1) exact identity match against existing records' canonical identifiers → skip; (2) for records with no identity match, a content-based fuzzy match (amount + similar merchant + near date, reusing the existing import duplicate matcher) → treat as probable duplicate and skip by default.
- **FR-016**: Import MUST be idempotent: importing the same file twice adds records at most once.
- **FR-017**: After import, the app MUST show a summary of added vs. skipped-as-duplicate counts per section, and MUST NOT silently double-insert any record.
- **FR-018**: Restored records MUST preserve the canonical data: amounts (USD cents), dates, category/kind, splits and owner assignments for transactions, and full housing details for properties — regardless of the display currency/language chosen at export.

#### Extensibility

- **FR-019**: The export/import pipeline MUST be organized as a registry of independent sections, each declaring how it is rendered (visible), serialized (embedded), read back, and deduplicated, so new sections can be added without modifying existing sections' logic.
- **FR-020**: Import MUST tolerate format evolution: a file missing sections the current build supports imports the sections it has; a file containing sections the current build does not recognize imports the recognized ones and skips the rest with a note (no failure).

#### Cross-cutting

- **FR-021**: All new interactive controls MUST be real semantic controls with accessible labels and hit targets ≥ 40px (≥ 44px on touch); all new UI MUST use design tokens only (no hardcoded colors).
- **FR-022**: Export and import MUST run entirely client-side (no new server/backend dependency), consistent with the app's static-export + Capacitor delivery.
- **FR-023**: The visible pages MUST correctly render all supported scripts (Latin, Bengali, Japanese, Simplified Chinese, Korean) without missing-glyph artifacts.

### Key Entities *(include if feature involves data)*

- **Ortho Data File**: The exported PDF. Carries a versioned envelope of sections plus a presentation layer. Self-describing (household, timestamp, format version, display language + currency).
- **Export Envelope**: The machine-readable payload embedded in the PDF. A versioned container holding an ordered set of Sections; the authoritative data for re-import. Amounts are canonical USD cents.
- **Section**: A named, self-contained unit of data within the envelope (e.g. `transactions`, `housing`; later `widgets`, `budgets`, `goals`). Knows how to render itself for humans, serialize/read its records, and detect duplicates on import.
- **Transactions Section**: The household's transactions with their canonical fields — amount (USD cents), date, merchant, category, kind, source, notes, owners/payer, and per-owner splits.
- **Housing Section**: Properties and their sub-records — mortgage info, lease info, units, and rental payments — with canonical amounts.
- **Import Result**: The per-section outcome of an import: counts of added, skipped-as-duplicate (by identity vs. by content), and unreadable/unknown sections; drives the summary shown to the user.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can produce a downloadable PDF of their transactions and housing data in under 15 seconds for a typical household (hundreds of transactions), from opening the export panel to file saved.
- **SC-002**: For the default case, exporting takes at most two interactions (open panel → confirm), because language and currency are pre-filled with the current values.
- **SC-003**: A file exported in any of the 6 supported languages × 7 supported currencies (42 combinations) opens legibly, with the chosen script rendered correctly and amounts in the chosen currency.
- **SC-004**: 100% of records survive a full round-trip: export then import into an empty household reproduces every transaction and housing record with identical canonical values (amounts, dates, splits, housing details), independent of the display currency chosen at export.
- **SC-005**: Importing the same file twice results in zero records added on the second import (idempotent), and importing into a fully-overlapping household adds zero records.
- **SC-006**: Importing a non-Ortho or corrupted file results in zero changes to the household and a clear explanatory message 100% of the time.
- **SC-007**: A new data section can be added to both export and import by registering it, with no edits to the transactions or housing section logic (verified by the pipeline's structure and tests).

## Assumptions

- **Supported languages/currencies** are exactly those the app already supports: languages English, বাংলা, Español, 日本語, 简体中文, 한국어 (with "System" resolving to one of these); currencies usd, cad, gbp, eur, jpy, cny, bdt.
- **Canonical store is USD integer cents.** Display currency is a render-time conversion only, using the app's existing rate mechanism; conversions in the visible layer are for reading, never for storage or re-import.
- **Import is additive only in v1.** No delete/merge/overwrite semantics; the file cannot remove or change existing records. Merge/overwrite is explicitly out of scope for this feature.
- **Identity-based dedup is possible** because the app controls the export format and can embed each record's canonical identifier; content-based fuzzy dedup reuses the existing CSV-import duplicate matcher for records lacking an identity match.
- **People/owner resolution**: imported transactions reference people by the household's person model. If an imported record references a person id not present locally, the importer resolves ownership to a sensible default (documented at implementation time — e.g. attribute to the importing user / current person) rather than failing; exact cross-household people remapping is out of scope for v1.
- **Selection scope for v1**: the default and only sections are transactions and housing; a section on/off toggle may be offered but all-on is the expected default. Date-range or partial selection is out of scope for v1.
- **Delivery constraints**: client-side only (Next.js static export + Capacitor), reading from the existing app store; no new backend, schema, or server function. On iOS the file is produced/consumed through the existing share/file mechanisms.
- **The visible PDF layer is a faithful summary; the embedded payload is the source of truth.** If the two ever disagree, import trusts the embedded payload.
- **Reasonable performance envelope**: households are typically 1–4 people with hundreds (not millions) of transactions; the export/import math and rendering are expected to complete interactively at that scale.
