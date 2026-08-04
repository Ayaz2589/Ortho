# Feature Specification: Planning Hub (top-level destination)

**Feature Branch**: `feat/planning-page`

**Created**: 2026-08-03

**Status**: Draft

**Input**: User description: "Promote Planning to a top-level destination alongside Dashboard, Transactions, Housing, and Settings, and rebuild its landing page into a richer, month-scoped planning hub (plan-health hero, pace-aware budget summary, goal progress/projection summary, non-monthly sinking-fund awareness) that still links out to the existing Budgets and Goals detail pages."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reach Planning as a first-class destination (Priority: P1)

A member opens the app and finds **Planning** as a top-level destination in the primary
navigation — a tab in the bottom tab bar on phone, and an item in the left sidebar on desktop —
sitting alongside Dashboard, Transactions, Housing, and Settings. Planning is no longer buried
inside Settings. Selecting it opens the Planning hub. Any old link or bookmark to the former
in-Settings planning location lands the member on the new hub rather than a dead page.

**Why this priority**: Discoverability is the point of the feature. Without promoting Planning to
the top level, the richer hub is unreachable in the way the user asked for. This is the smallest
slice that delivers standalone value: even if the hub only showed the two existing links, having
Planning as a real destination is an improvement and is independently demonstrable.

**Independent Test**: Launch the app; confirm Planning appears in both the mobile tab bar and the
desktop sidebar, routes to the hub, is marked as the current destination when active, and that
navigating to the former Settings › Planning location redirects to the hub. Confirm the Planning
row no longer appears in the Settings index or Settings secondary navigation.

**Acceptance Scenarios**:

1. **Given** the app is open on a phone, **When** the member views the bottom tab bar, **Then**
   a Planning tab is present alongside Dashboard, Transactions, Housing, and Settings, and tapping
   it opens the Planning hub.
2. **Given** the app is open on desktop, **When** the member views the left sidebar, **Then** a
   Planning item is present and selecting it opens the hub and marks it as the current destination.
3. **Given** the member is on the Planning hub, **When** they look for the way back to Budgets or
   Goals, **Then** the hub provides links that open the existing Budgets and Goals pages.
4. **Given** a member follows an old link to the former Settings › Planning location, **When** the
   page loads, **Then** they are taken to the new top-level Planning hub.
5. **Given** the member opens Settings, **When** they scan the Settings list and secondary
   navigation, **Then** Planning no longer appears there.

---

### User Story 2 - See plan health at a glance for the selected month (Priority: P1)

On the Planning hub the member sees a single, prominent **"Left to plan"** figure for the selected
month: their income for the month minus everything they've committed to it (the sum of their budget
allowances plus their planned goal contributions). A positive figure reads as room still available
to allocate; a fully- or over-committed figure reads as needing attention (never styled as a loss).
Directly beneath the headline the member can see the arithmetic that produced it — income,
total budgeted, and total goal contributions — so the number is trustworthy rather than magical.
The member can change which month the hub reflects using the same month picker used elsewhere in
the app, so they can review this month or plan ahead.

**Why this priority**: Every leading budgeting app reduces "how am I doing?" to one headline number
with the supporting math shown. This is the single highest-value addition and is what makes the hub
"more detailed" rather than a link list. It depends only on data the app already has.

**Independent Test**: With a household that has income, budgets, and goals for a month, confirm the
hub shows a "Left to plan" figure equal to income minus budgeted minus planned goal contributions,
shows the three component amounts beneath it, styles a negative/over-committed result as attention
(not as red/loss), and recomputes when the selected month changes.

**Acceptance Scenarios**:

1. **Given** a month with income of X, total budget allowances of B, and planned goal contributions
   of G, **When** the member views the hub, **Then** the "Left to plan" figure equals X − B − G and
   the amounts X, B, and G are each shown as the breakdown.
2. **Given** commitments exceed income for the month, **When** the member views the hero, **Then**
   the figure is presented as needing attention using position/weight/allowed accents — never red
   and never framed as a loss.
3. **Given** the member changes the selected month, **When** the hub updates, **Then** the "Left to
   plan" figure and its breakdown reflect the newly selected month.
4. **Given** a month with no income, budgets, or goals, **When** the member views the hero, **Then**
   the figure and breakdown render sensibly (e.g. zeroes) without error.

---

### User Story 3 - Understand budget health by pace, not just totals (Priority: P2)

The hub shows a **budget summary** for the selected month: one overall bar of total spent against
total budgeted, plus the handful of categories that are closest to — or already over — their
allowance. Each listed category shows a progress bar and the amount remaining (or the amount over).
A category's health is judged by **pace**: being 60% spent one week into the month reads as
attention even though it is under its limit, while being 60% spent three weeks in reads as fine.
Where a category carries money forward from prior months (rollover), the carried-in amount is shown
so the member understands why the effective allowance differs from the base. A "View all budgets"
link opens the full Budgets page.

**Why this priority**: Pace-aware budget health is the sharpest at-a-glance signal from the research
and is a clear step up from the current link. It reuses existing rollover/limit math. It is P2
because the plan-health hero and the destination promotion deliver the core value first.

**Independent Test**: With budgets and month-to-date spending, confirm the summary shows an overall
spent-vs-budgeted bar, lists the most at-risk categories with remaining/over amounts, colors health
by pace relative to how far into the month it is (using an injected reference date), and shows a
carried-in amount for a category that has rollover.

**Acceptance Scenarios**:

1. **Given** budgets with month-to-date spending, **When** the member views the budget summary,
   **Then** an overall bar shows total spent against total budgeted for the month.
2. **Given** several categories with differing spend levels, **When** the summary lists categories,
   **Then** it surfaces the few nearest to or over their allowance, each with a progress bar and a
   remaining-or-over amount.
3. **Given** a category is 60% spent very early in the month, **When** its health is shown, **Then**
   it reads as attention (ahead of pace) even though it is under its allowance; **and** the same 60%
   late in the month reads as on-track.
4. **Given** a category carries rollover from a prior month, **When** it appears in the summary,
   **Then** the carried-in amount is shown.
5. **Given** the member selects "View all budgets", **When** they act on it, **Then** the existing
   Budgets page opens.
6. **Given** the household has no budgets, **When** the member views the summary, **Then** a short,
   non-alarmist empty state invites setting up budgets and links to the Budgets page.

---

### User Story 4 - Track goals with projection and what's needed (Priority: P2)

The hub shows a **goals summary**: for each goal, its name, a progress bar, saved-of-target amounts,
whether it is on track or behind for its target date, a projected completion outlook, and — when
behind — the suggested monthly contribution to catch up. Goals that are behind are listed first so
attention goes where it's needed. A "View all goals" link opens the full Goals page.

**Why this priority**: Goals are half of what the current page links to; surfacing progress,
on/off-track status, and the catch-up number turns a link into a decision aid. Reuses existing
goal-pacing math. P2 alongside budgets.

**Independent Test**: With goals having targets, target dates, and contributions, confirm each goal
shows progress and saved/target, an on-track/behind status and projected outlook computed against an
injected reference date, a suggested monthly contribution when behind, and that behind goals sort
first.

**Acceptance Scenarios**:

1. **Given** a goal with a target and contributions, **When** the member views the summary, **Then**
   it shows the goal's progress toward its target and the saved and target amounts.
2. **Given** a goal that is behind its required pace for its target date, **When** it is shown,
   **Then** it is marked as behind and shows a suggested monthly contribution to get back on track.
3. **Given** a goal that is on track, **When** it is shown, **Then** it is marked on track and shows
   its projected completion outlook.
4. **Given** both on-track and behind goals exist, **When** the summary lists them, **Then** behind
   goals appear before on-track ones.
5. **Given** the member selects "View all goals", **When** they act on it, **Then** the existing
   Goals page opens.
6. **Given** the household has no goals, **When** the member views the summary, **Then** a short,
   non-alarmist empty state invites creating a goal and links to the Goals page.

---

### User Story 5 - See non-monthly sinking funds are being set aside (Priority: P3)

For categories the member has designated as non-monthly ("sinking funds" — expenses that don't
recur every month, like annual insurance or holidays), the hub shows a small panel of those
categories and how much is currently set aside (carried forward) for each, so the member can see
these irregular expenses are being funded rather than forgotten. If the member has no non-monthly
categories, the panel is omitted.

**Why this priority**: This is a distinctive capability the app already models but does not surface.
It is valuable and low-cost but narrower than the hero/budgets/goals, so it is P3.

**Independent Test**: With at least one non-monthly budget category that has money carried forward,
confirm the panel lists it with the set-aside amount; with no non-monthly categories, confirm the
panel does not appear.

**Acceptance Scenarios**:

1. **Given** one or more non-monthly categories with money set aside, **When** the member views the
   hub, **Then** a sinking-funds panel lists those categories with the amount set aside for each.
2. **Given** no non-monthly categories exist, **When** the member views the hub, **Then** no
   sinking-funds panel is shown.

---

### Edge Cases

- **Empty household** (no income, budgets, or goals): the hero renders zeroes and each summary
  shows its short empty state; nothing errors.
- **Month with income but no commitments**: "Left to plan" equals income; breakdown shows zero
  budgeted and zero goal contributions.
- **Over-committed month** (budgets + goals exceed income): the hero communicates attention without
  red or loss framing.
- **Very early / very late in month**: pace-based budget health is meaningful at day 1 and near
  month-end without divide-by-zero or overflow artifacts (reference date is injected for tests).
- **Goal with no target date**: shows progress and saved/target but a neutral status rather than a
  fabricated projection or catch-up figure.
- **Selected month in the future**: the hub reflects that month's budgets/goals with no
  month-to-date spend, and pace treats a future month as not-yet-started.
- **Non-English language**: every label, status, and unit on the hub is translated in all supported
  languages; money is formatted per the member's currency and locale.
- **Loading / error**: while household data loads the hub shows the app's standard calm placeholder
  for this route; a load failure surfaces via the app's existing error affordance, not a hub-local
  alarm.

## Requirements *(mandatory)*

### Functional Requirements

**Navigation & routing**

- **FR-001**: The app MUST present Planning as a top-level destination in both the mobile tab bar
  and the desktop sidebar, alongside the existing Dashboard, Transactions, Housing, and Settings.
- **FR-002**: The Planning destination MUST be marked as the current destination when the member is
  on the Planning hub, consistent with how other destinations indicate active state.
- **FR-003**: The Planning entry MUST be removed from the Settings index and from the Settings
  secondary navigation.
- **FR-004**: The former in-Settings planning location MUST redirect to the new top-level Planning
  hub so existing links and bookmarks do not dead-end.
- **FR-005**: The Planning hub MUST provide links that open the existing Budgets and Goals pages;
  those pages' own behavior MUST remain unchanged.

**Month scope**

- **FR-006**: The Planning hub MUST be scoped to a selectable month using the same month-selection
  affordance the app already uses elsewhere, defaulting to the current month.
- **FR-007**: Changing the selected month MUST recompute every figure on the hub (hero, budget
  summary, goals summary, sinking funds) for that month.

**Plan-health hero**

- **FR-008**: The hub MUST display a single "Left to plan" figure for the selected month equal to
  the month's income minus the sum of monthly budget allowances (the base per-category monthly
  allowance — NOT the rollover-adjusted effective limit, so a prior surplus never appears to reduce
  what's left to plan) minus planned goal contributions. (Rollover-adjusted effective limits are
  used in the per-category budget summary, FR-012/FR-014, where available-to-spend is what matters.)
- **FR-009**: The hub MUST display the three components of that figure — income, total budgeted, and
  total goal contributions — as a visible breakdown beneath the headline.
- **FR-010**: An over-committed (negative) result MUST be communicated as needing attention using
  position, weight, and permitted accents only — never red and never framed as a loss.

**Budget summary**

- **FR-011**: The hub MUST show an overall total-spent-vs-total-budgeted indicator for the selected
  month.
- **FR-012**: The hub MUST surface the categories closest to or over their allowance, each with a
  progress indicator and the remaining or over amount.
- **FR-013**: Category budget health MUST be judged by pace — comparing the fraction spent to the
  fraction of the month elapsed — not by absolute spend against the allowance alone.
- **FR-014**: Where a category carries money forward from prior months, the carried-in amount MUST
  be shown.
- **FR-015**: The budget summary MUST include a "View all budgets" link to the Budgets page, and MUST
  show a short, non-alarmist empty state (with that link) when the household has no budgets.

**Goals summary**

- **FR-016**: The hub MUST show, per goal, its progress toward target and the saved and target
  amounts.
- **FR-017**: The hub MUST indicate whether each goal is on track or behind for its target date and
  show a projected completion outlook; when a goal has no target date it MUST show a neutral status
  without a fabricated projection.
- **FR-018**: For a goal that is behind, the hub MUST show a suggested monthly contribution to get
  back on track.
- **FR-019**: The goals summary MUST list behind goals before on-track goals.
- **FR-020**: The goals summary MUST include a "View all goals" link to the Goals page, and MUST
  show a short, non-alarmist empty state (with that link) when the household has no goals.

**Sinking funds**

- **FR-021**: When the household has non-monthly budget categories, the hub MUST show a panel
  listing them with the amount currently set aside (carried forward) for each; when there are none,
  the panel MUST be omitted.

**Cross-cutting**

- **FR-022**: All hub math (the hero figure and its components, pace-based budget health, goal
  status/projection/suggested contribution, and set-aside amounts) MUST be computed by pure,
  deterministic functions that accept an injected reference date and are covered by tests.
- **FR-023**: Every user-facing string on the hub MUST be available in all supported languages, and
  all monetary amounts MUST be formatted per the member's chosen currency and locale.
- **FR-024**: The hub MUST adhere to the design system (tokens only, calm-over-dense, hairlines,
  no shadow on inset cards, no red for loss/cost, accessible semantic controls with visible focus
  rings, plainspoken money formatting) and be fully responsive with content width capped and
  centered from phone to ultrawide.

### Key Entities *(include if feature involves data)*

- **Budget**: A per-category monthly allowance with a type (fixed, flex, non-monthly) and rollover
  behavior; contributes its effective (rollover-adjusted) allowance to the hero and its
  spent/remaining/carried-in to the budget summary and sinking-funds panel. (Existing; unchanged.)
- **Goal**: A named savings or debt-payoff target with an optional target date and a history of
  contributions; contributes progress, on/off-track status, projection, and suggested contribution
  to the goals summary. (Existing; unchanged.)
- **Income (transaction)**: Money coming in during the selected month; the positive term in the
  "Left to plan" figure. (Existing; unchanged.)
- **Selected month**: The time window the whole hub is scoped to; drives every computed figure.
  (Existing app concept, reused.)
- **Plan summary (derived, new)**: The computed view assembled for the selected month — the hero
  figure and components, ranked at-risk budget categories with pace health, ranked goals with
  status/projection/suggestion, and the set-aside list. Derived only; no new stored data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Planning is reachable in one tap/click from anywhere in the app via the primary
  navigation on both phone and desktop.
- **SC-002**: A member can read this month's "Left to plan" figure and the income/budgeted/goals
  amounts that make it up without leaving the hub or opening any other page.
- **SC-003**: From the hub alone, a member can identify which budget categories need attention this
  month and which goals are behind, without opening the Budgets or Goals detail pages.
- **SC-004**: 100% of the hub's user-facing strings render translated in all supported non-English
  languages, and all amounts render in the member's chosen currency.
- **SC-005**: Every navigation path that previously reached planning (including the former
  Settings › Planning location and links to Budgets/Goals) still succeeds after the change — no
  dead links.
- **SC-006**: All planning-hub math is covered by deterministic tests using injected reference
  dates, and the test suite runs green with one command; pure-logic coverage stays at or above the
  project's threshold.
- **SC-007**: The hub introduces no design-system violations (no hardcoded colors, no red for
  loss/cost, no shadow on inset cards) as verified by the existing token/design guards and review.

## Assumptions

- The app already exposes budgets with rollover math, goals with pacing math, income transactions,
  a month-selection affordance, currency/locale-aware money formatting, and an internationalization
  catalog set; this feature composes those rather than adding new stored data or schema.
- "Planned goal contributions" for a month means each goal's suggested/expected monthly
  contribution toward its target (from existing pacing logic), not a separately stored schedule.
- Adding Planning as a fifth top-level destination is a deliberate, additive expansion of the
  four-destination navigation named in the constitution; the four existing destinations are
  preserved, so the change is compatible (documented for review).
- The Budgets and Goals detail pages remain the owners of full detail and editing; the hub only
  summarizes and links to them, and does not duplicate their editing affordances.
- "Closest to or over their allowance" surfaces a small, bounded number of categories (a handful),
  not the entire budget list, to keep the hub a summary.
- Forward-looking cash-flow forecasting, upcoming-bills timelines, and any recurring/scheduled-
  transaction concept are explicitly out of scope for this feature and are a separate future bet.
