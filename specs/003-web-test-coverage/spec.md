# Feature Specification: In-Depth Automated Testing for the Web App

**Feature Branch**: `003-web-test-coverage`

**Created**: 2026-06-12

**Status**: Draft

**Input**: User description: "In-depth automated testing for the Ortho web app, establishing a test-driven foundation. Take the web app from near-zero tests to broad, meaningful automated coverage of behavior and business logic, runnable with one command, so future work is TDD by default."

## User Scenarios & Testing *(mandatory)*

The "users" of this feature are the people who build and maintain Ortho. The value
delivered is **confidence to change the app without breaking money math or core
behavior** — the property a budgeting app needs most.

### User Story 1 - Trustworthy money & date logic (Priority: P1)

A contributor changes a financial or formatting helper (currency conversion,
cents rounding, mortgage/insight math, date grouping, money formatting). They run
the test command and immediately learn whether any documented behavior changed.

**Why this priority**: This is the heart of a budgeting app. A silent rounding or
grouping regression directly corrupts the numbers a household sees. These modules
are pure functions, so they are the highest value-per-effort to lock down and the
foundation everything else builds on.

**Independent Test**: Run the test command against the `lib/` logic modules with
no UI and no network; every documented input→output pair is asserted, and breaking
any helper turns a test red.

**Acceptance Scenarios**:

1. **Given** the currency/money helpers, **When** a USD-cents conversion or rounding
   rule is altered, **Then** at least one test fails identifying the changed behavior.
2. **Given** the date/format helpers, **When** day/month grouping, relative labels,
   or money formatting change, **Then** a test fails pinpointing the difference.
3. **Given** the existing mortgage and insight golden-vector suites, **When** the
   new test setup runs, **Then** those suites still pass unchanged.

---

### User Story 2 - Safe shared-state and split math (Priority: P2)

A contributor edits how transactions are added, edited, deleted, or split between
household members (shared vs personal scope, even vs explicit splits, owner display,
money formatting from state). The tests confirm the state transitions and split math
stay correct without touching a real database.

**Why this priority**: The store is where user actions become data. Split math and
scope rules determine who owes what — wrong here means wrong balances. It depends on
the P1 helpers being trustworthy first.

**Independent Test**: Drive the state logic with a mocked data layer (no network);
assert that adding/updating/deleting transactions and computing splits/owner labels
produce the expected results across shared and personal scopes.

**Acceptance Scenarios**:

1. **Given** a shared transaction with multiple owners and no explicit splits,
   **When** splits are computed, **Then** the amount is divided evenly and sums back
   to the whole (remainder handled deterministically).
2. **Given** a transaction is added, then updated, then deleted, **When** each action
   runs, **Then** the in-memory collection reflects exactly that change and nothing else.
3. **Given** a personal-scope transaction, **When** owners/splits are derived, **Then**
   it is attributed only to the current user.
4. **Given** the data layer, **When** any tested state action runs, **Then** no real
   network/database call is made.

---

### User Story 3 - Interaction-complete UI behavior (Priority: P3)

A contributor changes a key interactive component (the date picker, the transactions
month accordion, primary navigation, the transaction form). Tests assert the component
still behaves correctly — selecting a date, expanding the right month, marking the
active route, gating the save action — using accessible roles and real user events,
not pixel snapshots.

**Why this priority**: These components carry real logic beyond styling (date parsing,
default-open rules, route matching, validation gating). They are higher effort to test
(need a DOM) and sit on top of the logic layers, so they come after P1/P2 — but they
prevent the most visible day-to-day regressions.

**Independent Test**: Render each component in a simulated DOM, interact via accessible
queries and simulated user events, and assert observable behavior and semantics; no
real backend.

**Acceptance Scenarios**:

1. **Given** the date picker with a selected ISO date, **When** it renders and a day is
   chosen, **Then** the emitted value is the correct local date with no timezone shift,
   and the calendar shows the correct month grid, navigation, and "Today" shortcut.
2. **Given** the date picker is open, **When** the user presses Escape or clicks outside,
   **Then** the calendar dismisses.
3. **Given** the transactions list spanning several months, **When** it first renders,
   **Then** only the current month is expanded — or, if the current month has no
   transactions, the most recent month with transactions — and an active search expands
   all months.
4. **Given** the primary navigation, **When** a route is active, **Then** exactly that
   destination is marked current and every item is a real link/semantic control.
5. **Given** the transaction form, **When** required fields are incomplete, **Then** the
   save action is disabled; **When** they are valid, **Then** it is enabled.

---

### Edge Cases

- **Timezone**: date parsing/formatting must not shift a day across timezones (parse
  `YYYY-MM-DD` as local, not UTC). Tests inject a fixed reference date — never assert
  against the real "now".
- **Rounding/remainders**: even splits and currency rounding must be deterministic when
  amounts don't divide evenly; the parts must reconcile to the total.
- **Empty/degenerate inputs**: empty transaction lists, zero-owner transactions, months
  with no data, and zero/invalid currency inputs must not throw.
- **Currencies with no minor unit** (e.g., zero-fraction-digit currencies) must format
  and convert correctly.
- **Non-determinism**: any logic that reads the current time must be testable by passing
  a reference date; tests must be repeatable and order-independent.
- **No-network guarantee**: a test that would hit the real data layer must fail fast via
  the mock rather than making a request.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The project MUST provide a single command that runs the entire automated
  test suite to completion and reports pass/fail without manual setup.
- **FR-002**: The suite MUST cover every currently-untested pure-logic module in `lib/`
  (currency, money, date/format, categories, aggregates, utilities) with assertions on
  documented behavior, including boundary and degenerate inputs.
- **FR-003**: The existing mortgage and insight golden-vector parity suites MUST remain
  part of the suite and continue to pass.
- **FR-004**: The suite MUST cover the shared-state/store logic — add/update/delete
  transactions, shared vs personal scope, and even/explicit split math and owner display
  — with the external data layer mocked so no network/database access occurs.
- **FR-005**: The suite MUST cover the behavior of the highest-value interactive
  components (date picker, transactions month accordion, primary navigation, transaction
  form validation) by interacting through accessible roles/labels and simulated user
  events, asserting behavior and semantics rather than visual appearance.
- **FR-006**: Tests MUST be deterministic and isolated: time-dependent logic is exercised
  with an injected reference date, and tests do not depend on execution order, wall-clock
  time, or network availability.
- **FR-007**: The suite MUST produce a coverage report and enforce a defined minimum
  coverage threshold for the `lib/` business-logic modules, failing the run if coverage
  drops below the threshold.
- **FR-008**: The work MUST be validated without running a production build or a dev
  server (typecheck + the test command only), so a shared dev server is never disrupted.
- **FR-009**: The project's governing principles MUST record that new behavior is
  developed test-first (TDD) going forward, so this foundation is maintained, not a
  one-off.
- **FR-010**: Test code MUST be organized and discoverable (clear location/naming), and
  golden test data MUST remain reusable across surfaces where parity matters.

### Key Entities *(include if feature involves data)*

- **Golden test vector**: a stored, version-controlled input→expected-output record used
  to lock deterministic logic (already used for mortgage and insights; extended where it
  fits, e.g. money/date/aggregate behavior).
- **Mocked data layer**: a stand-in for the backend client that returns controlled data
  and records calls, guaranteeing tests neither read nor write real data.
- **Reference date**: an explicit "now" injected into time-dependent logic so relative
  outputs (today/yesterday, current-month defaults, amortization-to-date) are reproducible.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A contributor can run the full suite with one command, and it completes in
  under ~30 seconds locally with no manual setup or network access.
- **SC-002**: Every `lib/` business-logic module has tests; line/branch coverage for
  `lib/` business logic meets or exceeds the agreed threshold (target ≥ 90% for the pure
  finance/format/category/aggregate modules).
- **SC-003**: Introducing a deliberate regression in any covered money-math, date, split,
  or component behavior causes at least one test to fail (the suite is sensitive, not
  vacuous).
- **SC-004**: 100% of tests pass deterministically across repeated runs and independent of
  order, machine timezone, or the current date.
- **SC-005**: No test performs real network or database I/O.
- **SC-006**: The four covered interactive components each have at least one behavioral
  test exercising their core interaction through accessible queries.
- **SC-007**: The existing mortgage and insight parity suites remain green after the new
  infrastructure is in place.

## Assumptions

- The web app is the surface under test; the iOS app and any end-to-end/browser or visual
  regression testing are explicitly out of scope.
- Behavior is asserted at the level of public/observable contracts (function outputs,
  emitted values, accessible DOM, state results), not private implementation details, so
  tests survive refactors.
- A simulated DOM environment is acceptable for component behavior tests; full real-browser
  rendering fidelity is not required.
- The current golden-vector approach is the preferred pattern for deterministic logic and
  will be extended rather than replaced.
- "Sensible coverage threshold" is interpreted as high coverage for pure `lib/` logic and
  best-effort behavioral coverage for components (components are not held to the same line
  threshold because not all of their code is behaviorally meaningful).
- Existing behavior is treated as the specification; where a helper's current output is
  reasonable, tests codify it (characterization), and any genuine bug found is raised
  rather than silently encoded.
