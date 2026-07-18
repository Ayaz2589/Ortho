# Feature Specification: Ledger Atomic Persistence

**Feature Branch**: `feat/ledger-atomic-persistence`

**Created**: 2026-07-18

**Status**: Draft

**Input**: User description: "Ledger atomic persistence: replace the two-step transaction+shares write in store.tsx with a single atomic Postgres RPC (upsert_transaction). Add a DB-level constraint so sum(shares.amount_cents) == transaction.amount_cents. Close the share-less-row path on the unhappy branch. Update the import CLI to use the same write path. This is §9.3 from the commercial readiness backlog — the one blocker before taking payment."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Transaction saves completely or not at all (Priority: P1)

A household member records a new expense split between two people. On a flaky mobile network, the connection drops between the two database writes. Today, the parent transaction row can survive with no share rows attached, leaving the ledger in an unreconciled state that the user cannot detect. After this feature, the entire write either commits together or is cleanly rejected — no half-persisted row can exist.

**Why this priority**: This is the primary integrity guarantee. A money product cannot charge users while ledger rows can silently half-persist. All other stories depend on this invariant being in place first.

**Independent Test**: Create a transaction with valid shares; verify both the transaction and share rows appear together, atomically. Verify that a crafted invalid payload (shares that do not sum to the transaction amount) is rejected at the database layer — no partial row is written.

**Acceptance Scenarios**:

1. **Given** a valid transaction and shares that sum correctly, **When** the household member saves, **Then** both the transaction row and all share rows are committed together in a single operation, and the ledger immediately reflects the correct split.
2. **Given** a valid transaction and shares, **When** any failure occurs during the write, **Then** neither the transaction row nor any share rows are persisted — the ledger remains unchanged.
3. **Given** share amounts that do not sum to the transaction amount, **When** the save is attempted, **Then** the database rejects the write with an integrity error and no row is written.

---

### User Story 2 — Editing a transaction replaces shares atomically (Priority: P1)

A household member edits an existing expense — changing the amount or the split — and saves. Today the update writes the parent row first, then deletes old shares and inserts new ones; a partial failure can leave the parent updated but shares stale or absent. After this feature, the update is a single atomic replace.

**Why this priority**: Edit is as common as create; a ledger with an updated amount but stale shares silently mis-states what each person owes. Equal priority to P1 creation.

**Independent Test**: Edit an existing transaction and confirm the updated transaction row and its new share rows are consistent when read back. Simulate failure mid-edit and confirm the transaction reverts entirely.

**Acceptance Scenarios**:

1. **Given** an existing transaction, **When** a member changes the amount and the split, **Then** the updated transaction and its new shares are committed together and balances recalculate correctly.
2. **Given** an existing transaction, **When** the edit payload carries shares that do not sum to the new amount, **Then** the database rejects the update and the original transaction and shares remain intact.

---

### User Story 3 — Import CLI writes are also atomic (Priority: P2)

A household admin imports a bank statement CSV. Today the CLI writes each transaction's parent row first and shares separately, with no rollback. After this feature, CLI imports use the same atomic write path, so a crash or network drop mid-import cannot leave orphaned parent rows.

**Why this priority**: Less frequent than the interactive write path, but the CLI is how existing users bulk-load data; a silently corrupted import is hard to detect and harder to fix.

**Independent Test**: Run the import CLI against a test CSV; verify that every imported transaction has the correct share rows. Introduce a failure condition mid-import and verify no partial transactions remain.

**Acceptance Scenarios**:

1. **Given** a valid import CSV, **When** the CLI completes, **Then** every transaction in the ledger has exactly the share rows that correspond to its amount, with no share-less rows.
2. **Given** an import where one transaction has mismatched shares, **When** the CLI encounters that row, **Then** that row is rejected and the rest of the import continues; the rejected row is reported to the operator.

---

### User Story 4 — Share-less rows cannot exist (Priority: P1)

At no point — through the app or the CLI — can a transaction row exist in the database without at least one corresponding share row. The database enforces this regardless of the caller.

**Why this priority**: This is the invariant the entire feature is built to guarantee. A constraint enforced only in client code is not a constraint.

**Independent Test**: After all writes go through the atomic path, query the database for transaction rows with no matching share rows; the result must be empty. Attempt to insert a transaction row without shares via a direct database call; the database must reject it.

**Acceptance Scenarios**:

1. **Given** the new schema, **When** any write path is used, **Then** the database enforces that every transaction row has at least one share row and that share amounts sum to the transaction amount.
2. **Given** an existing database with legacy share-less rows (from before this migration), **When** the migration runs, **Then** those legacy rows are either corrected or the migration provides a remediation strategy for the operator.

---

### Edge Cases

- What happens when a transaction has a single owner? The single share row must equal the full amount; the constraint still applies.
- What happens when a transaction amount is zero? Shares must still sum to zero; the database constraint must handle this correctly.
- What happens when the RPC is called with an empty shares array? The write must be rejected — a transaction with no owners is invalid.
- How does a partial import failure (one bad row in a CSV) affect the surrounding rows? Each transaction's write is independently atomic; a bad row is skipped and does not roll back already-committed rows.
- What happens to existing transactions that were written before this migration? They must remain readable; the migration must not corrupt historical data.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose a single database-level operation that writes a transaction row and all its share rows together, such that both succeed or neither is persisted.
- **FR-002**: The database MUST enforce that the sum of all share amounts for a transaction equals the transaction's total amount, rejecting any write that violates this.
- **FR-003**: The database MUST enforce that every transaction row has at least one share row; a transaction with no shares cannot exist.
- **FR-004**: The web app's transaction creation path MUST use the atomic write operation (FR-001) and remove the existing two-step write with client-side compensating rollback.
- **FR-005**: The web app's transaction update path MUST use the atomic write operation (FR-001) and remove the existing two-step write with client-side compensating rollback.
- **FR-006**: The import CLI's transaction write path MUST use the same atomic write operation (FR-001), replacing its current two separate writes with no rollback.
- **FR-007**: When the atomic write is rejected by the database (e.g., shares do not sum to the amount), the caller MUST receive a clear error and no partial data is written.
- **FR-008**: The migration MUST NOT corrupt or remove existing historical transaction and share data.
- **FR-009**: The existing RLS (row-level security) policies on transactions and transaction_shares MUST remain in effect after the migration; the atomic write operation MUST respect household membership authorization.

### Key Entities *(include if feature involves data)*

- **Transaction**: A single financial event. Has an amount in integer cents. Must always have at least one owner share row. Is the parent in the transaction/shares relationship.
- **Transaction Share**: One owner's portion of a transaction. Has an amount in integer cents. The sum of all share amounts for a transaction must equal the transaction's amount_cents. Cannot exist without a parent transaction; a parent transaction cannot exist without at least one share.
- **Atomic Write Operation**: The single callable unit that accepts a transaction and its shares and either commits both or commits neither. Enforces the sum invariant at the database layer.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero transaction rows without corresponding share rows exist in the database after the migration and all future writes, verifiable by a direct database query.
- **SC-002**: Zero share-less transactions can be produced by any write path (app or CLI) regardless of network conditions or mid-write failure, verified by adversarial testing.
- **SC-003**: The database rejects 100% of write attempts where share amounts do not sum to the transaction amount, returning an error to the caller with no partial write.
- **SC-004**: All existing transaction and share data is readable and structurally unchanged after the migration runs.
- **SC-005**: The web app's transaction creation and edit flows continue to work end-to-end for household members (no regression in happy-path behavior).
- **SC-006**: The import CLI can import a valid bank statement CSV and produce correctly-split transactions with no share-less rows.

## Assumptions

- The sum invariant is enforced in integer cents; no floating-point rounding is needed in the constraint.
- The atomic write operation runs with the authenticated user's permissions, so existing RLS policies (which gate access by household membership) continue to apply without a service-role bypass.
- The import CLI currently runs with a service-role key (`--admin` mode) that bypasses RLS; the atomic write operation must be callable from both user-role and service-role contexts.
- Existing transactions in the database before this migration are assumed to already have correct share rows (the prior client-side rollback path, while imperfect, succeeded for the vast majority of writes). A scan for share-less rows at migration time will identify any exceptions.
- Multi-currency is out of scope: all amounts are USD cents, consistent with the existing finance model.
- The feature does not change how splits are calculated — only how the result is persisted. The split computation logic in `web/lib/splits.ts` is unchanged.
- The web UI surfaces database-layer errors to users with the same error-display mechanism as today; no new error UI is needed.
