# Feature Specification: Budget rollover & bucket types

**Feature Branch**: `feat/budget-rollover`

**Created**: 2026-07-18

**Status**: Draft

**Input**: User description: "Give budgets a type (fixed/flex/non-monthly) and a rollover rule that carries an unused remainder into the next month; show per-bucket remaining on the dashboard."

This is the **rollover slice** of backlog §4.1 "Flexible budgeting"
(`docs/future_tasks/4.1-flexible-budgeting.md`). Forecasting and richer bucket
grouping are explicitly out of scope for this slice; rollover is the
highest-value piece.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Save up unused budget with a flexible bucket (Priority: P1)

A household budgets $600/month for groceries. In a light month they spend $500;
the unused $100 should carry forward so the next month's grocery budget shows
$700 available. In a heavy month they spend more than available — that overage
should **not** haunt the following month (the next month starts fresh at its base
plus whatever surplus remained, never a debt).

**Why this priority**: This is the core of the feature — "roll unused budget
forward" is called out as the highest-value piece in the backlog. It is pure,
deterministic money math and is independently demonstrable end to end.

**Independent Test**: Set a category budget to type "Flex" with a $600 limit,
enter a $500 expense in month 1, advance to month 2, and confirm the dashboard
shows $700 available (base $600 + $100 carried). Enter $750 of spend, advance to
month 3, and confirm month 3 shows exactly $600 available (no carried debt).

**Acceptance Scenarios**:

1. **Given** a Flex budget of $600 with $500 spent last month, **When** I view
   this month's budget on the dashboard, **Then** it shows $700 available and
   $700 remaining before any spend, with a caption indicating $100 was rolled
   over.
2. **Given** a Flex budget of $600 that was overspent last month, **When** I view
   this month, **Then** it shows exactly $600 available (the overage did not
   carry as a debt).
3. **Given** a Flex budget with a rollover cap of $200, **When** accumulated
   surplus would exceed $200, **Then** the carried-in amount is limited to $200.

---

### User Story 2 - See per-bucket remaining on the dashboard (Priority: P1)

For every budgeted category, the dashboard shows how much is **remaining** this
month (effective limit minus what has been spent), not just spend-vs-limit. When
a bucket has carried-in surplus, the effective limit and remaining reflect it.

**Why this priority**: The feature explicitly requires "show per-bucket remaining
on the dashboard." Without it the rollover math is invisible to the user.

**Independent Test**: With one Fixed and one Flex budget set, open the dashboard
and confirm each bucket row shows a remaining figure and the Flex bucket's
remaining includes its carried-in surplus.

**Acceptance Scenarios**:

1. **Given** budgets are set, **When** I open the dashboard, **Then** each budget
   row shows spent, effective limit, and remaining for the selected month.
2. **Given** a bucket has been overspent, **When** I view its row, **Then**
   remaining reads as a negative figure (shown with a Unicode minus, never in
   red) and the progress bar is full.
3. **Given** no budgets are set, **When** I open the dashboard, **Then** the
   budget card is hidden (unchanged from today).

---

### User Story 3 - Choose a bucket type when setting a budget (Priority: P2)

When setting or editing a budget, the household can choose how the bucket
behaves: **Fixed** (resets each month — today's behavior), **Flex** (saves unused
budget forward, optionally capped), or **Non-monthly** (a sinking fund for
irregular/annual costs that accumulates every month and carries a shortfall too).

**Why this priority**: Types are the configuration surface for rollover. Fixed is
the safe default so existing budgets are unaffected; Flex and Non-monthly unlock
the two rollover behaviors.

**Independent Test**: Open a budget, switch its type among the three options,
confirm the Flex option reveals an optional cap field, save, reopen, and confirm
the choice persisted.

**Acceptance Scenarios**:

1. **Given** I am editing a budget, **When** I open the type selector, **Then** I
   see Fixed, Flex, and Non-monthly with a one-line description of each.
2. **Given** I choose Flex, **When** the selector updates, **Then** an optional
   "cap" field appears; leaving it blank means uncapped.
3. **Given** I choose Non-monthly, **When** I save, **Then** the bucket
   accumulates its base each month and both surplus and shortfall carry forward.
4. **Given** an existing budget created before this feature, **When** it loads,
   **Then** it behaves as Fixed with no change to its numbers.

---

### Edge Cases

- **First tracked month**: a bucket carries in $0 (or its explicit opening carry
  of $0) — nothing to roll from before it existed. Carry accrues from the month
  the budget was created; months before creation contribute nothing.
- **Zero / removed limit**: a base limit of $0 disables the bucket (no card row,
  no insight) exactly as today.
- **Overspend on Flex vs Non-monthly**: Flex forgives the overage (carry floors
  at $0); Non-monthly carries the shortfall as a negative (the fund is drawn
  down).
- **Cap only applies to Flex**: Non-monthly is uncapped by nature; Fixed has no
  carry to cap.
- **Month boundaries & timezones**: month bucketing uses the same local-calendar
  rule as existing budget/insight math — a transaction dated on the 1st belongs
  to that month, never the previous one.
- **Changing a bucket's type**: takes effect from the current month forward using
  the recomputed history; there is no stored running balance to migrate.
- **Currency changes**: the display-currency conversion applies to effective
  limit, remaining, and carried-in identically to any other money figure.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A budget MUST carry a **type** of exactly one of: `fixed`, `flex`,
  or `non_monthly`. Budgets that predate this feature MUST behave as `fixed`.
- **FR-002**: A `fixed` budget MUST reset every month: its effective limit equals
  its base monthly limit and nothing carries in or out (identical to current
  behavior).
- **FR-003**: A `flex` budget MUST carry its **unused** remainder forward: next
  month's effective limit is its base limit plus the surplus that remained. An
  overspend MUST NOT carry as a debt (the carried amount floors at zero).
- **FR-004**: A `flex` budget MAY define an optional **cap** on accumulated
  carry; when set, carried-in surplus MUST NOT exceed the cap. No cap means
  uncapped.
- **FR-005**: A `non_monthly` budget MUST accumulate its base each month and carry
  the **signed** remainder forward (surplus builds a fund; a shortfall carries as
  a negative), uncapped.
- **FR-006**: For any month, `remaining = effective limit − spent`, and
  `effective limit = base limit + carried-in`. Carried-in for the first tracked
  month is zero.
- **FR-007**: Carry MUST be **derived** from the transaction history each time it
  is computed — no stored running balance, no month-close job. Recomputation from
  the same inputs MUST always produce the same result.
- **FR-008**: All budget math MUST operate in integer USD cents with no rounding
  drift, consistent with every other money computation in the product.
- **FR-009**: The dashboard budget card MUST show, per budgeted category for the
  selected month: spent, effective limit, and remaining; when carried-in is
  non-zero it MUST indicate the rolled-over amount.
- **FR-010**: Budget-status insights MUST compare spend against the **effective**
  (rollover-aware) limit, so the dashboard card and insights never contradict
  each other. For `fixed` budgets this MUST be byte-identical to current insight
  output.
- **FR-011**: Users MUST be able to set and change a budget's type, and (for
  `flex`) its cap, from the budget editing surface, with the choice persisted per
  household + category.
- **FR-012**: The rollover computation MUST be locked by deterministic
  golden-vector fixtures (per project testing discipline for money math), written
  before the implementation.
- **FR-013**: Money figures (remaining, effective limit, carried-in) MUST follow
  product formatting: tabular figures, Unicode minus for negatives, and loss/cost
  is never shown in red.

### Key Entities *(include if feature involves data)*

- **Budget**: a per-household, per-category spending plan. Existing attributes:
  household, category, base monthly limit (cents). New attributes: **type**
  (`fixed` | `flex` | `non_monthly`) and an optional **rollover cap** (cents,
  meaningful only for `flex`). The month a budget begins accruing carry is its
  creation month.
- **Rollover ledger (derived, not stored)**: for a budget and an ordered series of
  monthly spends, the per-month record of carried-in, effective limit, spent,
  remaining, and carried-out. This is the pure-math core the vectors lock.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a Flex bucket, unused budget from one month is fully reflected
  as additional available budget the next month (100% of surplus carried, up to
  any cap), verifiable through the dashboard.
- **SC-002**: Existing budgets show identical numbers and identical insights after
  the change (zero behavioral change for the `fixed` default).
- **SC-003**: Every budgeted category on the dashboard shows a remaining figure
  for the selected month.
- **SC-004**: The rollover math is covered by deterministic fixtures that fail if
  any carry rule changes; the full test suite runs green with one command.
- **SC-005**: A user can change a budget's type and cap and see the effect on the
  next month's available budget without any manual month-close step.

## Assumptions

- **Carry is derived from history, not stored.** There is no background job or
  stored running balance; the dashboard and insights recompute carry from the
  ledger. This keeps the model driftless and offline-correct.
- **Carry anchor = budget creation month.** Months before a budget existed
  contribute no carry. (An explicit opening-carry input exists in the math core
  for testability and future backfills, defaulting to zero.)
- **Flex forgives overspend; Non-monthly carries shortfall.** These are the two
  distinct, defensible carry semantics. Flex is a savings envelope (a bad month
  resets, never punishes); Non-monthly is a sinking fund (the fund really is
  drawn down when you spend early).
- **Fixed is the default and the migration is backward-compatible.** All existing
  rows become `fixed`, preserving today's numbers and insights exactly.
- **Scope is rollover + types + per-bucket remaining only.** Forecasting and
  multi-category bucket *grouping* from §4.1 are out of scope for this slice.
- **Web is the single canonical implementation** (per the constitution); the same
  bundle ships to the Capacitor iOS shell. No second implementation to mirror.
- **The CLI is unaffected**: it neither reads nor writes budgets and stays outside
  this feature.
