# Feature Specification: Person-Scoped Dashboard Widgets

**Feature Branch**: `feat/056-person-scoped-widgets`

**Created**: 2026-08-22

**Status**: Draft

**Input**: User description: "Currently, the widget system only works on a household level, not an
individual level. In the dashboard, we can change the view from 'Everyone' to an individual from the
dropdown on the top. However, the widgets still stay on a household level. Let's update the widgets so
they are on an individual level when an individual is selected, and when everyone is selected, let's
change the widgets to be on the household level. Let's also change the dropdown name of 'Everyone' to
'Household'. This does not apply to the financial health widget and the goals widget, as that will be
its own individual PR."

## Context: the defect this closes

The dashboard already asks "whose money is this?" — the member picker sits directly above the net
hero. But the answer only reaches the hero. Everything below it — savings rate, spending pace,
budgets, top merchants, activity, balances — keeps reporting the household's figures.

So a two-adult household where one person picks themselves sees a hero that says "your net is $1,200"
sitting on top of a board that says "spending pace $180/day" and "Groceries: $640 of $800" — numbers
belonging to *both* people. Two different subjects, one screen, no label distinguishing them. The
person reads the board as theirs because the control they just used says it is.

This is the same error class specs 051, 052 and 054 each fixed elsewhere: a number scoped to one
person measured against, or shown beside, a number scoped to everyone. The dashboard is the last
surface where it survives.

The correction is also already built. Spec 051 shipped `MoneyScope` — the people axis, sibling to
the dashboard's existing time axis — and it is the single owner of the attribution rule. This feature
routes the dashboard's picker into it. No new attribution logic is invented here.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Picking a person re-scopes the whole board (Priority: P1)

A member of a multi-person household opens the Dashboard and picks their own name from the scope
picker. Every widget that reports money now reports *their* money: their share of shared expenses,
their income, their budgets, the merchants *they* spend at. The hero and the board agree.

**Why this priority**: This is the feature. Without it the picker keeps making a promise the page
does not keep, and the board's numbers are actively misread.

**Independent Test**: In a two-person household with one $100 expense split evenly, pick one person;
the widgets that show money show $50, not $100. Pick "Household"; they show $100.

**Acceptance Scenarios**:

1. **Given** a household with two active people and a $100 shared expense split evenly, **When** the
   viewer selects one person, **Then** the spending-pace, top-merchants, savings-trends, activity and
   budgets widgets each report that person's $50 share, not $100.
2. **Given** a person is selected, **When** the viewer selects "Household", **Then** every widget
   returns to the figures it showed before any person was ever selected.
3. **Given** a person is selected, **When** the viewer also changes the month or range, **Then** both
   scopes apply together — the widgets show that person's money in that window.
4. **Given** a transfer between two household people, **When** either party is selected, **Then**
   widgets that count transfers count it at its full amount for that person (a transfer is
   directional, never split), and it is absent entirely for a third person.
5. **Given** a person is selected who owns no share of a given transaction, **When** the widgets
   render, **Then** that transaction contributes nothing to any of them.

---

### User Story 2 - "Everyone" is renamed "Household" (Priority: P2)

The picker's default option reads "Household" rather than "Everyone", matching the noun the rest of
the app uses for the shared entity and making the contrast with an individual name explicit.

**Why this priority**: Small, but it is half of what makes the control legible: "Household vs. Ayaz"
names two subjects, "Everyone vs. Ayaz" names a quantity and a person.

**Independent Test**: Open the dashboard picker in a multi-person household; the default option reads
"Household" in every supported language, and the Planning hub's own scope bar is unaffected.

**Acceptance Scenarios**:

1. **Given** a multi-person household, **When** the viewer opens the dashboard scope picker, **Then**
   the default option and the collapsed button both read "Household".
2. **Given** the app is set to any of the five supported languages, **When** the picker renders,
   **Then** "Household" appears translated, with no untranslated English fallback.
3. **Given** the Planning hub and the transaction form, **When** their own people controls render,
   **Then** they still read "Everyone" — the rename is scoped to the dashboard picker only.

---

### User Story 3 - Balances narrow to the selected person (Priority: P3)

With a person selected, the "Who owes whom" widget shows only the debts that person is party to,
rather than every pair in the household.

**Why this priority**: Genuinely useful narrowing, but this widget is default-off and is the one place
where the scope means something different from "project the amounts" — so it is separable from P1 and
carries its own correctness risk.

**Independent Test**: In a three-person household with debts between all three pairs, select one
person; only the two rows involving them remain, at unchanged amounts.

**Acceptance Scenarios**:

1. **Given** a three-person household with a non-zero balance between each pair, **When** one person
   is selected, **Then** only rows where they are debtor or creditor are shown.
2. **Given** a person is selected who is square with everyone, **When** the widget renders, **Then**
   it shows the settled state rather than an empty list.
3. **Given** a person is selected, **When** the remaining rows render, **Then** their amounts are
   identical to the amounts shown under household scope — narrowing which rows appear must never
   change what any row says.

---

### Edge Cases

- **Single-person household**: the picker is already hidden (household and person are the same
  thing). The board must behave exactly as it does today, with no scope machinery observable.
- **Selected person is removed from the household** while the dashboard is open: the board falls back
  to household scope rather than emptying, matching the existing resolve-stale-scope rule.
- **Person has no activity in the window**: each widget shows its own existing calm empty state
  ("No expenses in this period yet.", "Not enough data yet."), never a zero-filled chart implying
  data.
- **Person has set no budgets**: the budgets widget shows its empty state. It must NOT fall back to
  the household's limits — a household allowance is sized for everyone, and measuring one person's
  share against it is precisely the error spec 054 rejected.
- **Uneven split** (e.g. 70/30): the person's figure is their *stored* share, never a recomputed
  even split.
- **Widgets with no people axis** (housing costs, home equity, the four settings shortcuts): a
  property is a household asset and a settings shortcut carries no money, so these are unchanged
  under any scope.
- **Excluded widgets** (financial health, goals): unchanged by this feature under any scope, pending
  their own change.

## Requirements *(mandatory)*

### Functional Requirements

**Scope plumbing**

- **FR-001**: The dashboard's member selection MUST be readable by every widget body without those
  bodies receiving it as a prop, preserving the board's existing propless-widget contract (a widget
  author adds one registry entry and nothing else).
- **FR-002**: The dashboard MUST hold exactly one member selection, shared by the hero and the board,
  so the two can never disagree.
- **FR-003**: The people axis MUST reuse the existing single attribution rule rather than
  re-implementing per-widget narrowing. A person's figure for a shared expense or income is their
  stored share; a transfer is directional and counted at full amount for its sender and recipient.
- **FR-004**: A selection naming a person who is no longer active MUST resolve to household scope
  rather than producing an empty board.

**Per-widget behavior**

- **FR-005**: Under household scope, every widget MUST produce output identical to today's — the
  no-op must be observably total, not merely equivalent-looking.
- **FR-006**: The **spending-pace** widget MUST, under person scope, compute its daily buckets,
  average per day and prior-30 comparison from that person's expense shares.
- **FR-007**: The **top-merchants** widget MUST, under person scope, rank merchants by that person's
  spend and count only visits they were party to.
- **FR-008**: The **savings-trends** widget MUST, under person scope, compute the per-month and
  headline savings rate — and the previous-month comparison — from that person's income and expense
  shares.
- **FR-009**: The **activity** widget MUST, under person scope, list only transactions that person is
  party to, showing their share amount.
- **FR-010**: The **budgets** widget MUST, under person scope, show that person's own budget limits
  measured against that person's spend — both halves projected by the same scope.
- **FR-011**: The budgets widget MUST NOT fall back to a household limit when the selected person has
  set none.
- **FR-012**: The **household-balances** widget MUST, under person scope, show only pairs involving
  the selected person, with amounts unchanged. Balances MUST be computed from the full unprojected
  ledger — a projected transaction has lost the payer/share relationship that a debt is derived from,
  so computing balances from projected rows would be silently wrong.
- **FR-013**: The **housing-costs**, **home-equity** and the four **settings-shortcut** widgets MUST
  be unaffected by the people axis.
- **FR-014**: The **financial-health** and **goals** widgets MUST be left exactly as they are,
  including their current internal scope behavior, and MUST NOT change under any selection.

**Picker copy**

- **FR-015**: The dashboard scope picker's default option MUST read "Household" in the collapsed
  button and in the open list.
- **FR-016**: The rename MUST NOT change the wording of the Planning hub's scope bar or the
  transaction form's owner control, which share the existing "Everyone" wording for their own
  purposes.
- **FR-017**: "Household" MUST render translated in all five supported languages.

**Constraints**

- **FR-018**: No database schema change, migration, or new dependency.
- **FR-019**: All existing golden vectors MUST regenerate byte-identically.
- **FR-020**: The member selection is view state for the current visit; it is NOT persisted across
  reloads, matching today's behavior.

### Key Entities

- **Money scope**: which subject the dashboard's figures describe — the household, or one named
  person. Already defined by the existing people-axis module; this feature adds a consumer, not a
  new concept.
- **Widget body**: a self-contained reporter that reads household data plus the shared time window,
  and now also the shared subject.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With a person selected, the sum reported by every money-reporting widget on the board
  attributes to that person only — no widget on the board reports a figure belonging to someone the
  viewer did not select.
- **SC-002**: Selecting "Household" reproduces the pre-feature dashboard exactly: every widget's
  rendered figures are unchanged from today for every household, including households that have never
  used the people axis.
- **SC-003**: A viewer can tell whose money the board is showing without opening a menu — the active
  subject is named on screen at all times.
- **SC-004**: Changing the selected person updates the board immediately, with no reload and no
  intermediate blank or stale state.
- **SC-005**: A single-person household sees no behavior change of any kind.
- **SC-006**: A future widget author gets the people axis by reading the shared subject the same way
  they read the shared time window — no board changes, no registry changes, no prop threading.

## Assumptions

- The people axis and its attribution rule already exist and are correct (shipped and pinned by specs
  051/054); this feature consumes them rather than extending them.
- The "Household" translation already exists in all five catalogs, so the rename needs no new
  translated string.
- Widget bodies remain propless and read shared state through context, matching how they already read
  the shared time window.
- The excluded widgets (financial health, goals) are excluded because they are being changed
  separately, not because person scope is wrong for them — so this feature must leave a clean seam
  for that follow-up rather than designing them out.
- Balances remain a standing position over the whole ledger and continue to ignore the time window;
  the people axis narrows which rows are shown, not which transactions are counted.
- Widget enable/disable preferences stay per-device and per-household — the people axis does not give
  a person their own widget set.
