# Feature Specification: Bank-Statement PDF Import CLI

**Feature Branch**: `004-bank-statement-import`

**Created**: 2026-06-15

**Status**: Draft

**Input**: User description: "create a CLI tool using make to upload transactions directly to the db … using bank statement [PDFs] … the CLI tool will [let] me assign owners to the transaction. it could be an individual user or multiple users. if it is multiple users let me choose the transaction split" — with the follow-up decision to **codify** the parsing (deterministic, no LLM), behind a shared engine + thin per-bank profiles, auto-detecting the bank from the statement.

## Overview

A command-line tool, run through `make`, that reads a bank-statement **PDF**, extracts its transactions deterministically, lets the operator review/categorize/assign ownership (including splitting a transaction across multiple people), and writes the results into the same database the web and iOS apps use — so imported activity behaves exactly like activity entered by hand in either app. It replaces a one-off, hand-transcribed importer with a repeatable, testable tool.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preview a statement before anything is written (Priority: P1)

The operator points the tool at a bank-statement PDF. The tool recognizes which bank it is, extracts every transaction, suggests a spending category for each, flags rows that are not real spending (internal transfers, credit-card bill payments, investment moves), and prints a clear preview — **without writing anything to the database**. Before trusting any numbers, the tool checks the transactions it extracted against the bank's own printed section subtotals and refuses to continue if they disagree.

**Why this priority**: This is the foundation and the trust anchor. Parsing a real statement correctly — and proving it against the bank's own totals — is the hard part and the source of all value. On its own it lets the operator verify the tool reads their statement accurately before any data is at stake.

**Independent Test**: Run the tool in dry-run mode against the sample TD Bank statement and confirm the previewed transactions, categories, exclusion flags, and reconciliation result match the known-good expected output (golden fixture). No database access required.

**Acceptance Scenarios**:

1. **Given** a supported bank statement PDF, **When** the operator runs the tool in dry-run mode, **Then** it prints the detected bank, a line-itemized preview of every extracted transaction (date, merchant, amount, kind, suggested category, included/excluded), and a per-section reconciliation status.
2. **Given** a statement whose extracted transactions sum to each printed section subtotal, **When** previewed, **Then** reconciliation reports success for every section.
3. **Given** a statement where extracted transactions do **not** sum to a printed subtotal, **When** previewed, **Then** the tool reports the mismatch (section, expected vs. computed) and marks the run as not safe to import.
4. **Given** a PDF from a bank with no matching profile, **When** run, **Then** the tool stops and reports that the bank is unsupported, naming what it looked for — it never guesses.

---

### User Story 2 - Import a statement as my own transactions (Priority: P2)

After a clean preview, the operator commits the import. Each included transaction is written to the database as a personal transaction owned by the statement's account holder, using the correct merchant, amount, category, kind (income vs. expense), and date, and tagged with the source bank. Re-running the same statement does not create duplicates.

**Why this priority**: This delivers the core promised outcome — getting real statement activity into the app — for the common single-owner case. It depends on US1's parsing being trustworthy.

**Independent Test**: Against a test/local database, import the sample statement, verify the expected set of personal transactions exists with correct fields; run the same import again and verify no new rows are created.

**Acceptance Scenarios**:

1. **Given** a previewed, reconciled statement, **When** the operator confirms the import, **Then** every included transaction is persisted as a personal transaction owned by the account holder with merchant, amount (in cents), category, kind, date, and source set correctly.
2. **Given** a transaction already imported from a prior run, **When** the same statement is imported again, **Then** the tool detects the duplicate and skips it, reporting how many were skipped.
3. **Given** a row flagged as non-spending (e.g., a credit-card bill payment or internal transfer), **When** the import runs with default settings, **Then** that row is not written unless the operator explicitly re-included it during review.
4. **Given** the operator wants to change a suggested category during review, **When** they override it, **Then** the persisted transaction uses the chosen category.

---

### User Story 3 - Assign owners and split a transaction across people (Priority: P3)

During review, the operator can reassign a transaction's owner, or assign it to **multiple** people. A single owner produces a personal transaction; multiple owners produce a shared transaction split among them. When multiple owners are chosen, the tool offers an even split by default and lets the operator enter custom percentages that must add up to 100%.

**Why this priority**: This fulfills the explicit "assign owners… choose the split" request, but it is only meaningful once parsing and single-owner import work, and it requires more than one real account to be useful.

**Independent Test**: During review of a parsed statement, assign a transaction to two people with a 70/30 split and confirm the resulting shared transaction carries per-owner shares of 70 and 30 that the apps read back identically; assign another to two people with no custom split and confirm an even split.

**Acceptance Scenarios**:

1. **Given** a transaction in review, **When** the operator assigns a single different owner, **Then** it is persisted as a personal transaction owned by that person.
2. **Given** a transaction in review, **When** the operator assigns two or more owners and accepts the default split, **Then** it is persisted as a shared transaction split evenly among them.
3. **Given** a transaction with multiple owners, **When** the operator enters custom percentages, **Then** the tool accepts them only if they total 100% and persists those exact per-owner percentages.
4. **Given** custom percentages that do not total 100%, **When** entered, **Then** the tool rejects them and re-prompts.
5. **Given** the operator wants to split across people, **When** a second eligible account/household does not exist, **Then** the tool clearly reports that multi-owner splitting is unavailable and continues with single-owner import.

---

### Edge Cases

- **Multi-line / wrapped rows**: a transaction whose description wraps across lines, or whose amount sits on its own line, must still be extracted as one transaction with the right amount.
- **Interleaved amounts**: when two adjacent transactions' amounts appear on consecutive lines, reconciliation against the section subtotal is the safety net that surfaces any mis-grouping.
- **Year inference**: dates printed as month/day must be resolved to the correct calendar year using the statement period, including a statement that spans a year boundary.
- **Thousands separators / decimals**: amounts like `2,800.00` and `24,156.88` must convert to exact cents with no floating-point drift.
- **Ambiguous bank detection**: if more than one profile claims a statement, the tool reports the ambiguity rather than picking arbitrarily; an explicit override forces a specific profile.
- **Empty or image-only PDF**: a PDF with no extractable text is reported as unparseable, not silently treated as zero transactions.
- **Refunds / negative charges**: credits that appear within an expense section are handled with the correct sign/kind.
- **Re-include of an excluded row**: an operator re-including a default-excluded row results in a normal persisted transaction.
- **Partial confirm**: the operator can abort at the review/confirm step with nothing written.

## Requirements *(mandatory)*

### Functional Requirements

**Input & bank detection**
- **FR-001**: The tool MUST accept a path to a bank-statement PDF as input, invoked through a `make` target.
- **FR-002**: The tool MUST identify the source bank automatically from the statement's own content, and MUST print the bank it detected before proceeding.
- **FR-003**: The tool MUST allow the operator to override automatic detection and force a specific bank profile.
- **FR-004**: When no profile matches the statement, the tool MUST stop and report that the bank is unsupported; it MUST NOT attempt a best-effort guess.
- **FR-005**: The tool MUST extract text deterministically from the PDF with no reliance on an external language model or network service for parsing.

**Extraction & reconciliation**
- **FR-006**: The tool MUST extract each transaction's date, description/merchant, amount, and direction (income vs. expense) from the statement.
- **FR-007**: The tool MUST resolve printed month/day dates to a full calendar date using the statement period, correctly handling a period that crosses a year boundary.
- **FR-008**: The tool MUST convert printed amounts (including thousands separators and decimals) into exact integer cents.
- **FR-009**: The tool MUST reconcile the transactions it extracts for each statement section against that section's printed subtotal, and MUST treat any mismatch as a blocking error that prevents import.
- **FR-010**: The tool MUST correctly group transactions whose descriptions wrap across multiple lines or whose amount appears on a separate line.

**Categorization, exclusions, normalization**
- **FR-011**: The tool MUST assign each transaction a spending category from the app's fixed category set using codified merchant-matching rules, falling back to a default category when no rule matches.
- **FR-012**: The tool MUST present each transaction for review and allow the operator to change its category before import.
- **FR-013**: The tool MUST clean up raw bank descriptions into human-readable merchant names.
- **FR-014**: The tool MUST default-flag non-spending rows (internal account transfers, credit-card bill payments, investment transfers) as excluded, while still showing them in the review so the operator can re-include any.

**Ownership & splitting**
- **FR-015**: The tool MUST assign a default owner for each transaction (the statement's account holder; for statements that identify a per-transaction cardholder, that person).
- **FR-016**: The tool MUST let the operator keep the default owner, reassign to a different account, or assign multiple owners during review.
- **FR-017**: A transaction with a single owner MUST be persisted as a personal transaction; a transaction with multiple owners MUST be persisted as a shared transaction split among them.
- **FR-018**: When multiple owners are assigned, the tool MUST default to an even split and MUST let the operator enter custom per-owner percentages.
- **FR-019**: The tool MUST accept custom split percentages only when they total 100%, re-prompting otherwise.
- **FR-020**: When no second eligible account/household exists, the tool MUST report that multi-owner splitting is unavailable and proceed with single-owner import rather than failing.

**Persistence, safety, idempotency**
- **FR-021**: Persisted transactions MUST match the app's existing transaction shape exactly, so imported activity is indistinguishable from app-entered activity in both clients.
- **FR-022**: The tool MUST tag every imported transaction with its source bank.
- **FR-023**: The tool MUST support a dry-run mode that performs detection, extraction, categorization, and reconciliation and prints the full preview **without writing to the database**.
- **FR-024**: The tool MUST detect likely duplicates from prior imports — matching on the same day, amount, and bank (description ignored) — and FLAG them (excluded by default, shown in review so the operator can re-include a genuine separate charge), reporting the count, so re-running a statement is safe.
- **FR-025**: The tool MUST require an explicit confirmation step before writing, and MUST allow the operator to abort with nothing written.
- **FR-026**: The tool MUST report a summary after a run: counts of imported, skipped (duplicate), and excluded transactions, plus reconciliation status.

**Extensibility**
- **FR-027**: Adding support for a new bank MUST require only a new bank profile plus its test fixtures, with no change to the shared engine.

### Key Entities *(include if feature involves data)*

- **Statement**: the source PDF for one account and period; carries the bank identity, the account holder, the statement period (used for date resolution), and the printed section subtotals used for reconciliation.
- **Parsed Transaction (pre-import)**: a single extracted line — date, raw description, cleaned merchant, amount in cents, direction (income/expense), section, suggested category, included/excluded flag, and assigned owner(s) with optional split — before it is written.
- **Transaction (persisted)**: the app's existing transaction record (merchant, category, kind, scope, amount in cents, source, date, owner/creator, optional household) that both clients already read and write.
- **Owner / Account**: an existing app user who can own or share a transaction; multi-owner attribution requires shared membership of a household.
- **Per-owner Share**: the percentage of a shared transaction attributed to each owner; percentages total 100%.
- **Bank Profile**: the per-bank knowledge needed to detect the bank and interpret its layout (section meanings, date format, row grouping, description cleanup).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Importing a month's statement takes the operator under 5 minutes end-to-end, versus hand-transcribing every line.
- **SC-002**: For the supported bank, 100% of extracted sections reconcile to the statement's printed subtotals on a correct statement; any real statement that fails to reconcile is blocked from import rather than imported wrong.
- **SC-003**: Re-running the exact same statement a second time creates zero additional transactions.
- **SC-004**: Imported transactions are indistinguishable from hand-entered ones in both the web and iOS apps (same fields, categories, ownership, and splits display identically).
- **SC-005**: Adding a new bank is achievable by writing only a new profile and its fixtures — demonstrated by the shared engine remaining unchanged when a second bank is added.
- **SC-006**: No transaction is ever written without first passing reconciliation and an explicit operator confirmation.
- **SC-007**: Every money and date transformation (cents conversion, date resolution, split math, reconciliation, duplicate detection) is covered by deterministic tests that pass with a single command.

## Assumptions

- **PDFs first**: v1 handles PDF statements only; CSV import is out of scope (the credit-card CSV export is noted only as a future source).
- **One bank profile in v1**: TD Bank Premier Checking is the only profile, because it is the only available sample statement. The engine is built to be pluggable so additional banks are added later as profiles + fixtures.
- **Text-layer PDFs**: supported statements contain an extractable text layer; OCR of scanned/image-only statements is out of scope (such files are reported as unparseable).
- **Money is USD cents**: all amounts are stored as integer US-dollar cents, consistent with the existing apps.
- **Account-backed splits only**: only people with real app accounts who share a household can be owners of a shared/split transaction; device-only "local users" and personal-transaction splits cannot be written from this tool and are out of scope.
- **Default ownership**: for a single-holder statement the default owner is the account holder; the operator can reassign during review.
- **Default authentication**: the tool authenticates as the operator (the account holder) by default, which yields correct ownership for their own statement; an elevated/admin credential is an optional alternative for attributing rows to other accounts.
- **Default exclusions mirror prior practice**: internal transfers, credit-card bill payments, and investment transfers are excluded by default because the underlying spending is tracked elsewhere; the operator can re-include any during review.
- **Interactive operation**: the tool is run interactively by a single trusted operator on their own machine; it is not a hosted/multi-tenant service.
- **Whether a second account/household currently exists** is unknown at spec time; US3 is built to work when one exists and to degrade gracefully (single-owner) when it does not.
