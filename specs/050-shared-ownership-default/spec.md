# Feature Specification: Shared Ownership by Default

**Feature Branch**: `050-shared-ownership-default`

**Created**: 2026-08-16

**Status**: Draft

**Input**: User description: "Default to shared, and make 'who is this for?' one tap. Nothing else works without it. Until transactions carry more than one owner, every downstream fix operates on an empty set — and under the handler pattern the current default is systematically wrong, not merely ambiguous."

## Context

Ortho's ledger is fully person-aware: `transaction_shares` carries one exact-cent row per owner,
and the split calculators are golden-vector locked. But **every entry path writes exactly one share
row, for the logged-in person**:

| Path | Current default | Evidence |
|---|---|---|
| Manual entry | `[defaultOwner]` | `web/components/web/TxForm.tsx:224` |
| CSV import | `[defaultOwnerId]` | `web/lib/csv/csvImportModels.ts:48` |
| CSV commit | falls back to `[currentPersonId]` | `web/lib/csv/useCsvImport.ts:27` |
| Receipt/statement scan | copies the last matching transaction's owners | `web/lib/scan/scanInference.ts:207` |

There is no setting anywhere to change this. Sharing is opt-in, per transaction, every time, and the
opt-out is the default — so a multi-adult household produces a ledger indistinguishable from a solo
one unless someone opens the owner picker on every entry.

This matters most under the **handler pattern**, which is Ortho's normal case rather than an edge
case: one person entering money on behalf of others who have no account and may never have one. When
two adults both use the app a mis-attribution gets noticed; when one handler enters for four, nobody
checks. The current default is therefore systematically wrong, not merely ambiguous.

Every downstream household capability — per-person contribution, who-owes-whom, person-scoped
budgets — reads data this default never produces.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A shared household's spending is shared by default (Priority: P1) 🎯 MVP

Someone in a two-or-more-person household adds a grocery run. Today the transaction silently
belongs to them alone, and it takes a deliberate detour through the owner picker to say otherwise —
so most households never do, and the ledger records a household's life as one person's.

Now, when a household has more than one active person, a new expense or income transaction starts
out **owned by everyone in the household**, split evenly. The person entering it can still narrow it
in one tap. A one-person household is unaffected: that person owns it, exactly as today.

**Why this priority**: This is the whole feature. It is the difference between a ledger that records
a household and one that records whoever holds the phone, and every other household capability reads
the data it produces.

**Independent Test**: With two or more active people, open the New Transaction form and confirm the
owner set is pre-filled with every active person and the split reads even; save, and confirm the
stored transaction carries one share row per person summing to the amount.

**Acceptance Scenarios**:

1. **Given** a household with three active people, **When** the user opens the New Transaction form
   for an expense, **Then** all three are pre-selected as owners with an even split.
2. **Given** a household with one active person, **When** the user opens the New Transaction form,
   **Then** that person is the sole owner and no split controls appear (unchanged behavior).
3. **Given** a household with three active people and one soft-removed person, **When** the form
   opens, **Then** the removed person is **not** among the default owners.
4. **Given** the default owner set, **When** the user saves without touching ownership, **Then**
   `transaction_shares` holds one row per active person and the rows sum exactly to `amount_cents`.
5. **Given** an income transaction in a multi-person household, **When** the form opens, **Then**
   the same shared default applies.
6. **Given** a `transfer`, **When** the form opens, **Then** the From/To parties are unchanged — a
   transfer is directional and is never co-owned.

---

### User Story 2 - Narrowing to one person takes one tap (Priority: P1)

Not every purchase is shared. Someone buying their own lunch needs to say so without opening a
picker, selecting, deselecting, and confirming — especially a handler entering a run of transactions
for several people in one sitting.

A **"Who is this for?"** control sits inline on the form with two immediate choices — **Everyone**
and **Just me** — plus the existing picker for anything else. One tap moves between the common cases;
the picker remains for a genuine custom split.

**Why this priority**: Shared-by-default is only safe if narrowing is trivial. Without it the new
default would produce confidently wrong shared data in place of confidently wrong individual data.
The two halves ship together or not at all.

**Independent Test**: In a multi-person household, tap "Just me" and confirm the owner set collapses
to the current person and the split controls disappear; tap "Everyone" and confirm it expands back to
all active people with an even split.

**Acceptance Scenarios**:

1. **Given** the shared default, **When** the user taps "Just me", **Then** the owner set becomes
   the current person alone and the split editor is hidden.
2. **Given** ownership narrowed to one person, **When** the user taps "Everyone", **Then** every
   active person is selected again with an even split.
3. **Given** the user has chosen a custom subset via the picker, **When** the form re-renders,
   **Then** neither preset shows as active and the custom selection is preserved.
4. **Given** a one-person household, **When** the form opens, **Then** the control is not rendered
   at all.

---

### User Story 3 - A household can opt out of the shared default (Priority: P2)

Some multi-person households do not pool. A parent tracking their own money who has added a child as
a person for allowance purposes should not have every coffee split three ways.

**Settings → Household** gains a **"New transactions are shared by default"** preference, on by
default when the household has more than one person. Turning it off restores today's behavior: new
transactions start owned by the person entering them. The preference changes only what a *new* form
starts with; it never rewrites stored transactions.

**Why this priority**: It prevents the new default from being wrong for a real minority of
households, but the feature delivers its value without it — and the preset control in US2 already
makes the individual case one tap.

**Independent Test**: Turn the preference off, open the New Transaction form in a multi-person
household, and confirm the owner set is the current person alone; turn it back on and confirm the
shared default returns.

**Acceptance Scenarios**:

1. **Given** the preference is off, **When** the user opens the New Transaction form, **Then** the
   current person is the sole default owner.
2. **Given** the preference is off, **When** the user taps "Everyone", **Then** all active people are
   selected — the preset is unaffected by the preference.
3. **Given** the preference is changed, **When** the user reopens the app, **Then** the choice
   persists on that device.
4. **Given** a one-person household, **When** the user opens Settings → Household, **Then** the
   preference is not shown.

---

### Edge Cases

- **A person is added mid-session.** The default owner set is derived at form-open time from the
  current active-people list, so the next new transaction includes them; forms already open are not
  retroactively changed.
- **A person is soft-removed.** Removed people never appear in the default set. Existing transactions
  that reference them continue to render (the resolver already falls back for removed people).
- **Editing an existing transaction.** The default is applied **only to new transactions**. Opening
  an existing one loads its stored owners verbatim — a default must never silently re-attribute money
  a user already recorded.
- **Duplicating / copy-from-most-common.** Copying an existing transaction copies its owner set, not
  the default, so a remembered split survives.
- **An amount that does not divide evenly.** The existing leftover-cent policy applies unchanged: the
  canonical owner order decides who carries the extra cent, and shares always sum to the total.
- **Zero active people.** Not reachable in practice (bootstrap guarantees the account holder's
  person), but the resolver falls back to the current person rather than producing an empty owner set.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST default a new `expense` or `income` transaction's owner set to every
  **active** household person when the household has more than one active person and the shared
  preference is on.
- **FR-002**: System MUST default the split method to **even** for that owner set, producing exact
  integer-cent shares that sum to the transaction amount.
- **FR-003**: System MUST leave one-person households completely unchanged — sole owner, no split
  controls, no preset control.
- **FR-004**: System MUST exclude soft-removed people from the default owner set.
- **FR-005**: System MUST NOT apply the default when editing an existing transaction; stored owners
  load verbatim.
- **FR-006**: System MUST NOT change `transfer` ownership semantics — transfers stay directional
  (`paid_by` = sender, single recipient) and are never co-owned.
- **FR-007**: Users MUST be able to set ownership to all active people ("Everyone") or to themselves
  alone ("Just me") in a single tap, without opening the owner picker.
- **FR-008**: System MUST show neither preset as active when the current owner set matches neither,
  and MUST preserve a custom selection across re-renders.
- **FR-009**: System MUST apply the same shared default to the CSV import flow's per-row owner
  defaults.
- **FR-010**: Users MUST be able to turn the shared default off per household, persisted across app
  restarts on that device.
- **FR-011**: System MUST apply the preference only to newly opened forms; changing it MUST NOT
  modify any stored transaction.
- **FR-012**: System MUST continue to guarantee that persisted shares sum exactly to `amount_cents`
  for every owner-set size (existing atomic-write invariant, re-asserted here).

### Key Entities

- **Active person**: a `household_people` row with no `removed_at`, in display order. The default
  owner set is exactly this list.
- **Ownership default preference**: a per-device household-scoped boolean controlling whether new
  transactions start shared. Not stored in the database (see Assumptions).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a household with N > 1 active people, a transaction saved without touching any
  ownership control persists **N** share rows, not 1.
- **SC-002**: Moving between "everything shared" and "only mine" takes exactly **one** interaction,
  measured from the form as it first renders.
- **SC-003**: A one-person household's New Transaction form is byte-identical in behavior to the
  previous release — verified by the existing form tests passing unmodified.
- **SC-004**: Every existing transaction's stored ownership is unchanged by this feature — verified
  by opening and re-saving an existing transaction with no edits and asserting identical share rows.
- **SC-005**: Shares sum exactly to the transaction amount for owner-set sizes 1 through 6,
  including amounts that do not divide evenly.

## Assumptions

- **The default owner set is *all* active people, not a configurable subset.** Households that pool
  among some members but not others are a real pattern, but the right grouping model is unvalidated
  (it is the same open question as the household pot's contribution rule). A per-member pooling group
  is deliberately deferred; "Everyone / Just me / custom picker" covers the cases reachable today.
- **The preference is stored per device, not in the database.** This avoids a migration and follows
  the established pattern for user preferences (`ortho.textSize`, `ortho.announcementsSeen`). Under
  the handler model a household typically shares one device, so the practical cost is low. If
  multi-device households become common this should be promoted to a household column.
- **Receipt/statement scan keeps its existing behavior** — copying owners from the last matching
  transaction. That is already a better signal than any default, and it will inherit shared owner
  sets automatically once US1 lands.
- **Bank sync keeps a single default owner.** A bank feed cannot know who a purchase was for, and
  guessing "everyone" for synced rows would manufacture splits the user never made. Sync attribution
  is spec 053's concern.
- No database migration, no new dependency. The `transaction_shares` schema, the split calculators,
  and the atomic `upsert_transaction` RPC are all unchanged.
