# Feature Specification: Savings & Debts — replacing the Goals section

**Feature Branch**: `feat/059-savings-debts-redesign`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description: "Replace the Goals section with a Savings & Debts experience, per the design handoff (`README.md` + `Goals Redesign.html`). Every goal now reads as either savings or debt payoff, with opposite direction of travel. Surfaces: the Planning hub section (aggregate header, projection-first cards, collapsible in-place ledger), the goal detail page (five blocks), plus the dashboard Goals widget body and the spec-057 Goals detail panel adapted to the same vocabulary. User-visible copy renames 'Goals' to 'Savings & Debts' across all 6 languages; code/table names stay `goal`. New pure projection engine derives cadence, pace, and finish date from contributions; no schema change, no migration."

## Context

Today a household's savings targets and debt payoffs are both filed under one word — "Goals" — and
rendered by one component that treats them identically. Three problems follow, all of them visible
on screen today:

1. **The card's tallest element carries the least information.** Each card embeds a ledger of its
   last three contributions plus an "N more" line. For a goal paid at a steady amount those rows are
   literally identical ($600, $600, $600) — seven repetitions of one fact.
2. **Nothing answers the only question a savings target or a debt has: *when is this done?*** The
   card states "$13,300 to go", which is arithmetic, not an answer.
3. **Debt and savings run in opposite directions but render identically.** A debt shrinking toward
   zero and a savings balance growing toward a target are shown with the same bar, the same headline,
   and the same verbs.

The detail page then repeats the card wholesale and adds two charts that carry no information: a
near-straight cumulative line with no target and nowhere to go, and a "by month" bar chart that is a
picket fence of equal bars.

The underlying data already distinguishes the two — every goal carries a kind of either *savings* or
*debt payoff* — so this is a presentation and derivation change, not a data change. Nothing about
what a household has recorded moves.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A card that answers "when is this done?" (Priority: P1)

A member opens Planning and sees each savings target and debt as a compact card whose headline is the
number that matters for its type, whose subtitle states the cadence in one line instead of repeating
it as rows, and whose last line names the month it finishes and how many payments remain.

**Why this priority**: This is the whole point of the redesign and the single largest information
gain. It is also self-contained — it needs no aggregate header, no detail page, and no new
navigation. Delivered alone it already replaces repetition with an answer.

**Independent Test**: Render the Planning section for a household with one steadily-paid debt and one
savings target and confirm each card states a projected finish month, a payment count, a
type-appropriate headline, and a one-line cadence — with no contribution rows visible.

**Acceptance Scenarios**:

1. **Given** a debt payoff with a steady monthly contribution history, **When** a member views
   Planning, **Then** the card headline reads the amount **left**, the sub-line reads
   "Debt · {amount}/mo since {month}", and the closing line reads "Clear by {month} — {n} more
   payments".
2. **Given** a savings target with a steady monthly contribution history, **When** a member views
   Planning, **Then** the card headline reads the amount **saved**, the sub-line reads
   "Savings · {amount}/mo since {month}", and the closing line reads "Funded by {month} — {n} more
   deposits".
3. **Given** a savings target, **When** its card renders, **Then** its bar fills from the left and
   grows as money is added; **given** a debt, **Then** its bar is anchored right and depletes toward
   zero as money is paid — both drawn in the single sage hue, neither in red.
4. **Given** a goal with fewer than three recorded contributions, **When** its card renders, **Then**
   the closing line reads that there is not enough history to project yet, and no finish month or
   payment count is stated anywhere.
5. **Given** a card with any number of contributions, **When** the card renders collapsed, **Then**
   its height does not vary with that number.

---

### User Story 2 - One line for the whole plan (Priority: P2)

A member sees, above the individual cards, what the whole set costs them each month and how much of
the combined total is already behind them — the one thing no individual card can show.

**Why this priority**: High value and cheap, but strictly additive: the cards are readable and
complete without it. It depends on US1's per-item derivations already existing.

**Independent Test**: Render the section for a household with three items of mixed type and confirm
the header states the summed monthly commitment, the summed progress against the summed total, and
names the soonest and latest finishing item.

**Acceptance Scenarios**:

1. **Given** three items with cadences, **When** the section renders, **Then** the header states the
   total monthly commitment, the combined amount behind them, and the combined total.
2. **Given** three items with projections, **When** the section renders, **Then** a sub-line names
   the next item to finish and the last, each with its month.
3. **Given** exactly one item with a cadence, **When** the section renders, **Then** the sub-line
   names only that item, with no "last:" clause.
4. **Given** no item has enough history for a cadence, **When** the section renders, **Then** the
   sub-line is absent entirely rather than empty or zeroed.
5. **Given** any set of items, **When** the section renders, **Then** a footer states the count of
   active items and the total monthly commitment.

---

### User Story 3 - Fixing a contribution without leaving the page (Priority: P2)

A member notices a wrong amount, opens the contribution list inline on the card, corrects the row in
place, and stays on Planning.

**Why this priority**: This is what makes removing the always-visible ledger safe rather than a
regression — the common case (fix a wrong amount) must not become harder. It is independent of the
detail page and of the aggregate header.

**Independent Test**: Expand a card's contribution list, edit and delete a row, and confirm both take
effect without navigating away and that the card's headline and total agree afterwards.

**Acceptance Scenarios**:

1. **Given** a collapsed card, **When** a member activates the contribution disclosure, **Then** the
   list unfolds beneath the card's footer, newest first, without navigating anywhere.
2. **Given** an expanded list, **When** a member activates a second card's disclosure, **Then** the
   first collapses — at most one is open at a time.
3. **Given** an expanded list, **When** a member edits or deletes a row, **Then** the change is saved
   and the card's headline, bar, and total reflect it.
4. **Given** an expanded list, **When** it renders, **Then** a closing total row states the total
   contributed, reconciling against the card's headline.
5. **Given** an item with more than twelve contributions, **When** the list expands, **Then** it shows
   twelve and offers a link to see the rest on the detail page.

---

### User Story 4 - Understanding one item in depth (Priority: P3)

A member opens one savings target or debt and finds five blocks that each answer something the old
page did not: when it finishes and what would move that date, how the balance is tracking toward the
target, whether each payment matched the plan, whether any month was missed, and the full ledger.

**Why this priority**: The deepest work and the largest surface, but reached only by an explicit
navigation from a card that is already complete without it.

**Independent Test**: Open the detail page for an item with a mixed-pace history and confirm all five
blocks render with values derived from that history, including a what-if table whose alternative rows
state earlier dates than the current plan.

**Acceptance Scenarios**:

1. **Given** an item with enough history, **When** its detail page renders, **Then** a projected-finish
   block states the finish month and the number of months, followed by a table of scenarios each with
   its own resulting date and the difference from the current plan.
2. **Given** a scenario that finishes earlier, **When** the table renders, **Then** its difference is
   marked as an improvement; **given** one that finishes later, **Then** its difference is stated
   plainly and is never marked as a warning.
3. **Given** an item whose recent pace differs from its planned amount, **When** the table renders,
   **Then** the first row states the recent average as the basis for the projection, and the planned
   amount appears as an improvement row rather than as the baseline.
4. **Given** an item with contributions, **When** the progress block renders, **Then** the chart shows
   the accumulated total, a target line, and a projection from today to where the target is reached,
   with the horizontal span running from the item's start to its projected finish.
5. **Given** an item's contribution months, **When** the pace block renders, **Then** one bar per month
   is drawn against a plan line, a count of on-plan months is stated, and one sentence reads the
   result.
6. **Given** a month with no contribution, **When** the consistency block renders, **Then** that month
   is shown by absence and an outline, never by a warning colour.
7. **Given** an item with fewer than three contributions, **When** its detail page renders, **Then**
   the projection, progress, pace, and consistency blocks collapse to a single line saying there is
   not enough history yet, and the ledger still renders in full.

---

### User Story 5 - The same vocabulary everywhere (Priority: P3)

A member who has learned the savings/debt distinction on Planning sees the same words, the same
direction of travel, and the same projections on the dashboard — both in the compact widget and in
the detail panel it opens.

**Why this priority**: Consistency, not new capability. Deliberately last: the dashboard surfaces are
correct today, just phrased in the old vocabulary, so this is the only story whose absence leaves no
gap in function.

**Independent Test**: Render the dashboard widget and its panel for a household with one item of each
type and confirm both use the type-appropriate headline, verbs, and bar direction, and that the panel
states projections consistent with the Planning card for the same item.

**Acceptance Scenarios**:

1. **Given** a mixed household, **When** the dashboard widget body renders, **Then** each row uses the
   type-appropriate headline and bar direction.
2. **Given** the same household, **When** the detail panel opens, **Then** the projections it states
   match those the Planning card states for the same item on the same reference date.
3. **Given** any surface in this feature, **When** it names the section, **Then** it reads
   "Savings & Debts" and never "Goals".

---

### Edge Cases

- **Fewer than three contributions** — no projection anywhere. Never extrapolate a finish date from a
  single payment.
- **No contributions at all** — the card states its target and an invitation; no cadence, no
  projection, no charts.
- **A completed item** (contributed at or beyond target) — no finish date and no projection line; it
  reads as reached.
- **An item whose derived pace is zero** — no finish date; treated as "not enough history".
- **A contribution dated before the item was created** — still counted; the timeline starts at or
  before the earliest contribution rather than dropping it off the edge.
- **Two contributions on the same day** — the running total carries both as one point; the ledger
  still lists them as separate, individually editable rows.
- **A month whose contribution exceeds the plan** — drawn taller than the plan line, not clamped.
- **A partial final payment** — a remainder of less than one full payment still counts as one more
  payment; the remainder is not called out separately.
- **A very long item name** — truncated at the column edge; it never widens the row or pushes the
  headline number off screen.
- **An item with no target amount, or a target date instead of a target amount** — out of scope; see
  Assumptions.

## Requirements *(mandatory)*

### Functional Requirements

#### Derivation

- **FR-001**: The system MUST derive, for each item, the total contributed, the amount remaining, and
  the fraction complete from its recorded contributions and target — with no new stored field.
- **FR-002**: The system MUST derive a cadence amount and a cadence day-of-month from the most
  frequently occurring contribution amount and day.
- **FR-003**: The system MUST classify each contribution month as on-plan or off-plan against the
  cadence amount within a stated tolerance, and MUST identify months between the first contribution
  and the reference date with no contribution as missed.
- **FR-004**: The system MUST project a finish date from a pace that equals the cadence amount when
  every month is on plan, and the recent average otherwise, and MUST state which basis it used.
- **FR-005**: The system MUST round a partial final payment up to a whole payment when stating the
  number of payments remaining.
- **FR-006**: The system MUST NOT state a projection of any kind for an item with fewer than three
  contributions, a derived pace of zero, or a reached target.
- **FR-007**: The system MUST treat the reference date as an injected value, never the ambient clock,
  so every derived date is deterministic and testable.
- **FR-008**: All derivations MUST be pure and computed on read; nothing derived here is persisted.

#### The Savings & Debts section

- **FR-009**: The section header MUST state the total monthly commitment across items, the combined
  amount contributed, and the combined target, in one sentence.
- **FR-010**: The header MUST name the next item to finish and the last, with their months, omitting
  the "last" clause when only one item has a projection and omitting the line entirely when none does.
- **FR-011**: The header MUST show a single bar splitting funded from remaining across the combined
  total.
- **FR-012**: Each item MUST render as a card stating: its name; a headline of *amount left* for a
  debt and *amount saved* for savings; a one-line sub-line of type, cadence amount, and start month;
  a percentage phrased as "paid" for a debt and "funded" for savings; a progress bar; a caption
  stating progress against target; and a closing line stating the projected finish and remaining
  payment count.
- **FR-013**: A savings bar MUST fill from the left and grow with contributions. A debt bar MUST be
  anchored to the right and deplete toward zero, with the paid share shown behind it at a lower
  opacity.
- **FR-014**: A collapsed card's height MUST NOT vary with its number of contributions.
- **FR-015**: Each card MUST offer a disclosure stating the contribution count and cadence, which
  expands the contribution list in place; at most one card MUST be expanded at a time.
- **FR-016**: The expanded list MUST show contributions newest first, each editable and deletable in
  place, closed by a total row; it MUST cap at twelve rows and offer a route to the detail page beyond
  that.
- **FR-017**: The section MUST offer creating a new item from its header and adding a contribution
  from each card.
- **FR-018**: The section MUST close with a footer stating the count of active items and the total
  monthly commitment.

#### The detail page

- **FR-019**: The page MUST open with a hero stating the item's type, cadence, and start; a headline
  of the type-appropriate amount with the target as a qualifier; and the same bar and caption
  construction as the card.
- **FR-020**: A projected-finish block MUST state the finish month and the number of months, followed
  by a table of derived scenarios — the current pace, two higher amounts, and skipping one month —
  each with its resulting date and the difference from the current plan.
- **FR-021**: When the item's recent pace differs from its planned amount, the table's first row MUST
  state the recent average as the projection basis, and the planned amount MUST appear as an
  improvement row.
- **FR-022**: A scenario finishing earlier MUST be marked as an improvement; one finishing later MUST
  be stated plainly, with no warning treatment.
- **FR-023**: A progress block MUST plot the accumulated total against a target line, with a
  projection from the present to the target, over a span running from the item's start to its
  projected finish, with a legend naming both series.
- **FR-024**: A pace block MUST draw one bar per contribution month against a plan line, state how
  many months were on plan, and read the result in one sentence. A bar MAY exceed the plan line and
  MUST be drawn at its true height; a missing month MUST be drawn at zero height with no stub.
- **FR-025**: A consistency block MUST show one cell per month of the item's life — filled when on
  plan, dimmed when under plan, outlined and empty when missed — state the current streak, and read
  the result in one sentence.
- **FR-026**: A contributions block MUST list the full ledger, newest first, uncapped, each row
  editable and deletable, closed by a total.
- **FR-027**: When an item has fewer than three contributions, the projected-finish, progress, pace,
  and consistency blocks MUST collapse to a single line stating that there is not enough history; the
  contributions block MUST still render in full.

#### Vocabulary and reach

- **FR-028**: Every user-visible reference to this feature MUST read "Savings & Debts" — the Planning
  section, the dashboard widget title, the detail panel, and the page — and MUST NOT read "Goals".
- **FR-029**: The dashboard widget body and the detail panel MUST use the same type-appropriate
  headline, verbs, and bar direction as the Planning card, and MUST state projections consistent with
  it for the same item and reference date.
- **FR-030**: All new and renamed user-visible strings MUST be present in all six supported languages.
- **FR-031**: Stored data, table names, and identifiers MUST be unchanged; the rename is presentation
  only.

#### Calm constraints (from the constitution and the handoff)

- **FR-032**: Nothing in this feature MUST ever be rendered in red — not a missed month, not a later
  projection, not a shortfall.
- **FR-033**: Savings and debt MUST be distinguished by direction of travel, wording, and icon
  treatment, using a single hue at varying opacity; a second hue MUST NOT be introduced to separate
  them.
- **FR-034**: A later date MUST NOT read more alarmingly than an earlier one.
- **FR-035**: The feature MUST NOT recommend a contribution amount or judge the member's pace; the
  what-if table offers levers without endorsing one.
- **FR-036**: Every money, percentage, count, and date value MUST be rendered in tabular figures.
- **FR-037**: Cadence MUST be described as observed past behaviour, never as a commitment the app will
  execute.

### Key Entities

- **Savings or debt item**: A named household target with a kind (savings or debt payoff), a target
  amount, an optional target date, and a creation date. Unchanged from today — only its presentation
  and the vocabulary naming it change.
- **Contribution**: One dated amount recorded against an item. Unchanged. The sum of an item's
  contributions is its progress; the distribution of their amounts and dates is what every new
  derivation in this feature is computed from.
- **Projection** *(derived, never stored)*: For one item — its cadence amount and day, its pace basis,
  its remaining payment count, and its projected finish date, or an explicit "not enough history".
- **Plan summary** *(derived, never stored)*: Across all items — total monthly commitment, combined
  contributed and target, and the soonest and latest projected finishes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can name the month a savings target or debt finishes without opening it or
  performing any arithmetic.
- **SC-002**: A collapsed card's rendered height is identical for an item with 3 contributions and one
  with 30.
- **SC-003**: The section's total height for three items is lower than today's, despite gaining an
  aggregate header.
- **SC-004**: A member can distinguish a savings item from a debt item without reading any word — from
  bar direction and icon treatment alone.
- **SC-005**: Correcting a wrong contribution amount requires no navigation away from the Planning
  page.
- **SC-006**: Every stated finish date, payment count, and on-plan count is reproducible from the
  item's contributions alone, and is identical across the card, the detail page, the dashboard widget,
  and the detail panel for the same reference date.
- **SC-007**: No surface in this feature renders any element in a warning or error colour under any
  data condition, including missed months and later projections.
- **SC-008**: An item with fewer than three contributions produces no projected date anywhere in the
  application.
- **SC-009**: Every user-visible string introduced or renamed by this feature resolves in all six
  supported languages, with no untranslated fallback.
- **SC-010**: No stored record changes as a result of this feature; a household's data is
  byte-identical before and after.

## Assumptions

- **The kind already exists.** Every item is already stored as either savings or debt payoff, so no
  migration, backfill, or member-facing reclassification step is needed. Existing items keep the kind
  they have.
- **Contributions are manual.** There is no scheduled or automatic contribution, so cadence is
  *inferred from history* and is described as observed behaviour, never as a future commitment.
- **The rename is presentation-only.** Table names, identifiers, routes, and component names keep the
  word "goal"; only member-facing copy changes. Existing URLs continue to work.
- **Three contributions is the projection floor.** Fewer than three is treated as insufficient history
  everywhere, chosen so a single payment can never imply a finish date.
- **A partial final payment counts as a whole one.** A remainder of 22.17 payments is stated as 23;
  the remainder is not called out. Flagged in the handoff as changeable only on request.
- **Items without a target amount, and items with a target date but no contribution pattern, are out
  of scope.** The handoff did not draw them and it is unconfirmed whether they occur. If they do, they
  need their own treatment rather than an invented one.
- **Paused, archived, and shared-between-people items are out of scope.** Not drawn, and no such state
  exists today.
- **The "runway" view is parked.** Showing all items as lanes on one shared time axis was explored and
  deliberately rejected at this item count; it restates the per-card projection. Revisit past roughly
  six items.
- **The existing progress and pacing engine stays untouched.** It is locked by regression fixtures and
  is consumed elsewhere; the new derivations are additive so that the existing fixtures remain
  byte-identical.
- **The dashboard widget is a fixed, compact grid cell.** It adopts this feature's vocabulary and
  direction of travel, but not its charts — those need room the cell does not have.
