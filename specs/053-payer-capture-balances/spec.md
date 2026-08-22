# Feature Specification: Payer Capture & Household Balances

**Feature Branch**: `053-payer-capture-balances`

**Created**: 2026-08-16

**Status**: Implemented (FR-014 deferred — see below)

**Input**: User description: "Capture who paid everywhere, then rebuild who-owes-whom. Only manual entry writes paid_by; import, scan and sync leave it null, and nothing reads it. This is the half of the household story people feel most — someone fronted the bill and wants to know they're square. Rebuild it for three or more people, not two."

## Context

Migration `20260618120000_member_reimbursement.sql` added `paid_by` and the `transfer` kind for one
stated purpose: *"so a running 'who owes whom' balance is computable and settle-up reimbursements can
be logged."* Spec 043 then deleted the calculation and the UI as broken, leaving the columns behind.

The reason it was broken is real and worth not repeating: `balanceBetween(viewer, other, …)` was
**viewer-anchored**, so in a three-adult household what one roommate owed another was invisible to the
third. Correct for two people; wrong for Ortho's target household of 2–4 adults.

Meanwhile the capture side never worked either. `paid_by` is assigned in exactly **two lines**
app-wide, both in the transaction form:

| Path | Sets `paid_by`? |
|---|---|
| Manual entry | Yes — `TxForm.tsx:541` (transfer), `:552` (expense) |
| In-app CSV import | **No** — the flow has an owner picker and no payer control |
| Receipt/statement scan | **No** |
| CLI statement import | **No** — passes `?? null`; nothing upstream sets it |
| Bank sync | **No** — writes shares only |

So households that import rather than hand-type have no payer data at all, and the default on the one
path that does write it is the logged-in person — which, under the handler pattern, is the same value
every time.

This feature fixes capture first, then rebuilds the balance for N people.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Who paid is recorded however money gets in (Priority: P1) 🎯 MVP

Someone imports a bank statement or scans a receipt. Today the app records what was bought and who
owes for it, but forgets who actually handed over the money — so no balance can ever be computed from
imported data.

Every ingest path now carries a payer: the import and scan flows offer a payer control alongside the
existing owner control, and bank sync attributes the payer to the person who owns the connected
account.

**Why this priority**: The balance in US2 is only as good as the data beneath it. Rebuilding the
calculation on top of four ingest paths that write null would produce a confidently empty answer.

**Independent Test**: Import a CSV row, set the payer, commit, and confirm the stored transaction
carries that person as `paid_by`; repeat via scan.

**Acceptance Scenarios**:

1. **Given** a CSV import with more than one person in the household, **When** a row is reviewed,
   **Then** a payer control is available and defaults to the person entering the import.
2. **Given** a payer chosen on an import row, **When** the import commits, **Then** the stored
   transaction's `paid_by` is that person.
3. **Given** a scanned receipt, **When** it is committed, **Then** it carries a payer resolved the
   same way a manually entered transaction would.
4. **Given** a bank-synced transaction, **When** it is written, **Then** `paid_by` is the person
   associated with the connected account rather than null.
5. **Given** a one-person household, **When** any path writes a transaction, **Then** the payer is
   that person and no payer control is shown.
6. **Given** an `income` transaction, **When** it is written, **Then** `paid_by` stays null —
   income has no payer (unchanged).

---

### User Story 2 - Everyone can see every balance in the household (Priority: P1)

Three adults share a flat. Amir covered groceries, Priya covered the electric bill, Nasrin has paid
neither back yet. Each of them needs to see the whole picture, not only the pairs they are personally
in.

A **household balances** view lists every outstanding pair — "Amir owes Priya $84" — computed across
all people, visible to everyone in the household, with a settle-up action that pre-fills a transfer
for the exact amount.

**Why this priority**: This is the capability the schema was built for and has never had. It is also
the thing users feel most: someone fronted the bill and wants to know they are square.

**Independent Test**: With three people and a mix of who-paid-what, confirm every non-zero pair
appears with the correct direction and amount, and that the list is the same regardless of who is
signed in.

**Acceptance Scenarios**:

1. **Given** a $60 expense split three ways paid by one person, **When** balances compute, **Then**
   each of the other two owes the payer $20.
2. **Given** three people with debts among all pairs, **When** balances compute, **Then** every
   non-zero pair is listed, including pairs the signed-in user is not part of.
3. **Given** a transfer from a debtor to a creditor for the exact balance, **When** balances
   recompute, **Then** that pair no longer appears.
4. **Given** a partial repayment, **When** balances recompute, **Then** the remaining balance is
   shown with the same direction.
5. **Given** an over-repayment, **When** balances recompute, **Then** the direction flips and the
   excess is shown.
6. **Given** all balances settled, **When** the view renders, **Then** it shows a calm all-settled
   state rather than an empty panel.
7. **Given** a removed person with an outstanding balance, **When** balances compute, **Then** the
   balance is still shown so it can be settled.
8. **Given** a settle-up action, **When** it pre-fills a transfer, **Then** the amount is the exact
   integer balance — never a display-currency round trip.

---

### User Story 3 - Shared income is owed, too (Priority: P3)

When one person receives money that belongs to several — a shared refund, a payment for work two
people did — the others are owed their share. Today income has no balance effect at all.

**Why this priority**: A genuine gap, but far less frequent than shared expenses, and the mechanism
is the mirror of the expense path once that is correct.

**Independent Test**: Record income received by one person and owned by two, and confirm the
recipient owes the co-owner their share.

**Acceptance Scenarios**:

1. **Given** income received by one person and split with another, **When** balances compute,
   **Then** the recipient owes the co-owner their share.
2. **Given** income owned solely by its recipient, **When** balances compute, **Then** no balance
   arises.

---

### Edge Cases

- **A payer who is not an owner.** Their outlay is owed by the owners; the payer's own share is owed
  by nobody. This is existing, vector-locked behavior and must be preserved.
- **A transaction with no payer.** Contributes nothing to any balance — it cannot, since nobody is
  recorded as out of pocket. Historical rows are in this state and must not corrupt the totals.
- **Three or more people.** Balances are computed for every ordered pair, and the matrix must be
  antisymmetric: what A is owed by B is exactly what B owes A.
- **A person is removed.** They still appear in balances they are party to, so an outstanding debt
  stays settle-able.
- **Currency display.** Balances are integer cents internally; the settle-up prefill uses the exact
  cents, never a converted-and-reparsed display amount.
- **Balance scope.** Balances are computed over all transactions ever — they are a standing position,
  not a monthly figure, and must not be affected by the dashboard's time scope.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The in-app CSV import flow MUST offer a payer control per row and persist the choice.
- **FR-002**: The receipt/statement scan path MUST resolve and persist a payer.
- **FR-003**: The CLI import path MUST resolve and persist a payer rather than always writing null.
- **FR-004**: Bank sync MUST attribute a payer from the connected account's owning person.
- **FR-005**: System MUST NOT show a payer control in a one-person household, and MUST still persist
  that person as payer.
- **FR-006**: `income` transactions MUST continue to store a null payer.
- **FR-007**: System MUST compute the balance between every ordered pair of household people, not
  only pairs involving the signed-in user.
- **FR-008**: The balance matrix MUST be antisymmetric — `balance(a,b) === −balance(b,a)`.
- **FR-009**: Expense balances MUST follow the established rule: the payer is owed each other owner's
  share; the payer's own share is owed by nobody.
- **FR-010**: Transfers MUST settle balances directionally between sender and recipient.
- **FR-011**: Shared income MUST create a balance from the recipient to co-owners for their shares.
- **FR-012**: Transactions with a null payer MUST contribute nothing to any balance.
- **FR-013**: System MUST display every non-zero pair balance to every household member.
- **FR-014**: *(DEFERRED — not implemented in this pass.)* System MUST offer a settle-up action
  pre-filling a transfer with the **exact integer cent** balance. The prefill plumbing
  (`TransferPrefill`/`initialTransfer`/`openSettle`/the `transfer` URL param) was removed in spec
  043 and rebuilding it is a change of its own. Users can settle today via the New form's
  existing Transfer kind; the balance list recomputes correctly once they do, which is covered
  by the settle-to-zero and partial/over-repayment tests.
- **FR-015**: System MUST include removed people in balances they are party to.
- **FR-016**: Balance computation MUST be pure, deterministic and side-effect free, over all
  transactions regardless of the active time scope.

### Key Entities

- **Payer**: the household person who fronted the money for a transaction. One per transaction,
  nullable, meaningless for income.
- **Pair balance**: the net integer-cent position between two people, positive in one direction and
  negative in the other.
- **Settlement**: an existing `transfer` transaction that moves a balance toward zero.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All four previously payer-blind ingest paths persist a non-null payer for expense
  transactions in a household with at least one person.
- **SC-002**: In a three-person household, every non-zero pair balance is visible to every member —
  including pairs the viewer is not part of.
- **SC-003**: The balance matrix is antisymmetric for every generated scenario, verified by property
  test across randomized ledgers.
- **SC-004**: A transfer for the displayed amount brings that pair to exactly zero, with no cent
  lost. *(Verified at the engine level; the seven-currency prefill check returns with FR-014.)*
- **SC-005**: A ledger of transactions with null payers produces no balances and no errors.
- **SC-006**: Expense balance behavior matches the nine historical member-balance cases exactly.

## Assumptions

- **Debt simplification is out of scope.** Collapsing A→B→C into A→C is a real quality-of-life win for
  3+ households but is a separate, explainable-UI problem. Balances are shown as raw pairs.
- **Balance visibility is household-wide.** Everyone sees every pair. This matches the existing RLS
  model (there is no per-person privacy today) and the target household's shared-device reality, but
  it is a product decision worth revisiting alongside the invite flow.
- **Bank-sync payer is the account's owning person.** A feed cannot know who physically paid; the
  account owner is the only defensible signal, and users can correct it by editing the transaction.
- **Historical rows keep their null payers.** No backfill — inventing payers for past transactions
  would fabricate debts. Balances build from the point of capture forward.
- **The nine historical member-balance vector cases are restored as the regression lock** for the
  expense and transfer rules, extended with new cases for income and for three-person matrices.
- No database migration, no new dependency — `paid_by` and the `transfer` kind already exist.
