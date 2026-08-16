# Feature Specification: Financial Health Scope Correction

**Feature Branch**: `052-financial-health-scope`

**Created**: 2026-08-16

**Status**: Draft

**Input**: User description: "Fix the financial-health scope. It compares one person's private income against the entire household's spending. Two earners in a comfortable household are both told they're in deficit. Wrong on screen today; no new tables to fix it."

## Context

The Financial Health score (spec 041) blends two data sources that are scoped differently:

- **The profile** — monthly income, housing cost and share, fixed costs — is **user-private**
  (`user_financial_profile`, RLS `user_id = auth.uid()`). Each adult answers for themselves.
- **The transactions, budgets and goals** it is scored against are **household-wide**.

`FinancialHealthBody.tsx` passes the whole household ledger straight into `scoreFinancialHealth`
alongside the private profile. The result is a ratio with mismatched numerator and denominator:

```
cash_flow = (my income − THE HOUSEHOLD'S spend) / my income
```

Two adults each earning $4,000 in a household spending $6,000 together are comfortable. The app tells
**both** of them they are $2,000 in deficit. And whoever logs more of the spending sees a worse score
than their partner from identical household facts — the divergence is an artifact of who did the data
entry, not of anyone's finances.

`savings_momentum` inherits the same denominator, so the error propagates into two of the five
profile-driven dimensions and therefore into the composite score and the recommended next step.

This is a live correctness defect. It needs no new tables — spec 051's scope primitive already
produces exactly the figure required.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - My health score reflects my money (Priority: P1) 🎯 MVP

Someone who filled in their own income, their own share of rent and their own fixed costs sees a
score computed against **their own share of the household's spending** — the same basis their profile
answers were given on.

**Why this priority**: The number on screen is wrong today, and it is wrong in the discouraging
direction for exactly the multi-earner households Ortho is built for. A calm score that says
"Getting started" to a household doing fine is worse than no score.

**Independent Test**: In a two-person household with a profile for one person and shared expenses,
confirm the cash-flow dimension uses that person's share of spending rather than the household total.

**Acceptance Scenarios**:

1. **Given** two people each owning half of every expense, and a profile stating one person's income,
   **When** the score computes, **Then** cash flow compares that income against **half** the
   household's spend.
2. **Given** a one-person household, **When** the score computes, **Then** the result is identical to
   the previous release — the person's share is the whole ledger.
3. **Given** a profile owner who is not an owner of a particular expense, **When** the score computes,
   **Then** that expense does not count against them at all.
4. **Given** a household where the profile owner has no linked person, **When** the score computes,
   **Then** the engine falls back to household scope rather than scoring against zero spend.
5. **Given** an uneven split, **When** the score computes, **Then** the profile owner's **stored**
   share is used, not a recomputed even share.

---

### User Story 2 - Plan engagement stays household-wide (Priority: P2)

Budgets and goals belong to the household, not to one person. The dimensions scored from them —
plan engagement, and the goal-funded component of safety net — must keep reading household data even
while the spending-based dimensions are scoped.

**Why this priority**: Scoping everything would introduce a second, opposite error: a household with
budgets would look unplanned to a member who did not create them.

**Independent Test**: With budgets created by one person, confirm the other person's plan-engagement
score is unchanged and does not read as "no budgets".

**Acceptance Scenarios**:

1. **Given** budgets created by another member, **When** the score computes for this user, **Then**
   plan engagement reflects those budgets.
2. **Given** a household goal, **When** safety net computes its funded-goal bonus, **Then** the
   household goal counts.
3. **Given** routine awareness, **When** the score computes, **Then** it continues to read household
   routines and its windowed-spend denominator stays household-wide.

---

### Edge Cases

- **No profile.** Unchanged — the widget shows the "set up your financial profile" prompt and the
  engine's neutral defaults apply.
- **The profile owner has no `household_people` row.** Falls back to household scope. Scoring against
  an empty transaction set would report a perfect cash flow, which is worse than the current error.
- **The profile owner owns nothing this month.** Scoped spend is the committed fixed costs floor that
  the engine already applies (`max(monthSpend, committedCents)`), so the score cannot read an
  artificial 100.
- **Transfers.** Never counted as spend or income, scoped or not — unchanged.
- **A single-person household.** Scoped and household figures are identical by construction, so the
  score must not move at all.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST score the spending-driven health dimensions against the **profile owner's**
  share of household transactions rather than the household total.
- **FR-002**: System MUST resolve the profile owner to their household person via the existing
  account-to-person link.
- **FR-003**: System MUST fall back to household scope when the profile owner cannot be resolved to a
  person.
- **FR-004**: System MUST use a person's **stored** share cents, never a recomputed split.
- **FR-005**: System MUST keep plan engagement reading household budgets and goals.
- **FR-006**: System MUST keep the routine-awareness dimension household-scoped, including its
  windowed-spend denominator.
- **FR-007**: System MUST produce results identical to the previous release for one-person
  households.
- **FR-008**: The engine MUST remain pure, deterministic and `now`-injected; the scope arrives as an
  input, and the engine performs no lookup of its own.

### Key Entities

- **Profile owner**: the signed-in user whose private financial profile is being scored, resolved to
  their household person for attribution.
- **Scoped ledger**: the profile owner's share of household transactions, produced by the scope
  primitive from spec 051.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a two-person household with evenly split expenses, the cash-flow dimension's
  measured spend is exactly half the household total.
- **SC-002**: A one-person household's composite score, band, dimension scores and top action are
  unchanged from the previous release.
- **SC-003**: Two members of the same household with identical profiles receive identical scores,
  regardless of which of them entered the transactions.
- **SC-004**: Plan engagement is unchanged for a member who created none of the household's budgets.
- **SC-005**: No configuration, migration or new table is required.

## Assumptions

- **Housing share is already the user's own.** The profile captures `housing_share_fraction`, so
  committed costs are personal by construction and need no scoping.
- **Fixed costs are already user-private.** Same reasoning — no change.
- **This depends on spec 051's scope primitive.** It is deliberately not duplicated here; if 051 were
  dropped, this feature would need to carry a minimal version of the same projection.
- **Snapshots are not rewritten.** Historical `financial_health_snapshots` rows keep whatever score
  they recorded. Backfilling them would fabricate history; the progress line simply improves from the
  next snapshot onward.
- No database migration, no new dependency.
