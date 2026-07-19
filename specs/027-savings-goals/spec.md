# Feature Specification: Savings & Debt-Payoff Goals

**Feature Branch**: `027-savings-goals`

**Created**: 2026-07-18

**Status**: Draft

**Input**: User description: "Savings & debt-payoff goals (§3.1): named goals with a target amount (USD cents), optional target date, and an optional linked account or category. A calm progress view shows target vs progress, where progress is either accumulated contributions or a linked account's balance. One insights-engine rule flags a goal that is off-track (behind the pace needed to hit its target by the target date). Follow the existing cents model and insights-engine patterns; add a Supabase migration for a goals table."

## Overview

Ortho helps a household see where its money is; it does not yet help them aim it
at something. This feature adds **named goals** — an emergency fund, a trip, or
paying off a debt — each with a **target amount** and, optionally, a **target
date**. A household member records **contributions** toward a goal; a **calm
progress view** shows how far along they are (saved vs target) and, when a target
date is set, whether they are keeping pace. A single new **insights rule** flags a
goal that has fallen **off-track** — behind the steady pace needed to reach its
target by the target date — and suggests the monthly contribution that would get
it back on track.

The feature is deliberately **self-contained and privacy-safe**: progress is
driven entirely by contributions the household records itself, using the existing
integer-USD-cents money model. A goal may be *associated* with a linked bank
account or a spending category for context, but that association does not drive
progress in this version (see Assumptions / Out of Scope).

Savings goals ("reach $5,000") and debt-payoff goals ("pay off $3,000") share one
progress model: each accumulates contributions toward a target amount; the only
difference is the plain-language framing.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a goal and see its progress (Priority: P1)

A household member creates a named goal with a target amount (e.g. "Emergency
fund — $10,000"), optionally a target date, and optionally an associated account
or category. They record contributions over time and open the goal to see a calm
progress view: how much is saved, how much remains, and the fraction complete.

**Why this priority**: This is the core, standalone value — naming an intention
and watching it fill up. Without it there is no feature. It delivers value with no
dependency on target dates or insights.

**Independent Test**: Create a goal with a target, add two contributions, and
confirm the progress view shows saved = sum of contributions, remaining = target −
saved (never below zero), and a completion state once saved meets or exceeds the
target. Fully testable with no target date and no insights.

**Acceptance Scenarios**:

1. **Given** a new goal "Trip" with target $2,000 and no contributions, **When**
   the member opens it, **Then** the view shows $0 of $2,000 saved, $2,000
   remaining, and 0% complete.
2. **Given** that goal with contributions of $500 and $250, **When** the member
   opens it, **Then** the view shows $750 of $2,000 saved, $1,250 remaining, and
   38% complete (rounded).
3. **Given** a goal whose contributions sum to at or above its target, **When** the
   member opens it, **Then** the view shows it as **reached** with remaining $0 and
   never a negative remaining or a fraction above 100%.
4. **Given** a debt-payoff goal "Card — $3,000", **When** the member records
   payments toward it, **Then** progress accrues identically to a savings goal
   (payments-so-far of $3,000 = reached), framed as amount paid off.

---

### User Story 2 - Know when a dated goal falls behind pace (Priority: P2)

A member sets a target date on a goal. When they fall behind, one calm insight
surfaces on the dashboard telling them the goal is off-track and what monthly
contribution would recover it.

**Why this priority**: Turns a static target into a plan. It builds on P1 (needs a
goal + progress) and is the "keep me honest" value, but a goal without a date is
still fully useful, so this is P2.

**Independent Test**: Given a goal with a target, a target date, and contributions
that lag the linear pace beyond the tolerance, confirm exactly one off-track
insight is produced with the goal's identity, the amount behind, and a suggested
monthly contribution; and confirm that an on-pace, reached, or date-less goal
produces no such insight.

**Acceptance Scenarios**:

1. **Given** a $12,000 goal due in 12 months with $1,000 saved after 6 months
   (expected ≈ $6,000 at a steady pace), **When** insights are generated, **Then**
   one off-track insight names the goal, states it is behind, and suggests a monthly
   contribution to still reach the target by the date.
2. **Given** a goal whose saved amount is at or above the steady-pace expectation
   for today, **When** insights are generated, **Then** no off-track insight is
   produced for it.
3. **Given** a goal already reached, **When** insights are generated, **Then** no
   off-track insight is produced regardless of the date.
4. **Given** a goal with no target date, **When** insights are generated, **Then**
   no off-track insight is produced (there is no pace to fall behind).
5. **Given** a goal whose target date is already in the past and is not reached,
   **When** insights are generated, **Then** it is flagged off-track (fully behind).

---

### User Story 3 - Manage goals over their life (Priority: P3)

A member edits a goal's name, target, or date; deletes a goal they no longer want;
and removes a contribution recorded in error. Goals belong to the household and are
visible to every member.

**Why this priority**: Necessary for real use but not for the first demonstrable
slice; create + view + insight prove the concept.

**Independent Test**: Edit a goal's target and confirm progress and pace recompute;
delete a goal and confirm it and its contributions disappear for every household
member; remove a contribution and confirm saved decreases accordingly.

**Acceptance Scenarios**:

1. **Given** an existing goal, **When** a member edits its target amount, **Then**
   the progress fraction, remaining, and any pace assessment recompute from the new
   target.
2. **Given** a goal with contributions, **When** a member deletes the goal, **Then**
   the goal and all its contributions are removed for every household member.
3. **Given** a goal with two contributions, **When** a member removes one, **Then**
   saved becomes the sum of the remaining contributions.

---

### Edge Cases

- **Zero or absent target**: a goal must have a positive target amount; progress
  fraction is defined only for a positive target (a non-positive target is rejected
  at save time, mirroring how budgets treat non-positive limits).
- **Over-funding**: contributions exceeding the target show the goal as reached;
  remaining is floored at $0 and the fraction is capped at 100% — surplus is never
  shown as negative remaining.
- **Target date equal to or before the goal's start**: pace is undefined for a
  zero-or-negative time span; such a goal is treated as due-now — reached ⇒ on
  track, otherwise off-track — never producing a divide-by-zero or nonsensical pace.
- **Contribution dated in the future**: a contribution still counts toward saved
  (the household knows its own money); pace uses the reference "today", not
  contribution dates, so a future-dated contribution cannot make a goal look ahead
  of a pace it has not yet reached in time. (Contributions are summed regardless of
  date; only the target-date pace comparison is time-sensitive.)
- **Deleting a linked account or category**: a goal whose associated account or
  category is later removed keeps working; the association simply clears (it never
  drove progress).
- **Many goals off-track at once**: the dashboard surfaces off-track goals within
  the existing insights limit and ordering; goals do not get unbounded space.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A household member MUST be able to create a goal with a **name**, a
  positive **target amount** in USD cents, an optional **kind** (savings or
  debt-payoff), and an optional **target date**.
- **FR-002**: A member MUST be able to optionally associate a goal with one linked
  bank account **or** one spending category, for context only; the association is
  optional and independently clearable.
- **FR-003**: A member MUST be able to record **contributions** toward a goal, each
  a USD-cents amount with a date, and MUST be able to remove a contribution.
- **FR-004**: The system MUST compute a goal's **saved amount** as the exact
  integer-cent sum of its contributions.
- **FR-005**: The system MUST compute **remaining** as target − saved, floored at
  zero, and **fraction complete** as saved ÷ target, capped at 100%, defined only
  for a positive target.
- **FR-006**: The system MUST treat a goal as **reached** when saved ≥ target and
  MUST never present negative remaining or a fraction above 100%.
- **FR-007**: For a goal with a target date, the system MUST determine whether it is
  **off-track** by comparing saved against the amount expected under a steady
  (linear) pace from the goal's start to its target date as of a reference "today",
  using a defined tolerance so a goal only marginally behind is not flagged.
- **FR-008**: When a dated, not-yet-reached goal is off-track, the system MUST
  produce exactly **one insight** per such goal that identifies the goal, conveys
  that it is behind pace and by roughly how much, and states a **suggested monthly
  contribution** that would still reach the target by the date.
- **FR-009**: The system MUST NOT produce an off-track insight for a goal that is on
  pace, already reached, or has no target date.
- **FR-010**: A goal past its target date and not reached MUST be treated as
  off-track (fully behind).
- **FR-011**: Goals and contributions MUST be **household-scoped**: every member of
  the household can view, create, edit, and delete them; members of other
  households MUST NOT see or affect them.
- **FR-012**: A member MUST be able to **edit** a goal's name, kind, target, date,
  and association, and **delete** a goal; deleting a goal MUST remove its
  contributions.
- **FR-013**: The progress view MUST render as **calm money-first UI** consistent
  with the rest of Ortho: money is the headline, no alarmist color, loss/behind is
  never shown in red, amounts are tabular and never abbreviated.
- **FR-014**: All goal amounts MUST be stored and computed as **integer USD cents**
  and converted to the member's display currency only at render, consistent with
  every other money value in Ortho.
- **FR-015**: Off-track insight detection MUST be **deterministic** given a fixed
  reference date (no dependence on the wall clock in its logic), so it can be pinned
  by regression fixtures.

### Key Entities

- **Goal**: a named household intention to reach a target amount of money, with a
  kind (savings or debt-payoff), an optional target date, an optional context
  association (one linked account or one category), and timestamps. Belongs to a
  household.
- **Contribution**: a dated USD-cents amount recorded against one goal; the sum of a
  goal's contributions is its progress. Belongs to a goal (and thereby a household).
- **Goal progress (derived, not stored)**: saved, remaining, fraction complete,
  reached flag, and — when dated — an off-track assessment with an expected amount
  and a suggested monthly contribution. Computed purely from a goal, its
  contributions, and a reference date.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can create a goal and see its progress view in a single flow
  without leaving the goals surface.
- **SC-002**: Saved, remaining, and fraction-complete are exactly correct to the
  cent for every combination of target and contributions — verified by deterministic
  fixtures, including over-funded and single-contribution cases.
- **SC-003**: The off-track rule flags exactly the goals that are behind steady pace
  beyond tolerance and never flags on-pace, reached, or date-less goals — verified
  by fixtures covering on-pace, behind, reached, date-less, and past-due cases.
- **SC-004**: 100% of goal money values display in the member's chosen currency and
  never appear as raw cents or abbreviated figures.
- **SC-005**: Goals created by one member are visible to every other member of the
  same household and invisible to members of any other household.
- **SC-006**: The full web test suite and typecheck pass, and the regression-vector
  drift check stays green, with the new goal math pinned by fixtures.

## Assumptions

- **Progress is contribution-driven in v1.** The description offers "accumulated
  contributions **or** an account's balance" as progress sources. Ortho's bank
  linking (spec 024) is **connect-only — it syncs no balances or transactions** — so
  a live account balance is not available to drive progress. v1 therefore computes
  progress solely from recorded contributions; the optional linked-account/category
  association is **contextual metadata only**. Balance-driven progress is deferred to
  whenever a future spec adds balance sync.
- **Savings and debt-payoff use one progress model.** Both accumulate contributions
  toward a positive target; "paid off so far" and "saved so far" are the same
  computation. Kind affects only plain-language framing.
- **Steady (linear) pace is the pace model.** "Behind the pace needed" is
  interpreted as behind a straight line from the goal's start date to its target
  date. Start date defaults to when the goal was created. A small tolerance prevents
  flagging goals only marginally behind; the exact tolerance is an implementation
  threshold set alongside the existing insight thresholds.
- **The off-track rule follows existing insight patterns.** It produces the same
  insight shape (id, title, body, severity, magnitude) the dashboard already renders,
  so it needs no new surface of its own; severity stays calm (never a
  saturated/red alarm) per the design constitution.
- **Reference date is injected.** Like every other date-sensitive engine, the
  off-track logic receives an explicit "today" so tests are deterministic and never
  assert against the real clock.
- **Currency, auth, and household model are reused unchanged.** Goals reuse the
  existing USD-cents model, email-OTP auth, and household membership/RLS posture; no
  new auth or currency work.

## Out of Scope

- Balance-driven progress from a linked bank account (needs balance sync, which
  Ortho does not have — spec 024 is connect-only).
- Automatic contribution detection from transactions in a linked category (v1
  contributions are explicit; category is contextual only).
- Recurring/scheduled auto-contributions or reminders beyond the single off-track
  insight (the "monthly auto-contribution nudge" is surfaced *inside* the off-track
  insight as a suggested amount, not as a scheduling feature).
- Goal sharing across households, goal templates, or projections beyond the single
  steady-pace off-track assessment.
