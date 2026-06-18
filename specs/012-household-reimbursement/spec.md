# Feature Specification: Household reimbursement & settle-up

**Feature Branch**: `012-household-reimbursement`

**Created**: 2026-06-18

**Status**: Draft

**Input**: User description: "In the transactions/expense section, let household members transfer money to another household member — the real workflow being: one person fronts the bills, the other reimburses their share at month-end. Both iOS and web, kept in lockstep. Update PARITY.md."

## User Scenarios & Testing *(mandatory)*

Today Ortho splits an expense into per-owner **shares** (who is *responsible* for what portion) but never records who actually **paid** (fronted the cash), and there is no notion of one member owing another. The common household reality — one person pays the bills and the other reimburses their share later — has nowhere to live. This feature makes it first-class: record who paid, derive a running "who owes whom" balance, and let a member settle it with a reimbursement that does **not** distort the household's spending or income numbers.

### User Story 1 - Record who paid an expense (Priority: P1)

When adding or editing an expense, the person records **who paid** for it. It defaults to the person entering it (so the everyday case needs no extra step), and can be changed for the occasions when someone else paid.

**Why this priority**: Without knowing who fronted the cash, no balance can exist — this is the missing fact the whole feature rests on. It is independently valuable: even before any balance UI, an expense now carries an accurate payer.

**Independent Test**: Add an expense; confirm the payer defaults to you; change it to another member; reload and confirm it persisted. Confirm existing (historical) expenses show a payer (the person who created them).

**Acceptance Scenarios**:

1. **Given** a household with two members, **When** the person adds an expense, **Then** the payer defaults to them and the expense saves with that payer.
2. **Given** an expense being edited, **When** the person changes the payer to another member, **Then** the new payer persists through save and reload.
3. **Given** expenses that existed before this feature, **When** the data loads, **Then** each has a payer set to its original creator.

---

### User Story 2 - See the running balance (who owes whom) (Priority: P1)

The person sees, in the transactions/expense area, a clear statement of the net amount owed between them and each other member — "Tasnuva owes you $50" / "You owe Tasnuva $50" / "Settled".

**Why this priority**: This is the headline value — knowing, at a glance, what's owed. It depends on US1 (who paid) and is reduced by US3 (reimbursements), but the balance itself is the thing the user asked for.

**Independent Test**: Create the worked example — a $150 expense split you $100 / the other member $50, paid by you — and confirm the balance reads "the other member owes you $50". Change shares or the payer and confirm the balance updates accordingly.

**Acceptance Scenarios**:

1. **Given** a $150 expense split you $100 / Tasnuva $50, paid by you, **When** the balance is shown, **Then** it reads "Tasnuva owes you $50".
2. **Given** the same expense but paid by Tasnuva, **When** the balance is shown, **Then** it reads "You owe Tasnuva $100" (your share of an expense she fronted).
3. **Given** several expenses with mixed payers, **When** the balance is shown, **Then** it is the single net amount per other member (their shares of what you paid minus your shares of what they paid, minus reimbursements).
4. **Given** the same data on iOS and web, **When** the balance is shown, **Then** both surfaces show the same amount and direction.

---

### User Story 3 - Settle up / record a reimbursement (Priority: P1)

When a member pays the other back, they record a **reimbursement** — a directed money movement from the ower to the payer. A "Settle up" action pre-fills the currently-owed amount (editable). The reimbursement reduces the balance and is **not** counted as spending or income.

**Why this priority**: Without it the balance only ever grows; settling is half the workflow. It depends on US2 (a balance to reduce).

**Independent Test**: With "Tasnuva owes you $50", record a $50 reimbursement from Tasnuva to you; confirm the balance becomes "Settled" and that no spending/income/budget/per-owner number changed.

**Acceptance Scenarios**:

1. **Given** "Tasnuva owes you $50", **When** a $50 reimbursement from Tasnuva to you is recorded, **Then** the balance becomes $0 / Settled.
2. **Given** a reimbursement is recorded, **When** the spending, income, budget, insight, and per-owner-spend figures are checked, **Then** none of them changed.
3. **Given** a reimbursement exists, **When** the activity list is viewed, **Then** it appears as a directed transfer ("Tasnuva → Ayaz $50"), visually distinct from expenses and income.
4. **Given** a partial reimbursement (less than owed), **When** it is recorded, **Then** the balance is reduced by exactly that amount and shows the remaining owed.

### Edge Cases

- **Payer is not an owner of the expense** (e.g. you pay for something only the other member owns): the full amount is owed to you.
- **Payer is an owner**: the payer's own share is owed by no one; only the other owners owe their shares to the payer.
- **Self-only expense paid by self**: contributes nothing to any balance.
- **Over-reimbursement** (paying back more than owed): the net balance flips direction (the recipient now owes the sender the overage).
- **Removed member with an open balance**: the balance and historical rows still render with that member's name.
- **More than two members**: the balance is a single net amount **per other member** relative to the viewer.
- **Transfer parties**: a reimbursement's sender and recipient must be two different members.
- **Display currency**: amounts honor the viewer's display-currency setting, the same as every other money figure.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each expense MUST record which household member paid it, defaulting to the member entering it and editable to any other member.
- **FR-002**: Expenses created before this feature MUST be assigned a payer (their original creator) so balances are computable from history.
- **FR-003**: The system MUST derive a net balance between members: for each expense, every owner who is not the payer owes the payer that owner's share; these are summed and netted across all expenses, then reduced by reimbursements.
- **FR-004**: The balance MUST be presented in the transactions/expense section as a clear directional statement per other member ("X owes you $Y", "You owe X $Y", or "Settled").
- **FR-005**: Users MUST be able to record a reimbursement — a directed transfer from one member (sender/ower) to another (recipient/payer) — including a "Settle up" entry point that pre-fills the currently-owed amount and remains editable.
- **FR-006**: A reimbursement MUST NOT be counted in any spending, income, budget, insight, or per-owner-spending total on either surface.
- **FR-007**: A reimbursement MUST appear in the activity list and detail as a directed transfer (sender → recipient) and be distinguishable from expenses and income.
- **FR-008**: The balance MUST reflect additions, edits, and deletions of expenses (amount/shares/payer) and reimbursements without a manual refresh.
- **FR-009**: iOS and web MUST compute the same balance (amount and direction) for the same data, enforced by shared automated tests.
- **FR-010**: Behavior MUST be consistent across iOS (canonical) and web (mirror).
- **FR-011**: The reimbursement amount MUST be a positive amount in the household's money unit, and its sender and recipient MUST be two different members.
- **FR-012**: The cross-surface parity record (PARITY.md) MUST document the new capability and the extended transaction-kind / category taxonomy and filtering.
- **FR-013**: The balance computation MUST be covered by automated tests on both surfaces; both suites MUST stay green.

### Key Entities *(include if feature involves data)*

- **Expense payer**: the household member who fronted a given expense. Defaults to the creator; one per expense; meaningful only for expenses.
- **Member balance**: a derived, net amount owed between two members (shown per other member relative to the viewer). Not stored — computed from expense shares + payers minus reimbursements.
- **Reimbursement (transfer)**: a recorded directed money movement from a sender (ower) to a recipient (payer) that reduces a balance. It is neither spending nor income and carries no split.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Recording who paid costs zero extra steps in the common case (defaults to the entering member) and is changeable in at most two interactions.
- **SC-002**: For any dataset, the displayed balance equals (other members' shares of expenses you paid) − (your shares of expenses they paid) − (net reimbursements). Verified by the worked example: $150 expense (you $100 / Tasnuva $50, you paid) → "Tasnuva owes you $50"; a $50 reimbursement → "Settled".
- **SC-003**: Recording a reimbursement changes the balance by its amount and changes the spending, income, budget, and per-owner-spending figures by exactly zero.
- **SC-004**: iOS and web display the same balance (amount and direction) for the same data, every time.
- **SC-005**: Both automated test suites stay green and the balance logic is covered on both surfaces.
- **SC-006**: PARITY.md shows the reimbursement/settle-up capability as in parity (iOS ✅ / web ✅).

## Assumptions

- iOS is the canonical surface; web mirrors it.
- Household membership is small; the balance is presented as a single net amount per other member relative to the viewer (two members → one number), generalizing to pairwise netting.
- The payer of an expense defaults to the member who creates it; pre-existing expenses are backfilled to their creator.
- A reimbursement is a distinct kind of entry (a directed transfer from ower to payer), excluded from all spending/income aggregates, and carries no per-owner split.
- The underlying data change is additive and reversible.
- The balance is a ledger computation between household members, not an actual money transfer (no payment integration).
- Money is stored in USD cents and converted for display; the new balance/reimbursement math reuses the cents invariant and is mirrored across the two clients and locked by shared golden vectors.

## Out of Scope

- Full "Splitwise"-style settling: multi-party debt graphs, debt-simplification algorithms, or multi-currency settlement. Only a single net balance per member pair.
- Real payment rails / actually moving funds — this is a ledger note only.
- Bulk editing of historical payers beyond the default backfill plus per-row edits.
- A dashboard redesign — the balance lives in the transactions/expense section for this version; a dashboard surface can follow later.
- Any change to the existing split math itself — it stays expense/income-only and untouched.
