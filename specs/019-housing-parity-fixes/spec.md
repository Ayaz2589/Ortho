# Feature Specification: Housing Correctness & Web↔iOS Parity Fixes

**Feature Branch**: `019-housing-parity-fixes`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Fix correctness bugs in the Housing section that show users wrong data, on both web and iOS, keeping the two surfaces in parity; check documentation for discrepancies; then review, test, and update documentation."

## Context

A deep review of the **Housing** destination (properties: primary home / multifamily
/ rental, with mortgage, lease, and rental-payment tracking) found several defects
that surface **wrong numbers or dates** to the household, and several places where
the **web** surface has silently drifted from the **canonical iOS** surface. The core
mortgage amortization math (payment, balance, equity, maturity, years-remaining) was
verified **correct and already locked** by golden vectors — this feature does not touch
it. The defects are in the date handling, one aggregation shown on two screens, an edit
round-trip, and a schedule's month labels.

iOS is the canonical expression of the product. Where iOS is already correct (dates,
amortization month labels), the fix restores web to match iOS. Where a defect exists on
**both** surfaces (the net-rental inconsistency, unit occupancy), the fix changes both in
lockstep, and — because it is shared money logic — is pinned by a new golden vector so the
two languages cannot drift again. Per the constitution, all money and date logic ships
test-first.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Housing dates are correct regardless of the viewer's timezone (Priority: P1)

A household member opens the Housing tab. Every date the app shows or computes for a
property — the rent-due day, the "rent due in N days" countdown, the lease start and end
dates, the "lease ends in N days" and 60-day renewal-soon banner, the mortgage closing
month, and each logged rental-payment date — reflects the **actual calendar date that was
stored**, no matter what timezone the viewer is in.

**Why this priority**: This is live wrong data for essentially every user. Date-only values
are stored as plain calendar dates (`YYYY-MM-DD`); the web surface currently interprets them
at UTC midnight and re-reads them in local time, so for any viewer west of UTC (all of the
Americas) every housing date shifts back one day. A lease starting on the 1st is shown with a
rent-due day on the last day of the *previous month*, and rent reads "Due in 30 days" on the
very day it is due. iOS interprets the same values as local calendar dates and is correct.

**Independent Test**: With the app's clock and timezone pinned to a negative-UTC timezone
(e.g. America/New_York), feed a lease starting on the 1st and assert the rent-due day, the
"due in N days" caption, the lease-end countdown, the renewal-soon flag, and the displayed
lease/payment/closing dates all match the stored calendar dates and match the iOS results for
the same inputs — no off-by-one, no wrong month.

**Acceptance Scenarios**:

1. **Given** a lease with `lease_start = 2025-09-01`, **When** the Housing view renders in
   America/New_York, **Then** the rent-due day is the 1st (not the 31st of August) and the
   "Lease start" row shows "Sep 1, 2025" (not "Aug 31, 2025").
2. **Given** today is exactly a lease's rent-due date, **When** the rent hero renders, **Then**
   it reads "Due today" (not "Due in 30 days").
3. **Given** a rental payment logged on `2026-12-01`, **When** the payment history renders in a
   negative-UTC timezone, **Then** the row shows "Dec 1, 2026" (not "Nov 30, 2026").
4. **Given** a mortgage with `closing_date` on the 1st of a month, **When** the equity card
   renders, **Then** the "Built since closing · {month year}" caption names the correct month.
5. **Given** identical property inputs and a fixed reference date, **When** the same date figures
   are computed on web and iOS, **Then** they are equal.

---

### User Story 2 - Net rental income reads the same on the Dashboard and the property page (Priority: P1)

A household member with a multifamily property sees a "Net rental income" figure on the
Dashboard housing summary and a "Net balance" figure on that property's own detail page. For
the **same building at the same moment**, these two figures agree, and both reflect the rent
the household actually **collects** (occupied units), not the asking rent of empty units.

**Why this priority**: Today the Dashboard sums **all** units (including vacant) while the
property detail page sums **occupied** units only, so the same building can show two different —
and sometimes **opposite-signed** — net figures (e.g. Dashboard "+$2,443" vs. the building's own
page "−$157"). This directly undermines trust in the numbers and can make a cash-flow-negative
building look profitable. The inconsistency is present on **both** web and iOS.

**Independent Test**: Build a multifamily with one vacant unit and a mortgage; assert the
Dashboard net-rental figure equals the property-detail net-balance figure, that both exclude the
vacant unit's rent, and that web and iOS produce the same number for the same fixture.

**Acceptance Scenarios**:

1. **Given** a multifamily with units $2,000 (occupied) and $2,000 (vacant) and a $3,000/mo
   mortgage, **When** the Dashboard and the property detail render, **Then** both show a net of
   **−$1,000** (occupied rent $2,000 − mortgage $3,000), not +$1,000 on the Dashboard.
2. **Given** a paid-off multifamily (no mortgage) with occupied units, **When** the Dashboard
   renders, **Then** its net rental income still reflects the occupied unit rents (the figure is
   never gated on having a mortgage).
3. **Given** the same multifamily fixture, **When** the shared net-rental figure is computed on
   web and on iOS, **Then** the two results are identical (pinned by a shared golden vector).

---

### User Story 3 - Editing a property never silently changes its mortgage rate (Priority: P2)

A household member edits a property (e.g. corrects the address) and saves. Every stored value
that was not intentionally changed — most importantly the mortgage's interest rate — is preserved
exactly, and the derived figures (monthly payment, balance, equity, schedule) are unchanged.

**Why this priority**: The edit form currently loads the interest rate at two-decimal precision,
so a rate stored with more precision (e.g. 6.375%) is silently rewritten to 6.38% the moment the
user saves *any* edit, shifting every derived number. It is silent data corruption triggered by an
unrelated edit.

**Independent Test**: Load a property whose stored rate has more than two decimals into the edit
form and save without changing the rate field; assert the persisted rate is byte-for-byte the
original and the derived payment/balance are unchanged.

**Acceptance Scenarios**:

1. **Given** a mortgage stored at 6.375%, **When** the user opens the edit form and saves without
   touching the rate, **Then** the persisted rate is still 6.375% and the monthly payment is
   unchanged.
2. **Given** the same property, **When** the user changes the rate to a new precise value (e.g.
   6.125%), **Then** exactly that value is stored (no truncation).

---

### User Story 4 - The amortization schedule labels every month correctly (Priority: P2)

A household member views the upcoming amortization schedule for a mortgage. Each row/bar is
labeled with the correct successive calendar month, with no month skipped or duplicated —
including when they open it near the end of a month.

**Why this priority**: The web schedule advances the row date by setting the month on a fixed base
date, which overflows short months (opening it on Jan 31 yields "Mar 3" for the February row), so
month-end viewers see February and April vanish and March duplicated. The principal/interest
**values** are correct — only the month **labels** are wrong — and the existing golden vector does
not cover the month field, so the passing parity test never caught it. iOS advances by whole
calendar months (clamping the day) and is correct.

**Independent Test**: Generate the schedule with the reference date on the 31st and assert the
month labels are the next N successive months with none skipped or repeated, matching iOS.

**Acceptance Scenarios**:

1. **Given** a reference date of Jan 31, **When** the 12-month schedule is generated, **Then** the
   month labels are Jan, Feb, Mar, … Dec in order (no duplicate March, no missing February).
2. **Given** any reference date, **When** the schedule is generated, **Then** each row's
   principal + interest values are unchanged from today's (correct) behavior.

---

### User Story 5 - A unit that earns rent is never silently dropped from income (Priority: P3)

A household member adds a unit to a multifamily that is earning rent. That unit's rent is included
in the property's collected rental income and net balance; a unit is only excluded when it is
deliberately marked as unoccupied.

**Why this priority**: Occupancy is currently inferred purely from a non-empty tenant name, but the
tenant field is presented as optional — so a rent-paying unit saved without a tenant name is treated
as "Vacant" and its rent is dropped from income on both surfaces. The vacancy state should be
deliberate, not an accident of a blank field.

**Independent Test**: Add an occupied unit with rent and no other change; assert its rent is
included in collected income and net balance, and that a unit is excluded only when explicitly
marked unoccupied.

**Acceptance Scenarios**:

1. **Given** a unit with rent that the user intends to be occupied, **When** it is saved, **Then**
   its rent is included in the property's rental income and net balance.
2. **Given** a unit the user deliberately marks as unoccupied, **When** the property renders,
   **Then** the unit shows as vacant and its rent is excluded from collected income — consistently
   on the Dashboard and the property page.

---

### Edge Cases

- **Month-end lease due day**: a rent-due day of the 31st in a 30-day month must resolve to a
  sensible in-month due date, not roll forward into the next month.
- **Ended lease**: a lease whose end date has passed must not present a live "rent due in N days"
  countdown as if it were active.
- **Empty / minimal property**: a property with no units, a zero purchase price, or neither a
  mortgage nor a lease renders without error and shows zeroes where appropriate.
- **Timezone extremes**: dates render correctly both east and west of UTC; the fix must not merely
  shift the bug to positive-UTC timezones.
- **Non-USD display currency**: editing a property under a non-USD display currency must not drift
  stored cent values (a pre-existing ±1-cent round-trip concern to confirm and, if cheap, remove).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: All Housing date-only values (`lease_start`, `lease_end`, `closing_date`,
  rental-payment `date`) MUST be interpreted as **local calendar dates** everywhere they are
  computed on or displayed, so their meaning does not change with the viewer's timezone. This
  matches the documented cross-surface invariant and iOS behavior.
- **FR-002**: The rent-due day, "days until next rent" countdown and caption, "days until lease
  end", and the 60-day renewal-soon flag MUST be derived from those local calendar dates and MUST
  match the canonical iOS results for identical inputs and reference date.
- **FR-003**: A rent-due day that exceeds the current month's length MUST resolve to a valid
  in-month date (clamped to month-end) rather than overflowing into the following month.
- **FR-004**: Net rental income for a multifamily MUST be computed from **occupied** units only
  (the rent actually collected), and the Dashboard housing summary and the property-detail net
  balance MUST use the **same** computation, yielding the same figure for the same property. The
  figure MUST NOT be gated on the presence of a mortgage.
- **FR-005**: The shared net-rental / occupancy computation MUST be implemented once as pure logic
  and pinned by a **golden test vector** asserted by both the web and iOS test suites, so the two
  surfaces cannot drift.
- **FR-006**: Editing and saving a property MUST preserve the stored mortgage interest rate at full
  stored precision (no truncation to two decimals) and MUST leave all unrelated stored values and
  derived figures unchanged.
- **FR-007**: The upcoming amortization schedule MUST label its rows with successive whole calendar
  months (day clamped as needed), with no month skipped or duplicated for any reference date,
  matching iOS. The principal and interest values MUST remain unchanged.
- **FR-008**: A unit's rent MUST be counted toward the property's collected income unless the unit
  is **deliberately** marked unoccupied; a merely blank optional field MUST NOT silently exclude a
  rent-earning unit.
- **FR-009**: Fixes that restore web to iOS behavior (dates, amortization labels, rate precision)
  MUST NOT change iOS; fixes to shared inconsistencies (net rental, occupancy) MUST land on **both**
  web and iOS in lockstep.
- **FR-010**: Every changed money/date computation MUST be covered by a deterministic, timezone- and
  clock-injected regression test (web Vitest and, for shared logic, iOS XCTest) written **before**
  the fix per the test-driven constitution. The existing golden-vector suites MUST remain green.
- **FR-011**: The mortgage amortization **math** (payment, balance, equity, maturity, years
  remaining) and the database schema MUST NOT change; this feature is a correctness/consistency fix,
  not a schema or math change.
- **FR-012**: The documentation MUST be reconciled with the fixed behavior: the shared date-parse
  invariant in `docs/shared.md`, the parity matrix / known-divergence notes in `PARITY.md`, and the
  Housing sections of `docs/web.md` and `docs/ios.md`.

### Key Entities *(include if data involved)*

- **Property (existing, unchanged schema)**: a household's home/multifamily/rental with optional
  mortgage, lease, and units. Read-only to this feature except for the edit round-trip fix.
- **Unit (existing)**: a rentable unit within a multifamily, with a monthly rent and an occupancy
  state. Occupancy becomes a deliberate state rather than an inferred side effect of a blank name.
- **Net rental figure (new shared computation)**: collected monthly rent (occupied units) minus the
  property's mortgage payment; the single source of truth rendered on both the Dashboard and the
  property page, pinned by a golden vector.
- **Housing date value (existing)**: a stored `YYYY-MM-DD` calendar date whose interpretation is now
  uniformly local across surfaces.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In any timezone from UTC−12 to UTC+14, every Housing date the app shows or computes
  equals the stored calendar date — zero off-by-one across rent-due day, lease dates, renewal
  window, closing month, and payment dates (verified by timezone-pinned tests).
- **SC-002**: For any multifamily with a vacancy, the Dashboard net-rental figure and the property
  detail net-balance figure are **identical**, on both web and iOS (verified by a shared golden
  vector asserted in both suites).
- **SC-003**: Saving a no-op property edit changes **zero** stored values; a mortgage rate with
  more than two decimals survives an edit unchanged.
- **SC-004**: For every reference date including month-end (29th–31st), the amortization schedule's
  month labels are N successive months with none skipped or duplicated, and match iOS.
- **SC-005**: The full web suite (`npm test`) and the iOS XCTest parity suites are green, including
  the new regression tests and the new/extended golden vector; no existing vector or unrelated test
  changes behavior.
- **SC-006**: The documentation (`docs/shared.md`, `PARITY.md`, `docs/web.md`, `docs/ios.md`)
  accurately describes the fixed behavior, with no remaining statement that contradicts the code.

## Assumptions

- **Net-rental direction (decision, overridable)**: Both surfaces are unified on **occupied-only
  ("collected") net rental income** — the truthful cash figure — rather than unifying on the
  gross/all-units number. Rationale: asking rent for an empty unit is not money collected; this
  matches the property-detail card and the canonical iOS "vacant units contribute zero" comment. If
  the team prefers to show potential (all-units) income somewhere, that is a separate, clearly
  labeled figure, not the "Net" number.
- **Occupancy model (decision, overridable, no schema change)**: Vacancy is made a **deliberate**
  state in the unit editor rather than an accident of a blank tenant name — the simplest resolution
  that avoids a schema change (the underlying storage convention "no tenant ⇒ vacant" may be kept,
  but the form makes the choice explicit so a rent-earning unit is never dropped by accident). A
  dedicated `occupied`/`vacant` column is deferred as a larger change.
- **Local-date helper is shared, not re-invented**: web already has a `parseLocalDate` helper (in
  the mortgage module) written for exactly this timezone-stability reason; the fix routes lease,
  payment, and closing dates through it (promoting it to a shared location if needed) rather than
  adding a new parser.
- **iOS validation is CI-only**: this environment (Linux) cannot build or test iOS; iOS changes are
  validated through the macOS GitHub Actions run after push. Web is built and tested locally.
- **Scope is correctness + parity + docs**, not new Housing capability: no new user-facing feature,
  no schema/migration, no change to the vector-locked mortgage math, no redesign of the Housing UI.
- **The ±1-cent non-USD edit round-trip** is confirmed and removed only if it is a small, contained
  change; otherwise it is documented as a known limitation and deferred.

## Out of Scope

- Any change to the golden-vectored mortgage amortization math or the database schema/migrations.
- A dedicated market-value field or appreciation-aware equity (equity remains purchase-price −
  balance, as today, on both surfaces).
- Redesigning the Housing UI, adding rent collected-vs-expected reconciliation, or any new Housing
  capability beyond the correctness/parity fixes above.
- Robust merchant/tenant canonicalization or multi-tenant-per-unit modeling.

## Dependencies

- The existing `Property` / `MortgageInfo` / `LeaseInfo` / `Unit` / `RentalPayment` shapes and the
  existing golden-vector harness (`shared/test-vectors/`, `npm run gen:vectors`, the web
  `*.parity.test.ts` and iOS `*ParityTests.swift` suites).
- The `ortho-web` skill and the project constitution (tokens-only design, test-first money/date
  logic, iOS-canonical parity).
