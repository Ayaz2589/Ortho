# Feature Specification: Reports MVP

**Feature Branch**: `feat/reports-mvp`

**Created**: 2026-07-18

**Status**: Draft

**Input**: User description: "Reports MVP — a calm 'Reports' mode inside the existing Dashboard page. Add a segmented control at the top of Dashboard (Overview | Reports); 'Overview' is today's dashboard, 'Reports' reveals a small reports surface in place. The Reports surface has a month/date-range scope and renders 1–2 calm report views wired to the already-built-but-unwired aggregate RPC wrappers in web/lib/api/aggregates.ts: (1) Savings-rate over time; (2) Category deep-dive. Keep it calm; no new DB migration — reuse the existing RPCs. A minimal slice of docs/future_tasks/5.1-advanced-reports.md."

## Overview

Ortho has fixed, calm dashboard widgets but no dedicated **reports** surface where a
household can look at how their money moves over a chosen window. The aggregate roll-ups
that would power such a surface already exist as household-scoped Postgres functions, but
no product screen calls them yet.

This feature adds a **Reports mode inside the existing Dashboard page**: a segmented control
at the top of Dashboard toggles between **Overview** (today's dashboard, unchanged) and
**Reports** (a small, calm reports surface that renders in place). Reports has its own
date-range scope and shows two report views — a **savings-rate over time** view and a
**category deep-dive** view. It is a minimal, deliberately-scoped slice of §5.1 "Advanced
reports"; the four primary destinations (Dashboard, Transactions, Housing, Settings) are
untouched.

## Clarifications

### Session 2026-07-18

- Q: How should the savings-rate-over-time view present its per-month data? → A: A recharts
  time-series (bar/line) of the savings rate across the in-scope months, dynamic-imported so
  the charting dependency stays out of the Dashboard initial-load bundle. Per-month income,
  expense, and rate remain readable as money figures alongside/within the chart.
- Q: Within the selected range, how should a month with no activity appear in the
  savings-rate view? → A: Show every month in the window; a month with no income/expense
  appears as a neutral zero entry ($0 / $0, rate "—"), so the timeline has no silent gaps.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Switch into Reports and see the savings-rate view (Priority: P1)

A household member on the Dashboard wants to understand whether they saved or overspent
over recent months. They flip the Dashboard's top segmented control from **Overview** to
**Reports**. The reports surface appears in place, scoped by a date-range picker (This
month / 3M / 6M / 1Y). The **savings-rate over time** view shows, per month in the scope,
how much came in, how much went out, and the resulting savings rate, so they can see at a
glance which months were ahead and which were behind — without any alarm color.

**Why this priority**: This is the core value of the feature — the first genuinely new
"how are we doing over time" answer Ortho gives — and it independently justifies wiring the
aggregate roll-ups into product code. Shipping only this story is already a viable MVP.

**Independent Test**: With a seeded household, open Dashboard, switch to Reports, and
confirm the savings-rate view renders one entry per in-scope month with income, expense,
and savings rate; change the range and confirm the set of months updates.

**Acceptance Scenarios**:

1. **Given** a household with several months of income and expense, **When** the member
   selects **Reports**, **Then** the reports surface replaces the overview content in place
   and the savings-rate view lists each in-scope month with its income, its expense, and its
   savings rate.
2. **Given** the Reports surface is showing, **When** the member changes the range from
   "This month" to "Last 6 months", **Then** the savings-rate view re-scopes to cover those
   months.
3. **Given** a month where expense exceeded income (a negative savings rate), **When** it is
   shown, **Then** the shortfall is conveyed by position/label/sign — **never** by a red or
   otherwise alarmist color.
4. **Given** the member switches back to **Overview**, **Then** the original dashboard is
   shown exactly as before, with no residual reports chrome.

---

### User Story 2 - Category deep-dive for the chosen window (Priority: P2)

The same member wants to see where the money went. Within Reports, the **category
deep-dive** view shows total spend per category across the selected window, as a calm donut
paired with a ranked, readable legend (category, amount, share of total), highest first, so
the biggest spend areas are obvious without a wall of numbers.

**Why this priority**: High value and it reuses Ortho's existing calm category
vocabulary (donut + ranked legend), but the savings-rate view alone is a shippable MVP, so
this is P2.

**Independent Test**: With a seeded household, open Reports, and confirm the category view
shows one legend entry per category that had spend in the window, ordered by amount
descending, each with amount and share; change the range and confirm totals update.

**Acceptance Scenarios**:

1. **Given** a household with spend across several categories in the window, **When** the
   category deep-dive is shown, **Then** each category with spend appears once with its total
   and its share of the window's total spend, ordered highest-amount first.
2. **Given** the selected range, **When** the member changes it, **Then** the category
   totals and shares recompute for the new window.
3. **Given** a window with no expense at all, **When** the category view is shown, **Then**
   a plainspoken empty line is shown instead of an empty chart.

---

### Edge Cases

- **No data at all** (new household, or a window with zero transactions): each view shows a
  short plainspoken empty line, not a broken/empty chart.
- **Loading**: while the roll-ups are being fetched, a quiet plainspoken loading line is
  shown (no skeleton shimmer).
- **Fetch failure** (offline, RPC error): a plainspoken, non-alarmist error line with a
  recovery affordance (retry) — never a red panel, never a thrown/uncaught error.
- **Savings rate when income is zero**: the ratio is undefined; it is shown as a dash/"—"
  rather than a division-by-zero, infinity, or misleading 0%.
- **A month within the range with no activity**: it still appears in the savings-rate view
  as a neutral zero entry ($0 / $0, rate "—") so the timeline has no silent gaps (resolved in
  Clarifications).
- **Range wider than the data**: only months/categories that exist contribute; the view does
  not fabricate months before the first transaction beyond the scope's own bounds.
- **Switching Overview ↔ Reports repeatedly**: state (selected range, selected mode) is
  preserved sensibly within the session and does not reset the whole dashboard.
- **Reports mode must never gate or break the existing Overview** — an error in a report view
  is contained to that view.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Dashboard page MUST present a segmented control with two modes,
  **Overview** and **Reports**, with Overview selected by default. Selecting a mode swaps the
  content in place; no route navigation and no new primary navigation destination are added.
- **FR-002**: The four primary destinations (Dashboard, Transactions, Housing, Settings)
  MUST remain unchanged; Reports is reachable only as a mode within Dashboard.
- **FR-003**: The Reports surface MUST offer a date-range scope using the existing range
  vocabulary (This month / Last 3 months / Last 6 months / Last 12 months), and MUST only
  offer ranges the household's data can actually span.
- **FR-004**: The Reports surface MUST render a **savings-rate over time** view that, for
  each month in the selected window, shows income, expense, and the savings rate computed as
  (income − expense) / income. The rate across months MUST be shown as a time-series chart
  (bar or line) whose charting dependency is not part of the Dashboard's initial-load bundle
  (loads only when Reports is viewed). Every month in the window MUST be represented; a month
  with no activity appears as a neutral zero entry ($0 income / $0 expense, rate "—"), so the
  timeline has no silent gaps.
- **FR-005**: The Reports surface MUST render a **category deep-dive** view that shows total
  spend per category for the selected window, ordered by amount descending, each entry
  showing the category, its amount, and its share of the window's total spend.
- **FR-006**: All report figures MUST derive from the existing household-scoped aggregate
  roll-ups (no new database migration); values are household-wide (shared ledger), in USD
  cents internally, and converted to the member's display currency only at render.
- **FR-007**: A negative savings rate / shortfall MUST be conveyed by position, label, and
  sign only — never by red or any saturated/alarmist status color.
- **FR-008**: When income for a period is zero, the savings rate MUST be shown as an
  em-dash ("—") rather than a computed 0%, Infinity, or NaN.
- **FR-009**: Each report view MUST show a plainspoken **empty** state when the window has no
  relevant data, a quiet **loading** state while fetching (no skeleton shimmer), and a
  plainspoken **error** state with a retry affordance on fetch failure — none alarmist, none
  red.
- **FR-010**: All money MUST render with tabular figures, `$` formatting, Unicode minus (−)
  for shown negatives, and no abbreviation; percentages render with tabular figures.
- **FR-011**: The Reports surface MUST be usable and readable at all three breakpoints
  (compact < 640px, medium 640–1023px, expanded ≥ 1024px), with content width capped/centered
  per the responsive contract (never a stretched, full-ultrawide row).
- **FR-012**: Any chart MUST use tokens only (no hardcoded colors, no gradients/patterns, no
  chart-junk — no unnecessary gridlines/axes/legends-inside-the-plot) and MUST NOT add its
  charting dependency to the Dashboard's initial-load bundle (charts load only when Reports is
  viewed).
- **FR-013**: Switching between Overview and Reports MUST preserve the existing dashboard's
  own scope/state and MUST NOT re-bootstrap or reset the page; an error contained in a report
  view MUST NOT break Overview.
- **FR-014**: All new user-facing strings MUST be translatable through the existing i18n
  catalogs (all five languages), consistent with the rest of the app.

### Key Entities *(include if feature involves data)*

- **Month summary**: for a month window — total income, total expense, and net (income −
  expense), all household-wide, in USD cents. The savings-rate view derives its per-month
  rows and the rate from these.
- **Category total**: for the selected window — one entry per transaction category that had
  expense, with the summed amount (USD cents). The deep-dive derives its ranked legend and
  shares from these.
- **Report scope**: the selected date range (one of the four range options) resolved to a
  half-open [start, end) window of whole calendar months; the axis along which both views
  aggregate.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From the Dashboard, a member can reach the savings-rate view in a single
  action (one control) without leaving the page or navigating to a new destination.
- **SC-002**: For any household, the savings-rate view shows the correct income, expense, and
  savings rate for every month in the selected window, matching the household's shared ledger
  for that window.
- **SC-003**: The category deep-dive shows every category that had spend in the window
  exactly once, ordered by amount descending, with shares that sum to 100% (± rounding).
- **SC-004**: Changing the range updates both views to the new window with no full-page
  reload and no reset of the member's other dashboard state.
- **SC-005**: No report state (data, empty, loading, error) uses red or a saturated status
  color; shortfalls read as money via sign/position, satisfying the calm-design bar on
  review.
- **SC-006**: Viewing Overview downloads no additional charting code beyond today's
  Dashboard; the reports charting code loads only when Reports is opened.
- **SC-007**: The reports surface is legible and correctly laid out at 375px, 800px, and
  1440px widths (no clipped rows, no ultrawide-stretched rows).
- **SC-008**: The full web test suite and typecheck pass, with the new behavior covered
  test-first.

## Assumptions

- **Reports lives inside Dashboard as a mode**, not as a new route or a fifth primary
  destination — chosen to honor the constitution's "four destinations preserved across every
  canvas" rule (decided with the requester).
- **The existing aggregate roll-ups are reused as-is**; no new database migration is added.
  The savings-rate view is powered by the month-summary roll-up (income/expense/net) and the
  category deep-dive by the category-totals roll-up. (The daily-expense and owner-spend
  roll-ups may power secondary detail but are not required for the MVP; the owner-spend
  roll-up is intentionally avoided in this slice because of a known column-name mismatch in
  its wrapper — see plan.)
- **Reports are household-wide** (the shared ledger), consistent with how the aggregate
  roll-ups are scoped; personal transactions are out of scope, as they are for these
  roll-ups.
- **Date ranges reuse the existing dashboard range model** (This month / 3M / 6M / 1Y) rather
  than introducing an arbitrary custom date picker, to keep the MVP calm and consistent.
- **Two report views is the scope ceiling for this slice**; the Sankey cash-flow diagram,
  merchant deep-dives, and fully custom chart/dimension configuration from §5.1 are
  explicitly out of scope for this MVP.
- **Currency conversion and formatting reuse the app's existing money renderer** (USD cents →
  display currency at render).
- **The reports data is fetched on demand when Reports is viewed** (and re-fetched when the
  range changes), accepting a brief loading state, rather than being preloaded on every
  dashboard bootstrap.
