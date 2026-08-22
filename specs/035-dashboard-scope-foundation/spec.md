# Feature Specification: Dashboard Scope Foundation (Section 0)

**Feature Branch**: `feat/035-dashboard-scope-foundation` (folds into base `feat/dashboard-widget-data`)

**Created**: 2026-08-03

**Status**: Implemented

**Input**: Section 0 of `docs/plan/dashboard-widget-data.md`. Spec 034 shipped the widget board with
placeholder bodies. This section lays the foundation for wiring real data: a single shared time scope
for the whole overview, the revived month/range controls, and a per-widget body file split so the six
data sections (036–041) can proceed in parallel without colliding.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One time period for the whole board (Priority: P1)

A household member opens the Dashboard overview and picks a month (or a relative range). Every widget
on the board reflects that same period — there is a single scope control at the top, not one per
widget, and the widgets never disagree about which window they are showing.

**Why this priority**: Data wiring (sections 036–041) is meaningless if each widget can drift to a
different month. A single shared scope is the precondition for the whole feature.

**Independent Test**: Render the overview; confirm one month picker and one range control appear;
change the month and confirm the shared scope value seen by multiple consumers updates together.

**Acceptance Scenarios**:

1. **Given** the overview, **When** it renders, **Then** exactly one time-scope bar appears (a
   relative-range segmented control + a specific-month picker + the active period caption).
2. **Given** two consumers of the scope, **When** one changes the selected month, **Then** both
   observe the same new month (the scope is a single shared instance, not one per consumer).
3. **Given** a widget body placed outside the scope provider, **When** it reads the scope, **Then** it
   fails loudly (throws) rather than silently getting its own private scope.

---

### User Story 2 - Reports mode is untouched (Priority: P1)

Switching from Overview to Reports shows the analytical Reports surface with no scope bar; switching
back restores the overview and its scope bar. The scope work is confined to the overview.

**Why this priority**: Reports is a separate, preserved subsystem (spec 027). Leaking the scope bar
into it would be a regression.

**Independent Test**: Render the page, confirm the scope bar in overview, switch to Reports, confirm
the scope bar is gone and the Reports surface renders.

**Acceptance Scenarios**:

1. **Given** overview mode, **When** the member switches to Reports, **Then** the scope bar (month
   picker, range control, period caption) is no longer rendered.
2. **Given** Reports mode, **When** the member switches back to Overview, **Then** the scope bar
   returns.

---

### User Story 3 - Six body files ready for parallel work (Priority: P2)

A developer picking up any of sections 036–041 edits exactly one widget body file plus their own test
and the shared catalogs — never the registry, never another section's file.

**Why this priority**: Enables the six data sections to run in parallel sandboxes without merge
conflicts. P2 because it serves maintainers, but it is the reason to do the split now.

**Independent Test**: Confirm each of the six widgets renders from its own `bodies/<Name>Body.tsx`
file and the registry still yields exactly six widgets.

**Acceptance Scenarios**:

1. **Given** the split, **When** the board renders, **Then** every widget renders from its own body
   file and the board looks identical to before (still calm placeholders until data lands).
2. **Given** the registry, **When** inspected, **Then** it declares six widgets, each `Body` pointing
   at a `bodies/<Name>Body.tsx` component; the registry is not edited again by later sections.

---

### Edge Cases

- **No transactions**: `availableMonths` is empty → the month picker hides; the range control still
  shows `thisMonth`; the caption reads the range label. No crash, no empty control.
- **Selected month falls out of the data**: a previously selected month no longer present in the data
  falls back to the relative range (handled by the existing hook).
- **Non-English locale**: the revived controls and the caption render catalog values — all their keys
  already exist in the five catalogs (this section adds none).
- **Reduced motion**: no new motion is introduced; the controls reuse existing calm styles.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The overview MUST supply a SINGLE shared time scope to the whole board via a dedicated
  `DashboardScopeProvider` + `useDashboardScopeContext()`, calling `useDashboardScope()` exactly once.
- **FR-002**: `useDashboardScopeContext()` MUST throw when used outside a provider.
- **FR-003**: The overview MUST render a scope bar: the relative-range segmented control
  (`rangeOptions`/`range`/`setRange`) AND the specific-month picker
  (`availableMonths`/`selectedMonth`/`setMonth`/`clearMonth`), plus the active `periodLabel` caption.
  (Decision O-1: include both, not month-only.)
- **FR-004**: Reports mode MUST NOT render the scope bar or the provider; the overview scope work is
  confined to the overview branch.
- **FR-005**: The six placeholder bodies MUST be split into one file each under
  `web/components/widgets/bodies/<Name>Body.tsx`; the registry MUST repoint its `Body` imports to them
  once and MUST NOT be edited by later sections.
- **FR-006**: The `WidgetDefinition.Body` contract MUST stay propless (`ComponentType`, no props);
  bodies read data via hooks, not props.
- **FR-007**: The board MUST still render identically (calm placeholders) after the split — no visible
  change until data sections land.
- **FR-008**: This section MUST add no new i18n keys (the revived controls' keys already exist in all
  five catalogs); typecheck and the full suite MUST stay green.

### Key Entities

- **Dashboard scope**: the active time window for the overview — a relative range or a specific month
  (mutually exclusive), with derived `interval`, `referenceDate`, `periodLabel`, `isSpecificMonth`.
  Held once by the provider; read by every widget through the context hook.
- **Widget body file**: one file per widget under `bodies/`, initially the calm placeholder, later the
  section's real content. The unit of parallel work for sections 036–041.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Two consumers under one provider always read the same `selectedMonth`; a change through
  one is observed by both (verified by test).
- **SC-002**: `useDashboardScopeContext()` outside a provider throws (verified by test).
- **SC-003**: The overview renders the month picker AND the range control AND the period caption;
  Reports mode renders none of them (verified by test).
- **SC-004**: The registry yields six widgets, each `Body` sourced from its own `bodies/` file; the
  existing widget suites stay green.
- **SC-005**: `npx tsc --noEmit` is clean and `npm test` is fully green; no new i18n keys were added.

## Assumptions

- The scope lives in a focused context, NOT the global store (decision D1): the store holds only
  persisted household data and explicit preferences; a transient per-view month selection is off
  pattern there.
- The revived `MonthPicker` and `RangePicker` components and their i18n keys already exist (orphaned
  since spec 034); this section only wires them back in.
- Real widget data is out of scope here; bodies remain calm placeholders until sections 036–041.
