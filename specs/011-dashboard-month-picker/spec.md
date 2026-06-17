# Feature Specification: Dashboard specific-month picker

**Feature Branch**: `011-dashboard-month-picker`

**Created**: 2026-06-17

**Status**: Draft

**Input**: User description: "Add a month picker to the dashboard so the user can choose a specific month to display. Both iOS and web, kept in lockstep. Update PARITY.md."

## User Scenarios & Testing *(mandatory)*

The dashboard today offers a *relative* range selector — Month / 3M / 6M / 1Y — but every option is anchored to the present, so "Month" always means the current calendar month and there is no way to look back at a specific past month. This feature adds absolute month selection, so a person can audit any month the data spans.

### User Story 1 - View a specific month on the dashboard (Priority: P1)

A person opens the dashboard and wants to see a particular month — say last March — rather than the current month or a trailing window. They use a month control to step back one month at a time, or open a list and jump straight to a month. The dashboard then shows that month's figures.

**Why this priority**: This is the entire point of the feature — the ability to choose and view a specific month. On its own it delivers the core value: looking back at a past month's spending.

**Independent Test**: With several months of data present, step/select to a past month and confirm the dashboard's headline figures change to that month; confirm stepping is blocked at the edges of the available data.

**Acceptance Scenarios**:

1. **Given** the dashboard is on its default view, **When** the person opens the month list and picks a past month, **Then** the dashboard displays that month and the control shows the chosen month's name.
2. **Given** a month is selected, **When** the person taps the "previous month" affordance, **Then** the dashboard moves to the prior month; **When** they reach the earliest month with data, **Then** the "previous" affordance is disabled.
3. **Given** the earliest available month is shown, **When** the person taps "next month" repeatedly, **Then** they can advance only up to the latest month that has data, and "next" is disabled there.

---

### User Story 2 - Every month-aware card reflects the chosen month (Priority: P2)

When a person selects a past month, the whole dashboard should agree on the period — not show a past month in some cards while others still report the current month.

**Why this priority**: Without this, the dashboard is self-contradictory (e.g. budgets and insights say "this month" while the spend summary shows a past month), which is confusing and undermines trust in the numbers. It depends on US1 but is essential to ship a coherent feature.

**Independent Test**: Select a past month and verify that the net summary, spend-by-category, per-owner breakdown, top merchants, budget progress, and insights all reflect that month; verify the daily-spend trend and housing snapshot are unchanged (period-independent by design).

**Acceptance Scenarios**:

1. **Given** a past month is selected, **When** the dashboard renders, **Then** the net summary, spend-by-category, per-owner breakdown, top-merchants, budget-progress, and insights cards all show that month's data.
2. **Given** a past month is selected, **When** the dashboard renders, **Then** the daily-spend trend (trailing 30 days) and the housing snapshot are unchanged from their period-independent behavior.

---

### User Story 3 - Coexists with the relative range and is transient (Priority: P3)

The new month selection lives alongside the existing Month/3M/6M/1Y selector rather than replacing it. Picking a month overrides the relative range; choosing a relative range returns to the anchored-to-now view. A month selection is a temporary override that does not survive relaunch.

**Why this priority**: Preserves existing, valued behavior (trailing windows) and avoids surprising the person with a stale past month on next launch. Refines US1/US2 rather than being independently valuable.

**Independent Test**: Select a month, then choose a relative range and confirm the month selection clears; relaunch the app and confirm the dashboard opens on the persisted relative range, not the previously selected month; confirm mobile and desktop web show the same selection.

**Acceptance Scenarios**:

1. **Given** a month is selected, **When** the person taps a relative range chip (Month/3M/6M/1Y), **Then** the month selection clears and the dashboard returns to the relative window.
2. **Given** a month is selected, **When** the person returns to the relative view via the provided affordance, **Then** the dashboard shows the persisted relative range.
3. **Given** a month is selected, **When** the app/page is relaunched, **Then** the dashboard opens on the persisted relative range with no month selected.
4. **Given** the web app, **When** the person resizes between the mobile and desktop layouts, **Then** the current selection is the same in both.

### Edge Cases

- **No data**: when there are no transactions (no months available), the month control offers nothing to select and does not break the dashboard; the default relative view is shown.
- **Single month of data**: both step affordances are disabled and the list contains exactly that one month.
- **Selecting the current month** via the picker is allowed and shows the same figures as the relative "Month" view.
- **Empty selected month**: a month with no spend shows zeroed figures (not an error).
- **No future months**: only months that have data are offered; there are no future-month options.
- **Month-boundary correctness**: the selected month's window must agree exactly between iOS and web, including at month edges and across time zones.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to select a specific calendar month to display on the dashboard, chosen from the set of months that have transaction data.
- **FR-002**: The month control MUST support both adjacent-month stepping (previous / next) and direct selection from a list of available months ordered newest-first.
- **FR-003**: Month stepping MUST be clamped to the available range — the "previous" affordance is disabled at the earliest available month and "next" at the latest.
- **FR-004**: Selecting a month MUST rescope all month-aware dashboard content — net summary, spend-by-category, per-owner breakdown, top merchants, budget progress, and insights — to that calendar month.
- **FR-005**: The daily-spend trend (trailing 30 days) and the housing snapshot MUST remain period-independent and unaffected by month selection.
- **FR-006**: The month picker MUST coexist with the existing relative range selector; the two are mutually exclusive — choosing a relative range clears any month selection, and choosing a month overrides the active relative range.
- **FR-007**: Users MUST have a clear, discoverable way to return from a selected month to the relative range view.
- **FR-008**: A month selection MUST be transient — not persisted — so the dashboard returns to the persisted relative range on next launch; the relative range MUST continue to persist exactly as it does today.
- **FR-009**: The default dashboard state MUST be unchanged: it opens on the persisted relative range (current month by default) with no month selected.
- **FR-010**: Behavior MUST be identical on iOS and web, and on web identical between the mobile and desktop layouts (a single source of truth for the selection).
- **FR-011**: The month window for a selected month MUST be derived from the shared, golden-vectored month-bounds definition, so iOS and web compute the same boundaries.
- **FR-012**: The cross-surface parity record (PARITY.md) MUST be updated to document dashboard month selection as an iOS↔web parity-locked capability.
- **FR-013**: The new scope-resolution behavior MUST be covered by automated tests on both surfaces (month → window, mutual exclusivity with the relative range, available-month derivation and clamping); both suites MUST remain green.

### Key Entities *(include if feature involves data)*

- **Dashboard time scope**: the dashboard's current view window. It is either the existing *relative range* (persisted) or a *selected month* (new, transient). When a month is selected it takes precedence; otherwise the relative range applies.
- **Available months**: the distinct calendar months that have transaction data, ordered newest-first — the set the month control may navigate. Analogous to the existing "available ranges" gate.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From the default view, a person can reach any month the data spans in at most two interactions (open list + pick, or a single step for an adjacent month).
- **SC-002**: With a past month selected, 100% of the month-aware cards (net, spend-by-category, per-owner, top-merchants, budget, insights) show that month; the only cards still showing other periods are the two period-independent by design (daily trend, housing).
- **SC-003**: For the same selected month, iOS and web show the same totals (identical month boundaries) for at least the net summary and category totals.
- **SC-004**: After relaunch, the dashboard returns to the persisted relative range 100% of the time, with no previously selected month restored.
- **SC-005**: Both automated test suites stay green, and the new scope-resolution logic is covered on both surfaces.
- **SC-006**: PARITY.md shows the dashboard month-selection capability as in parity (iOS ✅ / web ✅).

## Assumptions

- iOS is the canonical surface; web mirrors it.
- The existing, shared, golden-vectored month-bounds definition is reused verbatim as the single chosen-month → window source of truth, so the month math stays in parity without new shared logic.
- The existing distinct-available-months derivation (already used by the Transactions filter) is reused to populate the picker.
- No database schema change, migration, or Supabase configuration change is required.
- The existing relative-range model, its persistence, and the cards that already accept an arbitrary window are reused as-is.
- On web, the dashboard's time scope (relative range + selected month + available months) is consolidated into a single shared source so the mobile and desktop layouts cannot drift.
- Reference dates are injected (never read from the real clock in tests), per the project's test discipline.

## Out of Scope

- Replacing or reworking the existing relative-range model (Month/3M/6M/1Y).
- Redesigning the daily-spend trend (stays trailing-30) or the housing snapshot (stays point-in-time).
- The Transactions-list month filter and its UI (already exists; untouched).
- The CLI — the dashboard has no CLI surface (the new parity row's CLI cell is "—").
- Reconciling the broader time-zone convention across the *existing* dashboard range math; only the *new* selected-month path standardizes on the shared month-bounds definition.
- Inventing new window or aggregation math — all aggregations already accept an arbitrary window.
