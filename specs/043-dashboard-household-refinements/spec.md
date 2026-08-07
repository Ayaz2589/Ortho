# Feature Specification: Dashboard & Household Refinements

**Feature Branch**: `feat/043-dashboard-household-refinements`

**Created**: 2026-08-07

**Status**: Draft

**Input**: User description: "Remove the broken household balances feature (keep transfers, add a Transfer option to the New form); add a dashboard individual-member view (person dropdown → personal income/expenses/transfers/net for the active scope, using each person's split share); add a last-month comparison to the savings-trend widget's single-month view."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Retire the broken balances feature; keep recording transfers (Priority: P1)

The household "balances" card ("who owes whom", with a "Settle up" shortcut) is being removed because it
computes incorrectly and misleads people. Members must still be able to record a money transfer /
reimbursement from one person to another — so the New-transaction form gains a plain **Transfer** option
(choose the sender, the recipient, and an amount), which is now the direct way to log a transfer.

**Why this priority**: The balances card is actively wrong, so removing it is the most urgent item. But
transfers are a real, kept concept (the individual-member view in Story 2 shows them), so removal must not
strand the only way to create one — the two ship together.

**Independent Test**: Confirm the "who owes whom" balances card no longer appears anywhere; then open the
New-transaction form, pick "Transfer", choose a sender and recipient and an amount, save, and confirm a
transfer transaction is recorded (and still excluded from spending/income totals).

**Acceptance Scenarios**:

1. **Given** any view that previously showed the balances / "who owes whom" card, **When** the user opens
   it, **Then** the balances card and the "Settle up" shortcut are no longer present.
2. **Given** the New-transaction form, **When** the user selects the "Transfer" option, **Then** they can
   choose a sender (from) and recipient (to) household member and enter an amount, and saving records a
   transfer transaction.
3. **Given** a recorded transfer, **When** household income and expense totals are computed, **Then** the
   transfer counts as neither income nor expense (unchanged from today).
4. **Given** an existing transfer transaction, **When** the user opens it, **Then** it still displays and
   can be edited (existing transfer behavior is preserved).

---

### User Story 2 - Dashboard individual-member view (Priority: P1)

On the dashboard, the user can focus on one household member. A person selector (a dropdown near the top)
defaults to **Everyone**. When the user picks a member, a dedicated **personal summary** appears below the
household net hero showing that person's **income**, **expenses**, **transfers**, and **net** for the
currently selected dashboard period (month or range). Choosing "Everyone" again hides the personal summary.
The household net hero is always shown and never changes.

**Why this priority**: This is the headline new capability — letting each member see their own money
picture (including only their share of shared purchases and their transfers) within the existing dashboard.

**Why the math is specific**: Shared purchases must count only the selected person's **share** (not the
full amount), income must be what that person received, and transfers net out money moved between members —
otherwise the personal figures would double-count household spending or misattribute income.

**Independent Test**: On the dashboard, pick a member from the selector and confirm a personal summary row
appears with that member's income, expenses (their split share only), net transfers, and net for the active
period; switch back to "Everyone" and confirm the personal row disappears while the household hero is
unchanged.

**Acceptance Scenarios**:

1. **Given** the dashboard with the selector on "Everyone", **When** the page loads, **Then** no personal
   summary row is shown and the household net hero displays the household totals.
2. **Given** the selector, **When** the user picks a member, **Then** a personal summary row appears below
   the hero showing that member's income, expenses, transfers, and net for the active period.
3. **Given** a member is selected, **When** their expenses are shown, **Then** for each split purchase only
   that member's **share** is counted (their portion, not the full transaction amount).
4. **Given** a member is selected, **When** their transfers are shown, **Then** the transfers figure is the
   net of transfers **received minus** transfers **sent** for the period.
5. **Given** a member is selected, **When** their net is shown, **Then** net = income − their expenses +
   transfers received − transfers sent.
6. **Given** a member is selected, **When** the user changes the dashboard period (month or range), **Then**
   the personal summary recomputes for the new period.
7. **Given** a member is selected, **When** the user switches the selector back to "Everyone", **Then** the
   personal summary row disappears and the household hero remains unchanged.

---

### User Story 3 - Savings-trend last-month comparison (Priority: P2)

When viewing the savings-trend widget for a **single month**, the user also sees **last month's savings**
as a comparison, so they can immediately tell whether they saved more or less than the previous month.

**Why this priority**: A useful enhancement to an existing widget, valuable but not blocking; it depends on
nothing else in this feature.

**Independent Test**: Put the dashboard in single-month view, open the savings-trend widget, and confirm it
shows both the selected month's savings and the previous month's savings for comparison; switch to a
multi-month range and confirm the comparison is not shown (the existing per-month view is unchanged).

**Acceptance Scenarios**:

1. **Given** the dashboard is in single-month view, **When** the savings-trend widget renders, **Then** it
   shows the selected month's savings AND the previous month's savings as a comparison.
2. **Given** single-month view where the previous month has no data available, **When** the widget renders,
   **Then** it shows the current month's savings and a calm "no comparison" indication rather than a wrong
   or alarming value.
3. **Given** the dashboard is in a multi-month range view, **When** the savings-trend widget renders,
   **Then** the last-month comparison is not shown and the existing per-month behavior is unchanged.

---

### Edge Cases

- **Transfer with sender = recipient, or a missing party**: The Transfer form must require a distinct
  sender and recipient and a positive amount before it can be saved.
- **Member with no activity in the period**: The personal summary shows zeros (income $0, expenses $0,
  transfers $0, net $0) calmly — never an error or empty crash.
- **Removed/soft-deleted member**: The selector lists current (active) members; a removed member is not
  offered. (Historical transactions of a removed member are out of scope for the selector.)
- **Person is the only owner of a purchase (no split)**: Their "share" is the full amount — the share math
  degenerates correctly.
- **Negative personal net / negative household net**: Shown via sign and position, never colored red
  (calm design).
- **Single-month view at the earliest month with data**: No previous month exists → the "no comparison"
  path (as above), not a zero that reads as "saved nothing".
- **A transfer where the selected member is neither sender nor recipient**: Contributes nothing to that
  member's transfers figure.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST remove the household "balances" / "who owes whom" summary card and its
  "Settle up" shortcut from all views that currently show it.
- **FR-002**: The system MUST remove the balances (who-owes-whom) computation that backed that card.
- **FR-003**: The system MUST keep member-to-member transfers as a first-class transaction kind: existing
  transfers continue to display, be edited, and be excluded from income/expense totals.
- **FR-004**: The New-transaction form MUST offer a "Transfer" option that lets the user choose a sender and
  a recipient household member and an amount, and record a transfer — without relying on the removed
  balances card.
- **FR-005**: The Transfer option MUST require a distinct sender and recipient and a positive amount before
  it can be saved.
- **FR-006**: The dashboard MUST provide a person selector that defaults to "Everyone" and lists the active
  household members.
- **FR-007**: When a member is selected, the dashboard MUST show a personal summary of that member's income,
  expenses, transfers, and net for the active dashboard period; when "Everyone" is selected, no personal
  summary is shown.
- **FR-008**: The personal summary's expenses MUST count, for each split purchase, only the selected
  member's share (their portion), not the full transaction amount.
- **FR-009**: The personal summary's income MUST be the income attributed to the selected member for the
  period.
- **FR-010**: The personal summary's transfers MUST be the net of transfers received minus transfers sent by
  the selected member for the period.
- **FR-011**: The personal summary's net MUST equal income − the member's expenses + transfers received −
  transfers sent.
- **FR-012**: The personal summary MUST recompute when the dashboard period (month or range) changes, and
  the household net hero MUST remain unchanged and always visible regardless of the selector.
- **FR-013**: In the savings-trend widget's single-month view, the system MUST show the previous month's
  savings alongside the selected month's as a comparison.
- **FR-014**: When the previous month's data is unavailable (e.g., earliest month), the savings-trend
  comparison MUST show a calm "no comparison available" indication rather than a misleading value.
- **FR-015**: In a multi-month range view, the savings-trend widget MUST NOT show the last-month comparison;
  its existing per-month behavior MUST be unchanged.
- **FR-016**: All new user-facing strings MUST be present in all five non-English catalogs (bn/es/ja/zh/ko)
  with English as the key.
- **FR-017**: All money in the personal summary and comparison MUST follow the calm design rules — tabular
  figures, never red for losses/shortfalls, no alarmist states.

### Key Entities *(include if feature involves data)*

- **Transfer (transaction kind)**: A movement of money from one household member (sender) to another
  (recipient). Has an amount and the two parties; counts as neither income nor expense. Already exists; this
  feature changes only how one is *created* (a form option instead of the balances card).
- **Personal summary (derived, not stored)**: For a selected member + active period — their income,
  their share of expenses, net transfers, and resulting net. Computed from existing transactions; not
  persisted.
- **Member selector state (dashboard-local)**: Which member (or "Everyone") is currently focused on the
  dashboard. UI state; not persisted to the database.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The "who owes whom" balances card appears in 0 places in the app after this change.
- **SC-002**: A user can record a member-to-member transfer entirely from the New-transaction form (no
  balances card involved) in under 30 seconds.
- **SC-003**: For any split purchase, the sum of each member's personal-summary expense contribution equals
  the transaction's full amount (no double-counting, no loss of cents).
- **SC-004**: Selecting a member shows that member's income, expenses, net transfers, and net for the active
  period; "Everyone" shows none of it; the household hero is identical in both states.
- **SC-005**: In single-month view, the savings-trend widget shows both the selected and previous month's
  savings; in range view it shows neither comparison (unchanged behavior).
- **SC-006**: Every new user-facing string is present in all five non-English catalogs (no missing keys).
- **SC-007**: No losses/shortfalls anywhere in the new UI are rendered in red.

## Assumptions

- "Income attributed to the member" uses the existing ownership/attribution already carried on income
  transactions (the recipient of the income); no new attribution model is introduced.
- The member selector lists active (non-removed) household members and an "Everyone" default; it is
  dashboard-local UI state and is not persisted across reloads (a reasonable default; persistence is out of
  scope).
- The personal summary reads the same active dashboard period (month/range) already shared across the
  dashboard; it does not introduce its own separate period control.
- "Last month" means the calendar month immediately before the selected single month; if that month has no
  recorded data it is treated as "no comparison available".
- Transfers have no split; a transfer's amount is attributed wholly to the sender→recipient pair.
- No database schema changes: all three changes are computed from existing data and existing transaction
  kinds.
- Removing the balances computation does not affect split math, member management, or the transfer kind
  itself — only the who-owes-whom aggregation and its card are removed.
</content>
