# Feature Specification: Housing Dashboard Widgets

**Feature Branch**: `feat/036-housing-widgets`

**Created**: 2026-08-03

**Status**: Draft

**Input**: User description: "Look at the housing system and the widget system. Understand them well.
Create a couple of widgets for the housing system." Two additive, client-side dashboard widgets that
surface the existing household housing roll-up (`housingSummary()`) on the widget board built in spec
034 — no new finance math, no schema change, fully test-driven.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See monthly housing cost at a glance (Priority: P1)

A household member who owns or rents a home wants a calm, glanceable summary of what their housing
costs each month without opening the Housing detail screen. From Settings → Widgets they enable the
**Housing costs** widget. On the Dashboard it shows the total monthly housing cost across every
property (mortgage payments + lease rents), how many properties feed that number, and — for a
household with a multifamily rental — the net monthly rental cashflow.

**Why this priority**: Monthly housing cost is the single most-asked housing question and applies to
the broadest set of households (any renter or owner). It is the flagship of the two widgets.

**Independent Test**: Enable the widget with a household that has one mortgaged home and confirm the
board shows the correct monthly cost and a "1 property" count; add a multifamily property and confirm
the net-rental row appears; empty the properties and confirm a calm empty state.

**Acceptance Scenarios**:

1. **Given** a household with at least one property, **When** the Housing costs widget renders,
   **Then** it shows the total monthly cost (all mortgage payments + all lease rents) formatted with
   the money formatter and a count of the properties contributing.
2. **Given** a household with a multifamily property, **When** the widget renders, **Then** it also
   shows the net monthly rental cashflow (occupied rent − mortgage), which may be negative and is
   never shown in red (sign is conveyed by the minus glyph).
3. **Given** a household with no properties, **When** the widget renders, **Then** it shows a calm
   empty state ("No properties yet.") that fills the cell, never a hollow card.

---

### User Story 2 - Track home equity built (Priority: P2)

An owner with a mortgage wants to see how much principal they have paid down and how far along they
are toward owning their home(s) outright. They enable the **Home equity** widget, which shows total
principal paid down across all mortgages and the progress toward the original loan balance.

**Why this priority**: Equity is a motivating, positive number, but it applies only to owners with a
mortgage — a narrower audience than housing cost, hence P2.

**Independent Test**: Enable the widget for a household with a mortgage part-way through its term and
confirm it shows the principal paid down plus a progress bar and "X% paid off"; a household with no
mortgage shows a calm empty state.

**Acceptance Scenarios**:

1. **Given** a household with at least one mortgage, **When** the Home equity widget renders,
   **Then** it shows total principal paid down (formatted money) and a progress bar sized to
   `equity / original loan` with an "X% paid off" caption and the original loan total.
2. **Given** a fully paid-off mortgage, **When** the widget renders, **Then** the progress reads
   100% paid off (paid-off balances are treated as zero, per the finance engine).
3. **Given** a household with no mortgages, **When** the widget renders, **Then** it shows a calm
   empty state ("No mortgages yet.") that fills the cell.

---

### Edge Cases

- **No properties at all**: both widgets show their calm empty states; they never error and always
  fill the 300px cell.
- **Property with a lease but no mortgage** (a renter): counts toward Housing costs; contributes
  nothing to Home equity (its empty state applies if it is the only property).
- **Multifamily with vacant units**: net rental counts only occupied units' rent (the existing
  occupancy rule); vacant units contribute zero.
- **Cash-flow-negative rental**: net rental is negative; shown with the minus glyph, never red.
- **Default-off**: both widgets ship default-off (like `activity`) so the first-run board stays a
  clean set of tiles; households without housing data are never shown empty housing cards unbidden.
- **Localization**: all widget copy is translated in the five non-English catalogs; numbers use the
  household's money formatter and locale.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST add exactly two widgets to the existing registry
  (`web/lib/widgets/registry.tsx`): `housing-costs` and `home-equity`. No board, settings, or
  preference code changes are required — the registry is the single source of truth (spec 034 FR-008).
- **FR-002**: Both widgets MUST be propless bodies that read household data via `useApp()` and derive
  their figures from the existing `housingSummary()` roll-up (`web/lib/finance/housing-summary.ts`).
  No new or changed finance math; money is integer USD cents formatted via `formatMoney`.
- **FR-003**: The Housing costs widget MUST show the total monthly housing cost and the property
  count, and MUST show the net monthly rental cashflow only when a multifamily property exists.
- **FR-004**: The Home equity widget MUST show total principal paid down and a progress indicator
  toward the total original loan, with an "X% paid off" caption. Progress MUST be clamped to 0–100%.
- **FR-005**: Each widget MUST render a calm, cell-filling empty state when its relevant data is
  absent (no properties → Housing costs; no mortgages → Home equity), never a hollow card or error.
- **FR-006**: Both widgets MUST ship `defaultEnabled: false` so the first-run board is unchanged;
  they appear in Settings → Widgets automatically and render on the board only when enabled.
- **FR-007**: All widget visuals MUST use existing design tokens only. Cost/loss MUST never be red;
  positive figures may use the sage `--positive` accent; the progress bar uses `--positive`.
- **FR-008**: All new UI strings MUST be added to the five non-English i18n catalogs
  (`es, bn, ja, ko, zh`); English is the identity source key.
- **FR-009**: Both widget bodies MUST be covered by tests (Vitest + Testing Library) asserting the
  populated figures, the multifamily/mortgage-specific rows, the empty states, and that the body
  fills its cell (`h-full`). Registry integrity tests MUST continue to pass with the two new ids.

### Key Entities

- **Housing costs widget**: registry entry `housing-costs` + body `HousingCostsBody`. Derives from
  `housingSummary(properties)` → `{ cost, netRental, multi, count }`.
- **Home equity widget**: registry entry `home-equity` + body `HomeEquityBody`. Derives from
  `housingSummary(properties)` → `{ equity }` plus the sum of mortgage `original_loan_cents` read
  from `properties` (for the progress denominator).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With a household that has a mortgaged home and a multifamily rental, the Housing costs
  widget shows the correct total monthly cost, the property count, and the net rental row.
- **SC-002**: With a mortgage part-way through its term, the Home equity widget shows the correct
  principal paid down and a progress percentage between 0 and 100.
- **SC-003**: With no properties (Housing costs) / no mortgages (Home equity), each widget shows its
  calm empty state and no error.
- **SC-004**: Both widgets appear in Settings → Widgets and, when enabled, on the board, purely from
  their registry entries — no board/settings edits (verified by the existing extensibility test).
- **SC-005**: `npm test` and `npx tsc --noEmit` pass; no hardcoded colors; loss/cost never red.

## Assumptions

- The two widgets are a representative, useful pair; the specific figures shown are chosen to be
  broadly valuable (cost for everyone with a property; equity for owners) and to reuse the existing
  roll-up without new math.
- Housing figures are point-in-time (current monthly obligation / current amortization state), so the
  bodies do not consume the dashboard time scope (`useDashboardScopeContext`) — this mirrors how
  `ActivityBody` deliberately ignores the window.
- Preferences, board packing, and the Settings list are provided by the spec-034 framework and are
  out of scope here beyond adding the two registry entries.
