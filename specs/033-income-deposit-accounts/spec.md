# Feature Specification: Income Deposit Accounts

**Feature Branch**: `feat/income-deposit-accounts`

**Created**: 2026-07-30

**Status**: Draft

**Input**: User description: "Income deposit accounts — replace the hardcoded INCOME_SOURCES constant in TxForm.tsx with a user-configurable deposit_accounts table (mirrors the cards table). Users can add/delete deposit account names (e.g. 'Chase Checking', 'Joint Savings') in Settings. The 'Deposit to' dropdown in income transactions shows their configured accounts instead of hardcoded strings. No changes to the transactions schema — source already stores the string name."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Configure Deposit Accounts in Settings (Priority: P1)

A household member opens Settings and navigates to a new "Deposit Accounts" section. They add the accounts where income lands (e.g. "Chase Checking", "Joint Savings", "HYSA"). They can also delete accounts they no longer use.

**Why this priority**: This is the prerequisite for everything — without configuring accounts, the "Deposit to" picker in the transaction form remains empty or hardcoded.

**Independent Test**: Navigate to Settings → Deposit Accounts, add "Chase Checking", confirm it appears in the list. Delete it, confirm it disappears.

**Acceptance Scenarios**:

1. **Given** the Settings screen is open, **When** the user taps "Deposit Accounts", **Then** they see a list of their configured deposit accounts (empty on first use) and an "Add account" row.
2. **Given** the Deposit Accounts list is open, **When** the user enters "Chase Checking" and taps Add, **Then** "Chase Checking" appears in the list immediately.
3. **Given** "Chase Checking" exists in the list, **When** the user deletes it, **Then** it is removed from the list.
4. **Given** no household is resolved (personal-only user), **When** the user opens Deposit Accounts, **Then** the "Add account" row is disabled (same guard as cards).

---

### User Story 2 — Pick a Deposit Account on an Income Transaction (Priority: P1)

When logging or editing an income transaction, the "Deposit to" field shows the user's configured deposit accounts instead of the hardcoded list. The user picks the account where that income landed.

**Why this priority**: This is the core end-user value — income transactions gain meaningful, personalised deposit-account context.

**Independent Test**: With "Chase Checking" and "Joint Savings" configured, open the New Transaction form, set kind to Income, and confirm the "Deposit to" dropdown lists exactly those two accounts.

**Acceptance Scenarios**:

1. **Given** deposit accounts "Chase Checking" and "Joint Savings" are configured, **When** the user opens a new Income transaction, **Then** the "Deposit to" dropdown lists "Chase Checking" and "Joint Savings" (not the old hardcoded strings).
2. **Given** no deposit accounts are configured, **When** the user opens a new Income transaction, **Then** the "Deposit to" field shows a "No accounts yet" placeholder (same pattern as the expense "No cards yet" state).
3. **Given** an existing income transaction was saved with a now-deleted account name, **When** the user opens that transaction for editing, **Then** the deleted name is shown as-is in the dropdown (orphan-value passthrough, same as cards).
4. **Given** deposit accounts are configured, **When** the user switches the transaction direction from Expense to Income, **Then** the source field switches to show deposit accounts (not the cards list).
5. **Given** deposit accounts are configured, **When** the user switches from Income to Expense, **Then** the source field switches back to the cards list.

---

### User Story 3 — Deposit Account Persists on Save and Copy (Priority: P2)

The selected deposit account name is stored on the transaction's `source` field and restored correctly on edit and copy-from-most-common.

**Why this priority**: Data integrity — the picked account must survive a round-trip through save, reload, edit, and copy.

**Independent Test**: Log an income transaction with "Chase Checking". Reload, open for edit — confirm "Deposit to" still shows "Chase Checking". Copy from most common — confirm the copied form pre-fills "Chase Checking".

**Acceptance Scenarios**:

1. **Given** the user saves an income transaction with "Joint Savings" selected, **When** they reopen it for editing, **Then** "Deposit to" shows "Joint Savings".
2. **Given** a saved income transaction with "Joint Savings", **When** the user copies it via "Copy from most common", **Then** the copied form pre-fills "Joint Savings" in "Deposit to".
3. **Given** an income transaction with source = "ACH · Checking" (a legacy hardcoded value), **When** the user views it, **Then** the orphan value is displayed as-is, not blank.

---

### Edge Cases

- What happens when a user deletes a deposit account that is already referenced by saved income transactions? → The stored `source` string on those transactions is untouched (same as the cards pattern); they retain their value and the orphan is shown verbatim on next edit.
- What happens when the first deposit account is added while the income form is open? → The form re-reads the store's `depositAccounts` reactively; the new account appears without requiring a reload.
- What happens when the household has no members yet (onboarding)? → The "Add account" button is disabled, same guard as cards.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a household-scoped list of deposit account names, persisted server-side, that users can add to and delete from.
- **FR-002**: The Settings screen MUST include a "Deposit Accounts" entry that opens a dedicated management page.
- **FR-003**: The management page MUST display all configured deposit account names in creation order, with a delete action per row and an "Add account" affordance.
- **FR-004**: The "Add account" affordance MUST be disabled when no household is resolved (mirrors the cards guard).
- **FR-005**: The income transaction form's "Deposit to" field MUST source its options from the user's configured deposit accounts, not from a hardcoded list.
- **FR-006**: When no deposit accounts are configured, the "Deposit to" field MUST show a "No accounts yet" placeholder (mirroring the expense "No cards yet" state).
- **FR-007**: A deposit account name that is referenced by saved transactions but has since been deleted MUST still appear verbatim in the "Deposit to" dropdown when editing those transactions (orphan-value passthrough).
- **FR-008**: The selected deposit account name MUST be stored in the existing `source` field on the transaction — no new column is required.
- **FR-009**: The deposit accounts list MUST be reactive: changes (add/delete) MUST immediately reflect in any open income transaction form without requiring a page reload.
- **FR-010**: All user-facing strings (section title, modal title, placeholder text, helper copy) MUST be internationalised across all 6 supported languages.
- **FR-011**: Expense transactions MUST be unaffected — the "Paid with" field continues to source from the `cards` table exactly as before.

### Key Entities

- **Deposit Account**: A household-scoped, user-defined name for a bank account where income is received (e.g. "Chase Checking"). Has a unique id, belongs to a household, carries a display name, and records creation time. Fully analogous to `Card` in the expense flow.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can add a named deposit account in Settings and immediately see it available in the "Deposit to" dropdown on a new income transaction — end-to-end in one session, no reload required.
- **SC-002**: An income transaction saved with a deposit account name displays that exact name when reopened for editing.
- **SC-003**: Deleting a deposit account in Settings does not alter any existing income transaction's stored source value.
- **SC-004**: Expense transactions ("Paid with" / cards flow) are entirely unaffected — all existing expense tests pass without change.
- **SC-005**: The feature works identically across all 6 supported languages (English, Spanish, French, German, Japanese, Portuguese).

## Assumptions

- Deposit account names are free-form text (no type/subtype enum needed in v1).
- A single household-wide list of deposit accounts is sufficient; per-member accounts are out of scope.
- The existing `source` field on `transactions` (already a free-text string) is the correct storage for the chosen deposit account name — no schema migration to the transactions table is needed.
- The new `deposit_accounts` table is household-scoped and mirrors the `cards` table in structure and RLS policy.
- The feature is additive: households with no deposit accounts configured see the "No accounts yet" placeholder; the old hardcoded strings are removed entirely (not kept as fallback).
- Seed data and import pipelines that currently write `source` values for income transactions may produce orphan names — this is acceptable and already handled by the orphan-value passthrough.
