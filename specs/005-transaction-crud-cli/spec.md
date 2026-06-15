# Feature Specification: Transaction CRUD make commands (CLI)

**Feature Branch**: `004-bank-statement-import` (continues the CLI work)

**Created**: 2026-06-15

**Status**: Draft

**Input**: User description: "add various make commands for the CLI tool … full CRUD functionality for transactions" (the local-users portion was explicitly dropped).

## Overview

The import CLI (spec 004) can currently only *create* transactions, and only by importing a statement. This feature gives the operator the other three operations — **list/read, create-by-hand, edit, and delete** — as `make` commands, so they can manage their Ortho transactions from the terminal without opening the app. Everything they create or change is identical to app-entered data (same fields, scope, owners, splits) and obeys the same access rules.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - List my transactions (Priority: P1)

The operator runs a command and sees a clean, money-aligned table of their transactions, newest first, optionally narrowed by month, category, source, scope, or kind. Read-only — nothing changes.

**Why this priority**: Reading is the foundation — you can't safely edit or delete what you can't first find and identify (you need the id). It's also the most-used operation and entirely non-destructive.

**Independent Test**: Run the list command (with and without filters) against a test/local database and confirm the rows shown match what's in the database, in the right order, with correctly formatted amounts; filters narrow the set as expected.

**Acceptance Scenarios**:

1. **Given** the operator has transactions, **When** they run the list command with no filters, **Then** their transactions print newest-first with id, date, merchant, amount (money-formatted, income with `+`, cost with `−`), category, scope, and source.
2. **Given** a month filter, **When** listing, **Then** only transactions whose date falls in that month appear.
3. **Given** category/source/scope/kind filters, **When** combined, **Then** only transactions matching *all* supplied filters appear.
4. **Given** a result limit, **When** listing, **Then** at most that many rows are shown.
5. **Given** no transactions match, **When** listing, **Then** a short "no transactions" message prints (not an error).

---

### User Story 2 - Add a transaction by hand (Priority: P2)

The operator creates a single transaction from the terminal — merchant, amount, and optionally date, category, kind, scope. It's validated the same way the app validates, then written so it shows up in both apps. Multi-owner (shared) creation lets them pick owners and a split.

**Why this priority**: The natural next step after reading — capturing a one-off the import didn't cover (e.g. a cash expense). Depends on the same write/validation path edit will reuse.

**Independent Test**: Create a transaction with given fields, confirm it persists with exactly those values (amount in cents, correct date, category, scope); create a shared one with a 70/30 split and confirm the per-owner shares persist.

**Acceptance Scenarios**:

1. **Given** a merchant and a valid amount, **When** adding, **Then** a personal transaction is created owned by the operator with that merchant, amount (in cents), today's date (unless given), and a default or supplied category.
2. **Given** an amount that is zero, negative, or unparseable, **When** adding, **Then** the command rejects it and nothing is written.
3. **Given** an empty merchant, **When** adding, **Then** the command rejects it.
4. **Given** a category that isn't one of the allowed categories, **When** adding, **Then** the command rejects it (or re-prompts).
5. **Given** shared scope with two owners and a 70/30 split, **When** adding, **Then** a shared transaction is created with per-owner shares of 70 and 30.
6. **Given** any required field is missing on the command line, **When** adding interactively, **Then** the operator is prompted for it before anything is written, and a final confirmation is required.

---

### User Story 3 - Edit a transaction (Priority: P2)

The operator names a transaction by id, sees its current values, changes one or more fields (merchant, amount, category, date, kind, scope, owners, split), confirms, and the change is saved — including converting a personal transaction to shared (or back) with correct shares.

**Why this priority**: Correcting an imported or hand-entered row (wrong category, wrong amount, needs a split) is a common need. Reuses the create/validation/write path.

**Independent Test**: Edit a transaction's category and amount, confirm only those fields changed and the rest are intact; change a personal transaction to a 50/50 shared one and confirm shares are written and scope/household updated.

**Acceptance Scenarios**:

1. **Given** a valid id the operator can access, **When** editing, **Then** current values are shown and the operator can change any editable field.
2. **Given** edits and a confirmation, **When** saved, **Then** exactly the changed fields are updated and unchanged fields are preserved.
3. **Given** the operator aborts the edit, **When** they decline, **Then** the transaction is left exactly as it was.
4. **Given** an id that doesn't exist or isn't accessible, **When** editing, **Then** a clear "not found" message prints and nothing changes.
5. **Given** a change from personal to shared with owners + split, **When** saved, **Then** scope, household, and per-owner shares are all updated consistently; changing back to personal removes the shares.

---

### User Story 4 - Delete a transaction (Priority: P3)

The operator names a transaction by id, sees it, and after an explicit confirmation it's permanently removed (along with its shares). A preview mode shows what would be deleted without removing anything.

**Why this priority**: Useful but the most dangerous and least frequent; gated last behind the strongest confirmation.

**Independent Test**: Delete a transaction by id after confirming and verify it (and its shares) are gone; run the preview mode and verify nothing is removed.

**Acceptance Scenarios**:

1. **Given** a valid id, **When** deleting and confirming, **Then** the transaction and its shares are removed and a summary of what was deleted prints.
2. **Given** the preview mode, **When** running delete, **Then** the transaction is shown but nothing is removed.
3. **Given** the operator declines the confirmation, **When** prompted, **Then** nothing is removed.
4. **Given** an id that doesn't exist or isn't accessible, **When** deleting, **Then** a clear "not found" message prints and nothing is removed.

---

### Edge Cases

- **Access scope**: in normal sign-in, the operator can only list/edit/delete their *own* transactions; an id they don't own reads as "not found." An elevated mode can act on any row.
- **Amount precision**: amounts entered as dollars convert to exact integer cents (no floating-point drift).
- **Date stability**: a date entered as a day is stored so it groups under that same day in both apps regardless of timezone.
- **Month filter across year boundary**: `2025-12` returns only December 2025.
- **Shared with one owner**: choosing "shared" but only one owner falls back to personal (a share of one is just personal).
- **Split must total 100**: a custom split that doesn't sum to 100% is rejected and re-prompted.
- **Empty result**: listing or filtering to nothing is a normal, non-error outcome.
- **Concurrent edit**: editing a row that was changed elsewhere writes the operator's values (last-write-wins); no merge is attempted.

## Requirements *(mandatory)*

### Functional Requirements

**Read / list**
- **FR-001**: The operator MUST be able to list their transactions via a command, newest first, showing at least: a short id, date, merchant, amount (money-formatted with income `+` and cost `−`), category, scope, and source.
- **FR-002**: The list MUST support optional, combinable filters: month, category, source, scope, kind, and a result limit.
- **FR-003**: Listing MUST be read-only and require no confirmation.
- **FR-004**: An empty result MUST print a short, non-alarmist message, not an error.

**Create**
- **FR-005**: The operator MUST be able to create a single transaction, supplying merchant and amount, and optionally date, category, kind, scope, and source.
- **FR-006**: Creation MUST validate inputs the same way the app does: amount parses to a positive integer-cent value, merchant is non-empty, category is one of the allowed categories; invalid input is rejected and nothing is written.
- **FR-007**: Date MUST default to today (stored timezone-stably so it groups under the correct day), and category to a sensible default when omitted.
- **FR-008**: A created transaction MUST default to personal scope owned by the operator; choosing shared scope MUST let the operator select owners and a split (even by default, custom must total 100%) and persist per-owner shares.
- **FR-009**: Any required field not given on the command line MUST be prompted for, and creation MUST require an explicit confirmation before writing.

**Update**
- **FR-010**: The operator MUST be able to edit an existing transaction by id, seeing its current values first.
- **FR-011**: Editing MUST allow changing merchant, amount, category, date, kind, scope, owners, and split, applying the same validation as creation.
- **FR-012**: Saving an edit MUST update only the changed fields and preserve the rest; aborting MUST leave the transaction unchanged.
- **FR-013**: Converting between personal and shared MUST keep scope, household association, and per-owner shares consistent (shares written for shared, removed for personal).

**Delete**
- **FR-014**: The operator MUST be able to delete a transaction by id; its shares MUST be removed with it.
- **FR-015**: Deletion MUST require an explicit confirmation and MUST support a preview mode that writes nothing.
- **FR-016**: After a delete, the tool MUST report what was removed.

**Cross-cutting**
- **FR-017**: All commands MUST authenticate as the operator the same way the import command does; in normal mode the operator may only act on their own transactions, with an elevated mode to act on any.
- **FR-018**: A transaction created or edited via these commands MUST be indistinguishable from one entered in the app (same fields, scope, ownership, splits) in both clients.
- **FR-019**: An id that doesn't exist or the operator can't access MUST produce a clear "not found" message with no change.
- **FR-020**: All money MUST be handled as integer cents end-to-end; all money/date conversions MUST be covered by deterministic tests.

### Key Entities *(include if feature involves data)*

- **Transaction (persisted)**: the app's existing transaction record (merchant, category, kind, scope, amount in cents, source, date, creator, optional household) — the single thing these commands read and mutate.
- **Per-owner Share**: the percentage of a shared transaction attributed to each owner; totals 100%.
- **List filter**: the set of optional narrowing criteria (month, category, source, scope, kind, limit) applied to a read.
- **Owner / Account**: an existing app user who can own or share a transaction; multi-owner requires shared household membership.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The operator can find a specific transaction and obtain its id in under 30 seconds via the list command and its filters.
- **SC-002**: A transaction created or edited from the terminal appears in both the web and iOS apps with identical fields, category, scope, owners, and splits.
- **SC-003**: No transaction is ever created, changed, or deleted without passing validation and an explicit operator confirmation.
- **SC-004**: Deletion in preview mode removes nothing 100% of the time.
- **SC-005**: Every money and date transformation (cents conversion, date handling, month-range filtering, split math) is covered by deterministic tests that pass with a single command.
- **SC-006**: In normal mode, the operator can only see, edit, or delete their own transactions (0 access to others' rows).

## Assumptions

- **Builds on spec 004**: reuses the existing CLI's sign-in (email OTP), the app's transaction model, money/split helpers, and the established write shapes; this feature adds read/update/delete and a manual create alongside the existing import.
- **Interactive, single operator**: run by one trusted operator in a terminal on their own machine; not a hosted/multi-tenant service.
- **Access model**: normal mode is scoped to the operator's own transactions (enforced by the backend's row-level security); an elevated mode (already used by the importer) can act on any row.
- **Shared/split persistence**: only real app accounts who share a household can be owners of a shared/split transaction (consistent with 004; local users remain out of scope).
- **Money & dates**: amounts are integer USD cents; dates are stored timezone-stably (noon) so day-grouping is correct in both apps.
- **Conflict handling**: last-write-wins on edit; no optimistic-concurrency or merge in v1.
- **No bulk/undo**: operations act on one transaction at a time (lists aside); bulk edit/delete and undo/history are out of scope.
