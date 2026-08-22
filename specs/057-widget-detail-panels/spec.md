# Feature Specification: Widget Detail Panels

**Feature Branch**: `feat/057-widget-detail-panels`

**Created**: 2026-08-22

**Status**: Draft

**Input**: User description: "Widget detail panels — give every data widget on the dashboard a detail panel behind its existing click affordance, replacing the 'Details coming soon.' placeholder from spec 037. Desktop keeps the shared right-side Drawer; mobile becomes a full-screen view. A shared panel frame owns the header, a scope caption, the scrolling content region, empty states and a route-out footer; each widget's panel body is a bespoke component registered beside the existing propless body. Covers every data widget except financial health. This is a base branch delivering the frame plus two deliberately dissimilar reference panels, from which a shared primitives kit is extracted; the remaining widget panels then land as independent follow-ups in parallel sandboxes."

## Overview

Since spec 037 every widget card on the dashboard has been clickable, and every click has
opened a panel reading **"Details coming soon."** The affordance is real; the promise behind
it has never been kept. This feature makes good on it.

The dashboard card is a **glance**: one number, one shape, sized to a uniform grid cell.
The panel is the **"why"** — the composition behind the number, the history the sparkline
compresses, the rows the total sums. Nothing here invents new financial meaning; almost
every panel renders something the app already computes and currently discards.

Three of the strongest panels are pure recovery of unreachable work: the mortgage
amortization schedule, the budget rollover ledger, and debt simplification all ship today
with **no user-facing consumer at all**.

## User Scenarios & Testing *(mandatory)*

<!--
  Stories are ordered so that US1–US3 constitute the base branch, and US4–US10 are each an
  independently deliverable panel. The split is deliberate: each of US4–US10 is intended to
  be built in its own isolated sandbox, in parallel, on top of the base.
-->

### User Story 1 - Open a widget and see real detail (Priority: P1)

A member taps a widget on their dashboard. Instead of a placeholder, a panel opens showing
the detail behind that widget's headline: on a desktop it slides in from the right over a
dimmed board, on a phone it fills the screen entirely. The panel names what it is showing —
which period, and whose money — closes with a single obvious control, and where a fuller
destination for that subject exists in the app, offers a way through to it.

**Why this priority**: This is the shell every other story renders inside. No panel can
exist without it, and it is the only story that touches shared files. It must land, and be
stable, before any parallel work begins.

**Independent Test**: Register any single panel and open it at both a phone width and a
desktop width. The frame, the scope caption, the close control, the scrolling region and
the fallback for unregistered widgets are all verifiable with one panel present.

**Acceptance Scenarios**:

1. **Given** a widget with a registered panel, **When** the member activates its card on a
   desktop-width viewport, **Then** the panel opens as the right-side drawer with the board
   dimmed behind it, and closes on the close control, on a scrim click, or on Escape.
2. **Given** the same widget, **When** the member activates its card on a phone-width
   viewport, **Then** the panel fills the entire screen with no dimmed board visible behind
   it, and its content clears the device's safe areas at top and bottom.
3. **Given** a widget with **no** registered panel, **When** the member activates its card,
   **Then** the existing placeholder is shown rather than an error or an empty panel.
4. **Given** the dashboard scoped to a specific month and a specific person, **When** any
   panel is opened, **Then** the panel states both that period and that person, and its
   figures are computed for exactly that period and person.
5. **Given** a panel whose content is taller than the viewport, **When** the member scrolls
   it, **Then** the content scrolls within the panel and nothing is clipped or lost.
6. **Given** a navigation-shortcut widget, **When** the member activates its card, **Then**
   it navigates to its settings page as it does today and no panel opens.

---

### User Story 2 - Home equity: when will this be paid off? (Priority: P1)

The home equity card says how much principal has been paid down and what fraction of the
original loan that represents. It cannot say when the loan ends, how much of next month's
payment becomes equity rather than interest, or — for a household with more than one
mortgage — which property those combined figures came from. The panel answers all three.

**Why this priority**: One of the two reference panels. Chosen because its natural shape —
a headline figure above a dense schedule table, with a second level for picking one mortgage
out of several — is maximally unlike US3's, so whatever the two turn out to share is genuinely
universal rather than coincidental. It also exercises the frame's second-level navigation,
keeping that capability from shipping speculative and untested.

**Independent Test**: Open the panel for a household with one mortgage and again for a
household with several, and confirm the schedule, the payoff date, and the per-mortgage
breakdown are correct against the existing mortgage engine's own fixtures.

**Acceptance Scenarios**:

1. **Given** a household with a mortgage, **When** the member opens the home equity panel,
   **Then** they see the payoff date and the years remaining alongside the equity headline.
2. **Given** the same household, **When** they look further down the panel, **Then** they
   see the upcoming payments as a schedule, each split into the part that becomes equity and
   the part that does not.
3. **Given** a household with several mortgages, **When** the member opens the panel,
   **Then** each mortgage is listed separately rather than silently summed as on the card,
   and selecting one shows that mortgage's own schedule with a way back to the list.
4. **Given** a household with no mortgage, **When** the member opens the panel, **Then**
   they see a calm explanation rather than an empty table or a zeroed schedule.

---

### User Story 3 - Budgets: where did the money actually go? (Priority: P1)

The budgets card shows a bar per category and "spent X of Y". It cannot show which purchases
made up X, where a rolled-over balance came from, or where the category will land by month
end if the current pace holds. The panel answers all three, per budget.

**Why this priority**: The second reference panel, and the one whose shape — repeated
per-entity sections, each with its own bar, figures and nested list — is the most common
shape across the remaining seven. Getting it right teaches the most about the shared kit.

**Independent Test**: Open the panel for a household with several budgets including at
least one carrying a balance forward and one overspent, and verify each section against the
existing budget engine.

**Acceptance Scenarios**:

1. **Given** a budget with spending this month, **When** the member opens the budgets panel,
   **Then** that budget's section lists the transactions composing its spend.
2. **Given** a budget carrying a balance forward, **When** the member views its section,
   **Then** they can see how that carried balance accumulated over recent months rather than
   only this month's single summary figure.
3. **Given** a partially elapsed month, **When** the member views a budget's section,
   **Then** they see where that budget is projected to land at month end if the current pace
   continues, presented as a projection and never as a settled fact.
4. **Given** the dashboard scoped to a person who has set no personal limit for a category
   they are spending in, **When** they open the budgets panel, **Then** that category is
   named as having no personal limit — rather than being silently absent as it is on the
   card — and no household limit is borrowed on their behalf.
5. **Given** a household with no budgets, **When** the member opens the panel, **Then** they
   see a calm prompt to set one rather than an empty frame.

---

### User Story 4 - Spending pace: what changed? (Priority: P2)

The spending pace card shows a 30-day trend and a single percentage against the prior 30
days. That percentage is one number hiding a dozen category movements in both directions.
The panel breaks it open.

**Why this priority**: The card raises a question it conspicuously cannot answer, so the
panel has the clearest job of any in this set. Not P1 only because it is not needed to prove
the frame.

**Independent Test**: Open the panel for a household with spending across several categories
in both 30-day halves and verify the ranking and the movements against the window totals.

**Acceptance Scenarios**:

1. **Given** spending across several categories, **When** the member opens the panel, **Then**
   the window's spending is broken down by category, ranked by amount.
2. **Given** spending in both the trailing and prior 30-day windows, **When** the member views
   the panel, **Then** they see which categories moved most between the two windows, in both
   directions, with an increase shown no more alarmingly than a decrease.
3. **Given** the same data, **When** the member views the trend, **Then** the full 60 days are
   shown with the prior 30 distinguishable from the trailing 30 — the card shows only the
   trailing half of a series it already computes in full.
4. **Given** no spending in the window, **When** the member opens the panel, **Then** they see
   a calm empty state.

---

### User Story 5 - Savings trends: the numbers behind the rate (Priority: P2)

The savings trends card shows a rate per month and a headline rate for the window. A rate is
a ratio, and the card discards both of its terms. The panel restores them.

**Why this priority**: A high-value panel built almost entirely from figures the card already
computes and drops, so it is cheap relative to its worth.

**Independent Test**: Open the panel across a multi-month window and verify that each month's
income, expense and saved amount reconcile to the rate the card already displays.

**Acceptance Scenarios**:

1. **Given** a window spanning several months, **When** the member opens the panel, **Then**
   they see income, expense, amount saved and rate for each month.
2. **Given** the same window, **When** the member views the panel, **Then** the best and worst
   months in the window are identifiable, and a shortfall reads through sign and position
   rather than through an alarming colour.
3. **Given** a window with only one month of data, **When** the member opens the panel,
   **Then** it renders that single month without implying a trend.

---

### User Story 6 - Top merchants: the whole list, and which ones repeat (Priority: P2)

The top merchants card shows five rows. The panel shows the rest — and marks which of them
are recurring charges rather than one-off visits.

**Why this priority**: The recurring flag is a genuinely new insight rather than merely a
longer list, and it comes from a detection engine that already ships.

**Independent Test**: Open the panel for a household with more than five merchants including
at least one regular monthly charge, and verify both the ranking beyond five and the
recurring flag.

**Acceptance Scenarios**:

1. **Given** more than five merchants in the window, **When** the member opens the panel,
   **Then** they see the full ranked list, scrollable, not just the top five.
2. **Given** a merchant charged on a regular cadence, **When** the member views the list,
   **Then** that merchant is identifiable as a recurring charge with its cadence.
3. **Given** any merchant in the list, **When** the member selects it, **Then** they see that
   merchant's detail — when first and last seen, the typical amount, and how it compares to
   the previous equivalent window — with a way back to the list.

---

### User Story 7 - Who owes whom: why, and how to end it (Priority: P2)

The balances card states each outstanding pair. It never says what created the debt, nor
what the shortest path to settling everything is.

**Why this priority**: The only panel that meaningfully reduces work rather than adding
understanding — a household with several members can settle in fewer transfers.

**Independent Test**: Open the panel for a household of three or more with a cycle of debts
between them and verify both the reduced settlement set and the per-pair breakdown.

**Acceptance Scenarios**:

1. **Given** several outstanding pairs, **When** the member opens the panel, **Then** they see
   the smallest set of transfers that settles every balance, alongside the raw pairs.
2. **Given** a single pair, **When** the member selects it, **Then** they see the transactions
   that created the debt — who paid, who shares it, and each contribution — with a way back.
3. **Given** a household with three or more people, **When** the member opens the panel,
   **Then** every person's overall net position is shown, not only the pairs they are in.
4. **Given** a household that is fully settled, **When** the member opens the panel, **Then**
   it says so calmly and does not present an empty settlement list.

---

### User Story 8 - Housing costs: which property, and how much of my income (Priority: P3)

The housing card gives one monthly total across every property. The panel says which property
each part of that total came from, and what share of income it represents.

**Why this priority**: Valuable but relevant only to households with property, which is a
subset. The income-share view is the one genuinely new idea.

**Independent Test**: Open the panel for a multi-property household and verify the
per-property costs sum to the card's total, and the income share against the period's income.

**Acceptance Scenarios**:

1. **Given** several properties, **When** the member opens the panel, **Then** they see each
   property's contribution to the monthly total.
2. **Given** a household with recorded income for the period, **When** the member opens the
   panel, **Then** housing cost is shown as a share of that income, stated plainly and without
   a pass/fail judgement.
3. **Given** a household with no recorded income for the period, **When** the member opens the
   panel, **Then** the income share is omitted rather than shown as zero or as infinite.
4. **Given** a multifamily property, **When** the member views it, **Then** its unit occupancy
   and rental flow are shown.

---

### User Story 9 - Goals: the trajectory, not just the total (Priority: P3)

The goals card shows saved-of-target and a pace line. The panel shows how the balance got
there and when it will arrive.

**Why this priority**: Deferred behind the others because the goals widget is already the
subject of a separate open question about person-scoping, and because a fuller goal detail
page already exists to route out to — which lowers the panel's marginal value.

**Independent Test**: Open the panel for a goal with contributions spread over several months
and verify the trajectory and projection against the existing goal engine.

**Acceptance Scenarios**:

1. **Given** a goal with contributions over time, **When** the member opens the panel, **Then**
   they see the balance's progression, not only its current total.
2. **Given** a goal with a target date, **When** the member views it, **Then** they see the
   projected completion date at the current contribution rate beside the target date, with
   being behind shown calmly and never as an alarm.
3. **Given** several goals with target dates, **When** the member opens the panel, **Then**
   they see what total monthly amount would keep every goal on time.
4. **Given** any goal, **When** the member chooses to see more, **Then** they are routed to
   that goal's existing detail page rather than the panel duplicating it.

---

### User Story 10 - Recent activity: more than five rows (Priority: P3)

The activity card shows the five newest transactions. The panel shows a longer feed, grouped
by date.

**Why this priority**: Lowest value in the set, and honestly so — a full transactions
destination already exists and does this better. The panel's job here is a longer glance and
a clean hand-off, not a second transactions screen.

**Independent Test**: Open the panel for a household with more than five transactions and
verify ordering, grouping and the route out.

**Acceptance Scenarios**:

1. **Given** more than five transactions, **When** the member opens the panel, **Then** they
   see a longer feed, newest first, grouped by date.
2. **Given** any row in the feed, **When** the member selects it, **Then** they reach that
   transaction rather than a dead row.
3. **Given** the panel is open, **When** the member wants the full ledger, **Then** a route to
   the transactions destination is offered rather than reproduced in the panel.

---

### Edge Cases

- **A widget with no data at all.** Every panel MUST have an empty state of its own; a card
  showing "No budgets yet." must not open onto a blank frame.
- **A person with no data for that widget** while the household has plenty. The panel must
  read as an absent measurement, not a failed one — the distinction spec 056 drew between
  "—" and "No comparison yet".
- **A scope naming a person who has since left the household.** The panel must degrade to
  household scope exactly as the board does, and never blank.
- **Scope changing while a panel is open.** The controls sit behind the scrim on desktop and
  behind the full-screen panel on mobile, so this should not be reachable by pointer — but if
  it occurs by any route, the panel's figures and its caption must move together. A panel
  showing one subject under a caption naming another is the exact defect spec 056 removed.
- **A list far longer than the viewport** (activity, top merchants, a long amortization
  schedule). Content scrolls within the panel; nothing hard-clips.
- **A panel open across a width change** (a window resized past the breakpoint, a device
  rotated). It must remain open and usable in the other presentation.
- **A household of one** opening the balances panel, and a household with **no mortgage**
  opening the home equity panel — both are ordinary states, not errors.
- **Very small monetary values and zero-value rows** must render as money, not as blank cells.

## Requirements *(mandatory)*

### Functional Requirements

#### The panel frame

- **FR-001**: Activating a data widget's card MUST open a detail panel for that widget,
  replacing the current "Details coming soon." placeholder.
- **FR-002**: The system MUST allow a widget to declare a detail panel alongside its existing
  card body, as an optional part of that widget's single declaration. Adding a panel MUST NOT
  require changes to the board, to the settings list, or to any other widget.
- **FR-003**: A widget that declares no panel MUST continue to show the existing placeholder.
  This fallback is what allows panels to ship a few at a time rather than all at once.
- **FR-004**: Every panel MUST share one frame providing: the widget's title, a control to
  close it, a scrolling content region, and — where the app has a fuller destination for that
  subject — a consistent route out to it.
- **FR-005**: The frame MUST support an optional second level within the panel (selecting one
  mortgage, one merchant, one pair) with an explicit way back that returns to the panel's
  first level rather than closing the panel outright.
- **FR-006**: Navigation-shortcut widgets MUST continue to navigate on activation and MUST NOT
  gain panels.
- **FR-007**: The financial health widget is OUT OF SCOPE and MUST retain the placeholder.

#### Presentation per canvas

- **FR-008**: On expanded widths (≥1024px) the panel MUST present as the existing right-side
  drawer over a dimmed board, closing on the close control, on a scrim click, or on Escape.
- **FR-009**: Below that width the panel MUST fill the screen entirely, with no dimmed board
  behind it, matching the full-screen treatment the app already uses for its other detail
  views.
- **FR-010**: In the full-screen presentation, content MUST respect the device's safe-area
  insets at top and bottom, so nothing sits under a notch, a Dynamic Island, or a home
  indicator.
- **FR-011**: The panel MUST remain keyboard-operable and screen-reader-navigable: focus moves
  into the panel on open, is retained within it, and returns to the originating card on close.

#### Scope

- **FR-012**: Every panel MUST compute its figures for the dashboard's currently selected time
  window and currently selected person, without either being passed to it explicitly.
- **FR-013**: Every panel MUST state, visibly, which period and which subject its figures
  describe. A panel is a large surface full of derived numbers, and its subject must never be
  inferable only from a control that the panel is covering.
- **FR-014**: A panel for a widget that deliberately ignores one axis (activity and the housing
  widgets ignore the time window; balances ignore both) MUST caption honestly, describing only
  the axis it actually honours rather than claiming a window it does not apply.
- **FR-015**: The balances panel MUST derive its figures from the **whole** household ledger and
  narrow only its output, exactly as its card does. It MUST NOT consume person-projected
  transactions: projection rewrites each row to a single owner and destroys the
  payer-to-co-owner relationship a debt is derived from, which would produce a confident
  "all settled up" for a household that owes money.

#### Content

- **FR-016**: Each panel MUST answer at least one question its card demonstrably cannot.
- **FR-017**: Panels MUST derive their content from the data already loaded for the dashboard,
  computed locally, with no new network fetch — matching how every widget card works today.
- **FR-018**: Where a panel's subject already has a fuller destination in the app, the panel
  MUST summarise and route out to it rather than reproduce it.
- **FR-019**: Panels MUST NOT create, modify or delete financial data. Routing to an existing
  screen that does so is permitted; acting directly from the panel is not.
- **FR-020**: Every panel MUST have an explicit empty state consistent with its card's.

#### Presentation discipline

- **FR-021**: Panels MUST use only existing design tokens and MUST NOT introduce new colours.
  Overspending, shortfalls, debts and being behind pace are never shown in red; meaning is
  carried by position, weight and sign.
- **FR-022**: Projections and estimates MUST be worded as projections, never as settled fact.
- **FR-023**: All panel copy MUST be translated across every supported language.
- **FR-024**: This feature MUST NOT require a schema change, a migration, or a new dependency.

#### Regression

- **FR-025**: No widget card's rendered output may change. The panel is strictly additive; the
  existing widget test suites are the evidence, and are expected to pass unmodified.

### Key Entities

- **Widget panel**: an optional, self-contained view declared by a widget alongside its card
  body. Reads the same data the card does, at the same scope, and renders the detail the
  card's single glance omits. It has no identity, persistence, or configuration of its own.
- **Panel scope caption**: the statement of which period and which person a panel's figures
  describe. Derived, never stored; the panel's answer to "whose money, and when".

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every data widget except financial health opens a panel with real content. No
  member encounters the "Details coming soon." placeholder on any widget in scope.
- **SC-002**: On a phone the panel occupies the full screen with no board visible behind it;
  on a desktop it is the right-side drawer. Both are correct at every supported width, and a
  panel open across a width change remains open and usable.
- **SC-003**: 100% of panels state their period and their subject. A member can answer "whose
  money is this, and when?" without closing the panel.
- **SC-004**: Panels appear immediately on activation with no loading state, because every
  figure is derived from data already in hand.
- **SC-005**: Each panel answers at least one question its card cannot — verified per panel
  against the specific question named in its user story.
- **SC-006**: Adding a panel for one widget touches only that widget's own files plus a single
  line of the shared registry. This is what allows the remaining panels to be built
  independently and in parallel without colliding.
- **SC-007**: Every pre-existing widget test suite passes without modification, evidencing that
  no card's behaviour moved.
- **SC-008**: Three engines that currently ship with no user-facing consumer — the amortization
  schedule, the rollover ledger, and debt simplification — become reachable by members.
- **SC-009**: All panel copy is available in every supported language, with no untranslated
  strings.

## Assumptions

- **Mobile presentation reuses the existing shared drawer's full-screen mode** rather than
  introducing a route per widget. Decided with the user. The consequence, accepted knowingly:
  panels have no URL of their own and are therefore neither deep-linkable nor shareable, and
  the device back gesture does not dismiss them. Revisitable later without disturbing any
  panel's content, since the change would be confined to the frame.
- **The base branch delivers the frame plus two reference panels** (home equity and budgets),
  chosen for being structurally dissimilar. The shared primitives kit is **extracted from
  those two once built**, not designed ahead of them — a kit designed for nine imagined panels
  would have the wrong seams. Decided with the user.
- **The remaining seven panels are independent follow-ups**, each intended for its own isolated
  sandbox, built in parallel on this base. FR-002 and SC-006 exist to make that safe.
- **Scope arrives by inheritance, not by re-derivation.** The panel renders inside the same
  providers the board does, so both axes arrive without plumbing. This is spec 056's payoff and
  the reason FR-012 can be stated as a constraint rather than as a mechanism.
- **The excluded widgets are excluded for distinct reasons.** Financial health is the user's
  explicit exclusion and carries an unresolved question about the signed-in person versus the
  viewer's selection. The four navigation shortcuts are excluded structurally — they route
  instead of opening a panel, and always have.
- **Goals remains subject to a separate open question** about whether and how it is
  person-scoped. US9's panel does not settle that question and must not assume an answer.
- **Panels are a view, not a privacy boundary.** Row-level security remains household-wide;
  narrowing a panel to one person hides nothing from anyone. Panels must never be described to
  members as private.
- The engines behind the two reference panels are already covered by tests, so panel work is
  presentation and composition rather than new financial math.

## Dependencies

- Builds directly on spec 056 (person-scoped widgets), merged, which supplies the money-scope
  axis that FR-012 relies on. This branch is cut from that merge.
- Uses the existing shared drawer, including the full-screen mode already proven by the
  announcement host and the CSV import flow.
- Draws on existing engines for mortgage amortization, budget rollover, debt simplification,
  category ranking, routine detection, savings series, goal series and housing summary. No new
  financial engine is introduced.

## Out of Scope

- The financial health widget's panel.
- Panels for the four navigation-shortcut widgets.
- Deep-linkable panel URLs and device-back-gesture dismissal.
- Any action that writes financial data from within a panel, including settle-up prefill —
  the plumbing for which was removed in spec 043 and remains a separate deferred item.
- Changing any widget card's content, size or behaviour.
- Resolving whether goals or financial health should be person-scoped.
