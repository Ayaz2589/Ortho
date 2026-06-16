# Feature Specification: Simplified Households & Flexible Splits

**Feature Branch**: `007-household-splits`

**Created**: 2026-06-16

**Status**: Draft

**Input**: User description: "Drastically reduce household scope. Households are just a list of people you add. Each transaction (income or expense) has one or more household members; multi-person transactions split by percentage or by value. The dashboard reflects this."

## Overview

Ortho's household model is being **drastically simplified** and given **one new capability**.

Removed: the *personal vs. shared* distinction. Today a transaction is either "personal"
(private to you) or "shared" (visible to the household), and the people you can attach
differ between the two modes; there is also a hidden second class of "device-only" people
used only for personal splits. All of that goes away.

New model:

- A **household is simply a list of people** — you, plus anyone you add by name (a spouse,
  a roommate). Added people do not need their own Ortho account. There is **one list of
  members**, used everywhere.
- **Every transaction belongs to the household** and is attributed to **one or more members**.
  A single-owner transaction is fully that person's; a multi-owner transaction is **split**
  among its owners.
- A split can be entered **by percentage** (50% / 50%) **or by value** ($50 / $50). The
  shares of a transaction **always add up to its exact amount, to the cent**.
- The **dashboard** shows each person's spending and income based on their exact share.

This is a simplification of **Transactions, Household, and Dashboard**, not a redesign. The
four destinations (Dashboard, Transactions, Housing, Settings) are preserved, and the
behavior is identical on every device (phone and web).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Split a transaction by value or percentage (Priority: P1)

When logging or editing a transaction that more than one household member is responsible
for, the user picks the members and chooses how to divide the amount — either by entering a
**percentage** for each person or a **dollar value** for each person. A single owner takes
the whole amount; multiple owners default to an even split until the user customizes it. The
transaction's detail view then shows each owner's exact share.

**Why this priority**: This is the headline capability and the reason for the change. Without
it, the feature delivers nothing new. It also exercises the core money math that everything
else depends on.

**Independent Test**: Create a $100 expense with two members. Confirm the default even split
($50 / $50). Change to a 70% / 30% split and confirm shares of $70.00 / $30.00. Switch the
method to value entry and set $60 / $40; confirm it saves and the detail view shows
$60.00 / $40.00. Reduce to a single owner and confirm the full $100 is theirs.

**Acceptance Scenarios**:

1. **Given** a new expense for $100.00 with two owners and no custom split, **When** it is
   saved, **Then** each owner's share is $50.00 and the two shares sum to exactly $100.00.
2. **Given** a $100.00 transaction with two owners, **When** the user enters 70% / 30%,
   **Then** the shares are $70.00 / $30.00.
3. **Given** a $100.01 transaction split evenly between two owners, **When** it is saved,
   **Then** the shares are $50.01 and $50.00 (the leftover cent is assigned deterministically
   to the first owner) and they sum to exactly $100.01.
4. **Given** a $100.00 transaction, **When** the user splits by value as $60 / $40, **Then**
   the shares are stored as $60.00 / $40.00 and the entry is accepted because it sums to the
   total.
5. **Given** a value split that does not sum to the transaction amount, **When** the user
   tries to save, **Then** saving is blocked with a clear, non-alarmist message until the
   shares reconcile to the total.
6. **Given** a transaction with one owner, **When** it is viewed, **Then** no split UI or
   per-owner percentage is shown — the owner has the full amount.
7. **Given** a multi-owner transaction, **When** the user removes an owner so one remains,
   **Then** the remaining owner takes the full amount; **When** the user adds an owner back,
   **Then** the split re-balances to an even default.

---

### User Story 2 - Per-person totals on the dashboard (Priority: P2)

The dashboard's per-person breakdown reflects each member's **exact share** of every
transaction, so a couple can see who spent what without rounding drift, and the per-person
amounts reconcile to the household total.

**Why this priority**: The split is only meaningful if the household can see its effect.
This makes the new model observable and trustworthy.

**Independent Test**: With a $100 expense split $70 / $30 between two members, open the
dashboard and confirm one member shows $70.00 and the other $30.00 for that transaction, and
that the per-person amounts add up to the household's total spend.

**Acceptance Scenarios**:

1. **Given** a $100.00 expense split $70 / $30 between two members, **When** the dashboard
   per-person breakdown is shown for the period, **Then** the two members show $70.00 and
   $30.00 respectively.
2. **Given** any set of transactions in a period, **When** the per-person amounts are summed,
   **Then** they equal the household's total spend for that period exactly (to the cent).
3. **Given** an income transaction split between members, **When** the dashboard is shown,
   **Then** each member's income reflects their share.

---

### User Story 3 - Manage household people simply (Priority: P3)

The household settings screen is a plain list of people. The user can **add a person by
name**, **rename** a person (or the household), and **remove** a person. Added people are
just names used to attribute and split transactions — no invitations, no accounts.

**Why this priority**: Needed to populate the member list that splitting draws from, but the
default household (you, plus any people already added) is enough to use Stories 1–2, so this
can land after them.

**Independent Test**: Open household settings, add "Jordan", confirm Jordan appears in the
owner picker when logging a transaction, rename Jordan to "Jo", remove Jo, and confirm Jo no
longer appears as a selectable owner while past transactions that referenced Jo still render.

**Acceptance Scenarios**:

1. **Given** the household settings, **When** the user adds a person by name, **Then** that
   person becomes selectable as a transaction owner everywhere.
2. **Given** an existing person, **When** the user renames them, **Then** the new name shows
   on transactions and in pickers.
3. **Given** a person who is removed, **When** the user logs a new transaction, **Then** that
   person is no longer selectable, **And** existing transactions that referenced them still
   display without error.
4. **Given** the household, **When** the user renames the household, **Then** the new name is
   shown in settings.

---

### Edge Cases

- **Non-divisible amounts**: $10.00 split three ways → $3.34 / $3.33 / $3.33 (remainder cents
  assigned deterministically, in owner order); shares always sum to the total.
- **Percentage that doesn't total 100%**: saving is blocked until percentages total 100%
  (within a small tolerance), then resolved to exact cents.
- **Value split that doesn't total the amount**: saving is blocked until the values reconcile
  to the transaction amount.
- **Editing the transaction amount after a split is set**: percentage splits re-derive cents
  from the new amount; value splits are flagged for reconciliation if they no longer sum to
  the new total.
- **Removing a member who owns transactions**: the person is no longer selectable, but their
  name and shares remain on past transactions (no data loss, no orphaned references).
- **Zero-share owner**: an owner assigned 0% / $0 is allowed only if explicitly entered; an
  even split never produces a 0 share for a positive amount unless the amount is 0.
- **Existing data after the change**: every prior transaction stays visible, attributed to
  the person who logged it (single owner = full amount) unless it already had multiple
  participants, in which case its prior split is preserved as exact cents.

## Requirements *(mandatory)*

### Functional Requirements

**Unified household & members**

- **FR-001**: The system MUST represent a household as a single list of people: the account
  holder plus people added by name.
- **FR-002**: Users MUST be able to add a person to the household by name (no account or
  invitation required), rename a person, rename the household, and remove a person.
- **FR-003**: The system MUST present **one** member list everywhere a transaction owner is
  chosen or displayed; there is no separate pool of "device-only" people.
- **FR-004**: Removing a person MUST keep that person's name and shares intact on existing
  transactions while making them unselectable for new transactions.

**No more scope**

- **FR-005**: The system MUST remove the personal-vs-shared distinction entirely: there is no
  scope toggle on the transaction form, no scope filter on the transactions list, and no
  scope shown in the active-filter chips or detail views.
- **FR-006**: Every transaction (income or expense) MUST belong to the household and MUST have
  at least one owner drawn from the household member list.

**Splitting**

- **FR-007**: A transaction with a single owner MUST attribute the full amount to that owner.
- **FR-008**: A transaction with multiple owners MUST divide the amount among them, defaulting
  to an **even split** when no custom split is provided.
- **FR-009**: Users MUST be able to enter a custom split **by percentage** or **by value**,
  and switch between the two methods while editing.
- **FR-010**: The per-owner shares of a transaction MUST always sum to the transaction's exact
  amount, to the cent, for every split method (even, percentage, value).
- **FR-011**: When a split does not divide evenly to the cent, the leftover cent(s) MUST be
  assigned **deterministically** (in owner order) so results are reproducible.
- **FR-012**: The system MUST block saving a percentage split that does not total 100% (within
  a small tolerance) or a value split that does not reconcile to the transaction amount, with
  a clear, non-alarmist message.
- **FR-013**: Changing the owner set MUST re-balance the split (to an even default) and
  reducing to one owner MUST give that owner the full amount.

**Display & dashboard**

- **FR-014**: The transaction detail view MUST show each owner's exact share for multi-owner
  transactions, and MUST not show a split for single-owner transactions.
- **FR-015**: The dashboard's per-person breakdown MUST compute each member's spend and income
  from their exact shares, and the per-person amounts MUST reconcile to the household totals
  for the period.

**Data & continuity**

- **FR-016**: Existing transactions MUST remain visible after the change. Each prior
  single-participant transaction MUST be attributed to the person who logged it for the full
  amount; each prior multi-participant transaction MUST preserve its split as exact cents.
- **FR-017**: People who previously existed only on a device MUST be folded into the single
  household member list.

**Consistency across devices**

- **FR-018**: The split rules (even split, percentage→cents, value validation, remainder
  placement) MUST produce **identical** results on every device (phone and web) for identical
  inputs.
- **FR-019**: The transaction filters MUST behave identically on every device after the scope
  dimension is removed.

### Key Entities *(include if feature involves data)*

- **Household**: A named group with one list of members. Has a name and an ordered list of
  people.
- **Member (Person)**: A person in the household — a display name (and avatar initial/color).
  May be the account holder or a name-only person added to the household. Used to attribute
  and split transactions.
- **Transaction**: An income or expense belonging to the household, with an amount, date,
  category, kind, source, and one or more **owners**. No scope.
- **Owner Share**: For each owner of a transaction, the portion of the amount they are
  responsible for, expressed in exact cents. The shares of a transaction sum to its amount.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For 100% of transactions and every split method, the sum of all owners' shares
  equals the transaction amount exactly (zero-cent difference).
- **SC-002**: A user can split a transaction between two people by value or by percentage in
  a few taps/clicks (under ~20 seconds) from the transaction form.
- **SC-003**: Each person's dashboard total for a period equals the exact sum of their shares
  across that period's transactions, and the per-person totals reconcile to the household
  total with zero drift.
- **SC-004**: The personal/shared distinction appears nowhere in the product — no scope
  toggle, no scope filter, no scope chip — verified across Transactions, Dashboard, and
  Settings on both phone and web.
- **SC-005**: Identical split inputs produce identical per-owner cent shares on phone and web
  in 100% of locked test cases.
- **SC-006**: After the change, 100% of pre-existing transactions remain visible, each
  attributed correctly (single owner = full amount; prior splits preserved).
- **SC-007**: A household person can be added, renamed, and removed by name with no account or
  invitation, and the change is reflected in owner pickers immediately.

## Assumptions

- The current data set is early/personal and a one-time backfill migration is acceptable;
  the scope column and personal/shared semantics are dropped, every transaction is attributed
  to the household, and prior single-participant transactions are owned by their creator.
- Added people are **name-only** participants; they do not sign in, receive invitations, or
  have their own visibility — there is a single household ledger everyone in the household
  sees.
- A household has a single active membership list (multi-household switching remains out of
  scope).
- Money is stored and reconciled in integer cents; display formatting (e.g. `$50.00`) is
  unchanged from today.
- The category, kind (income/expense), and source taxonomy is unchanged.
- Settling-up / "who owes whom" running balances are out of scope; the feature shows
  attribution and per-person totals, not inter-member debts.
- The Housing pages and analytics are unaffected.
