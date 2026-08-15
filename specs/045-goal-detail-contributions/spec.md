# Feature Specification: Goal Detail & Contribution Editing

**Feature Branch**: `045-goal-detail-contributions`

**Created**: 2026-08-15

**Status**: Draft

**Input**: User description: "Build out the Planning hub's goals section and give each goal its own detail page. On /planning, the goals summary becomes one card per goal with richer detail (progress, saved-of-target, pace/status, recent contributions, and the actions to add a contribution or open the goal). The separate /planning/goals index page is retired — its route file becomes the per-goal DETAIL page, addressed as /planning/goals?id=<goalId> (the app is a static export, so a dynamic [goalId] segment cannot be pre-rendered; ?id= is the established repo pattern, as used by housing/edit and transactions/edit via parseIdParam). The detail page shows in-depth information about one goal — headline saved-of-target, progress, pacing/projection, target date — plus charts: cumulative contributions over time against the steady-pace line, and a per-month contribution breakdown. From the detail page a user can edit the goal, and can EDIT or DELETE an individual contribution (today only add and delete-the-whole-goal exist; the store has addContribution and deleteContribution but no updateContribution, so that needs adding along with its Supabase update path). Contribution editing must preserve the money invariants: integer USD cents, display-currency conversion at the edges only. Fully TDD, i18n across all five catalogs, calm/never-red per the constitution, and no DB migration (goal_contributions already has every column needed)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See every goal as its own card on the Planning hub (Priority: P1) 🎯 MVP

Someone opens Planning to check how their saving is going. Today the Goals section is a
compact list of thin rows — a name, a bar, and a status line — with a single "View all goals"
link that leads to a separate page showing the same goals again in a different shape. They
have to leave the hub to do anything at all with a goal.

Now each goal is its own card on the hub, carrying enough to answer "how is this one going?"
without navigating: the goal's name and kind, saved of target, a progress bar, how much is
left, its pace or reached status, and its most recent contributions. Each card offers the two
things a person actually wants to do next — record a contribution, or open the goal for the
full picture.

**Why this priority**: This is the visible half of the request and stands entirely on its own.
Even with no detail page, richer per-goal cards on the hub remove the "two places showing the
same goals" confusion and make the section useful where people already are.

**Independent Test**: With two or more goals in the household, open `/planning` and confirm
each goal renders as its own card with progress, saved-of-target, remaining, status, and
recent contributions; adding a contribution from a card updates that card's figures without a
page change.

**Acceptance Scenarios**:

1. **Given** a household with three goals, **When** the user opens Planning, **Then** the Goals
   section shows three cards, one per goal, each with its own progress bar and money figures.
2. **Given** a goal with contributions, **When** the user views its card, **Then** the card lists
   its most recent contributions with dates and amounts.
3. **Given** a goal that is behind its target date, **When** the user views its card, **Then** the
   card states the catch-up amount per month, drawn in calm sand — never red.
4. **Given** a household with no goals, **When** the user opens Planning, **Then** the Goals
   section shows a single calm invitation to create one, and no cards.
5. **Given** any goal card, **When** the user chooses "Add contribution", **Then** the
   contribution form opens without leaving Planning, and on save the card's saved-of-target,
   bar, and remaining update.

---

### User Story 2 - Open one goal and understand it in depth (Priority: P1)

Someone wants the full story of a single goal: not just how far along it is, but how it got
there and whether the current rate will land it on time. They open the goal from its card and
get a page devoted to it — the headline saved-of-target, progress, its target date and
projection, and two charts: how the saved total accumulated over time against the steady pace
the target date implies, and how much went in each month.

**Why this priority**: This is the other half of the request, and it is what makes retiring the
old index page a gain rather than a loss — the route stops being a second list and becomes the
place where a goal is actually understood. It depends on nothing from US1 beyond a link.

**Independent Test**: Open a goal's detail address directly with a valid goal id and confirm the
page renders that goal's headline figures, status, and both charts, computed from its own
contributions; open it with a missing or unknown id and confirm it returns the user to Planning
rather than erroring.

**Acceptance Scenarios**:

1. **Given** a goal with several contributions across months, **When** the user opens its detail
   page, **Then** the page shows that goal's name, kind, saved of target, progress, remaining,
   and — when dated — its target date and pace status.
2. **Given** the same goal, **When** the user views the detail page, **Then** a cumulative chart
   shows the saved total rising over time alongside the steady-pace line implied by the target
   date, and a per-month chart shows each month's contribution total.
3. **Given** a goal with no target date, **When** the user opens its detail page, **Then** the
   cumulative chart renders without a pace line and no projection is claimed.
4. **Given** a goal with no contributions yet, **When** the user opens its detail page, **Then**
   the charts are replaced by a calm empty state inviting a first contribution — not an empty
   grid or a zero-height chart.
5. **Given** a detail address with no id, an unknown id, or a goal deleted while the user was
   away, **When** the page loads, **Then** the user is returned to Planning without an error
   screen.
6. **Given** a goal's detail page, **When** the user edits the goal, **Then** the same edit form
   used elsewhere opens and saving returns the user to the updated detail page.
7. **Given** a goal is deleted from its detail page, **When** the deletion completes, **Then** the
   user is returned to Planning and the goal is gone from the hub.

---

### User Story 3 - Correct or remove a single contribution (Priority: P2)

Someone mistyped a contribution — wrong amount, wrong date, or a note they want to fix — or
recorded one that never happened. Today the only remedies are to delete the entire goal or to
live with a wrong saved total, because a contribution can be added but never corrected. From
the goal's detail page they can now change any contribution's amount, date, or note, or delete
that one contribution, and the goal's saved total, progress, pacing, and charts all follow.

**Why this priority**: It fixes a real dead end — a wrong number that cannot be corrected makes
the whole saved total untrustworthy — but the goal detail page has to exist first for the
contribution ledger to live on.

**Independent Test**: On a goal with contributions, change one contribution's amount and confirm
the goal's saved total, remaining, progress bar, and charts all move by exactly the difference;
delete a contribution and confirm the same figures fall by exactly that contribution's amount.

**Acceptance Scenarios**:

1. **Given** a goal with a $50 contribution, **When** the user edits it to $75, **Then** the
   goal's saved total rises by exactly $25 and the progress bar, remaining, and both charts
   reflect the new total.
2. **Given** a contribution, **When** the user edits it, **Then** the form opens pre-filled with
   that contribution's current amount, date, and note.
3. **Given** a contribution being edited, **When** the user clears the amount or enters zero or
   less, **Then** saving is blocked and the stored contribution is unchanged.
4. **Given** a contribution, **When** the user deletes it, **Then** it is removed from the ledger
   and the goal's saved total falls by exactly its amount.
5. **Given** the user's display currency is not USD, **When** they open a contribution for
   editing and save it without touching the amount, **Then** the stored amount is unchanged to
   the cent — no rounding drift from the display round-trip.
6. **Given** a contribution edit is saved, **When** the change reaches the shared household
   data, **Then** every household member sees the corrected figure.

---

### Edge Cases

- **A goal with a target of zero or less**: progress is zero and never divides by zero; the card
  and detail page still render, and no percentage claims more than 100%.
- **Contributions dated in the future or before the goal was created**: they still count toward
  the saved total (the ledger is the record); the cumulative chart's window spans the earliest
  contribution to the later of today and the target date, so no point falls off the chart.
- **Two contributions on the same day**: both are listed separately and are individually
  editable — the ledger is not collapsed by date.
- **A single contribution**: the cumulative chart renders a meaningful line rather than a single
  invisible point.
- **Saved total exceeding the target**: progress is capped at 100%, the goal reads as reached,
  and the overshoot is never framed as an error.
- **A contribution edited or deleted by another household member while this page is open**: the
  page reflects the shared data on its next load rather than asserting a stale total.
- **Editing a contribution to a date outside every existing month**: the per-month chart gains
  that month rather than dropping the contribution.
- **The detail page opened on a phone**: the charts and the contribution ledger remain readable
  and reachable at compact width — no horizontal page scroll.

## Requirements *(mandatory)*

### Functional Requirements

**Planning hub goals section (US1)**

- **FR-001**: The Planning hub MUST render each goal as its own card rather than as a row in a
  combined list.
- **FR-002**: Each goal card MUST show the goal's name, kind, saved amount, target amount,
  progress, and amount remaining.
- **FR-003**: Each goal card MUST show pace status for a dated goal — on track, behind (with the
  monthly catch-up amount), or reached — and MUST show no pace claim for an undated goal.
- **FR-004**: Each goal card MUST show that goal's most recent contributions, newest first.
- **FR-005**: Each goal card MUST offer an action to record a contribution and an action to open
  the goal's detail page.
- **FR-006**: The Goals section MUST show a calm invitation, and no cards, when the household has
  no goals.
- **FR-007**: Off-track goals MUST be ordered before on-track ones, preserving today's behavior.

**Goal detail page (US2)**

- **FR-008**: The system MUST provide a page devoted to a single goal, addressed by that goal's
  identifier.
- **FR-009**: The detail page MUST show the goal's name, kind, saved of target, progress,
  remaining, and — when dated — target date and pace status.
- **FR-010**: The detail page MUST show a cumulative view of how the saved total accumulated over
  time, and — for a dated goal — the steady pace the target implies, so the user can see whether
  they are above or below it.
- **FR-011**: The detail page MUST show a per-month breakdown of contribution totals.
- **FR-012**: The detail page MUST replace both charts with a calm empty state when the goal has
  no contributions.
- **FR-013**: The detail page MUST return the user to Planning when no goal identifier is
  supplied, when the identifier matches no goal, or when the goal is deleted.
- **FR-014**: The detail page MUST let the user edit the goal, reusing the existing goal form.
- **FR-015**: The detail page MUST let the user delete the goal and MUST return them to Planning
  when it is deleted.
- **FR-016**: The former goals index page MUST no longer exist as a separate list of all goals;
  every entry point to goals leads either to the hub's cards or to a specific goal's detail page.

**Contribution editing (US3)**

- **FR-017**: Users MUST be able to change an existing contribution's amount, date, and note.
- **FR-018**: Users MUST be able to delete an individual contribution without deleting the goal.
- **FR-019**: The edit form MUST open pre-filled with the contribution's stored amount, date, and
  note.
- **FR-020**: The system MUST reject a contribution amount of zero or less, leaving the stored
  contribution unchanged.
- **FR-021**: A contribution's stored amount MUST be preserved exactly when the user saves without
  changing the amount, in every display currency — no rounding drift from converting to the
  display currency and back.
- **FR-022**: Every figure derived from contributions — saved total, remaining, progress, pace,
  and both charts — MUST update consistently after an edit or a delete.
- **FR-023**: A contribution edit MUST persist to the shared household data so other members see
  it, and MUST leave the ledger unchanged if persisting fails.

**Cross-cutting**

- **FR-024**: All money MUST remain integer USD cents in storage, converted to the display
  currency only for presentation and back only at the point of entry.
- **FR-025**: Every new user-facing string MUST be present in all five translation catalogs with
  matching placeholder arity.
- **FR-026**: Being behind pace, over target, or at zero MUST never be rendered in red, and no new
  color may be introduced outside the design tokens.
- **FR-027**: The feature MUST require no database schema change.

### Key Entities

- **Goal**: Something the household is saving toward or paying off — a name, a kind (savings or
  debt payoff), a target amount, and an optional target date. Progress is never stored; it is
  always the sum of the goal's contributions.
- **Goal contribution**: One recorded payment toward a goal — an amount, a date, an optional
  note, and who recorded it. The ledger of contributions is the sole source of a goal's progress,
  which is why an incorrect one must be correctable.
- **Goal pacing**: The derived comparison between what has been saved and what a steady pace
  toward the target date would imply by now — the basis of "on track", "behind by this much a
  month", and the detail page's pace line. Derived, never stored.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From the Planning hub, a user can see every goal's progress, remaining amount, and
  pace status without navigating away.
- **SC-002**: A user can reach a single goal's full detail — including how its total accumulated
  over time — in one action from the hub.
- **SC-003**: A user can correct a mistyped contribution in under 30 seconds, and the goal's saved
  total reflects the correction immediately.
- **SC-004**: Correcting a contribution changes the goal's saved total by exactly the difference
  between the old and new amounts, to the cent, in every supported display currency.
- **SC-005**: Goals appear in exactly one list in the product; no user can reach two different
  pages that both list all goals.
- **SC-006**: Opening a goal detail address that no longer resolves returns the user to Planning
  with no error screen, in 100% of cases.
- **SC-007**: The goal detail page is fully usable at phone width with no horizontal page
  scrolling.

## Assumptions

- **Contribution editing is not restricted by who recorded it.** Household data is shared and any
  member can already delete a goal outright, so any member may correct any contribution. This
  matches the existing permission model rather than introducing a new one.
- **Charts are rendered from the household's own contribution history only.** No projection beyond
  the steady-pace line implied by the target date is claimed, and no bank data is involved.
- **The per-month breakdown covers only months that have contributions**, plus the months between
  them, so a long-dormant goal does not render hundreds of empty columns.
- **Recent contributions on a hub card are capped** to keep cards a scannable, comparable size;
  the complete ledger lives on the detail page.
- **The existing goal form and contribution form are reused** rather than replaced; the
  contribution form gains an edit mode alongside its current add mode.
- **The goal detail address uses a query identifier rather than a path segment.** The app ships as
  a static export, so a per-goal path segment cannot be pre-rendered for identifiers that only
  exist at runtime; the query form is already how this product addresses a specific record.
- **No database change is required** — the contribution record already carries every field this
  feature edits.
- **`goalProgress` and `goalPacing` are reused unchanged**; this feature adds presentation and one
  new write path, not new money math beyond deriving the chart series.
