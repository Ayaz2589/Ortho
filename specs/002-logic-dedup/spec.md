# Feature Specification: Logic De-duplication (no backend tier)

**Feature Branch**: `002-logic-dedup`

**Created**: 2026-06-11

**Status**: In progress

**Input**: "Reduce business-logic duplication between web and iOS without standing up a backend service. Move shared aggregations into Postgres, and lock mortgage + insight-engine parity across Swift and TypeScript with shared golden test vectors."

## Overview

Ortho has two native clients (web/TypeScript, iOS/Swift) talking directly to
Supabase, and the same finance logic is implemented twice. A full backend tier
is not justified (it would re-implement Supabase's auth/REST/RLS, hurt the
optimistic/offline UX, and still leave presentation logic on both clients).
Instead, reduce duplication by **layer placement**:

1. **Aggregations → Postgres.** The dashboard rollups (per-owner spend,
   category totals, monthly income/expense, daily expense series) move to SQL
   views + RPCs. One definition serves both clients; no new service.
2. **Pure calc parity → shared golden test vectors.** The genuinely duplicated
   logic that resists SQL (mortgage amortization, the 8-rule insight engine)
   stays in both languages but is locked by a shared set of canonical
   input→output cases that **both** the TS and Swift test suites assert against.
   This kills *drift* — the real pain — without unifying the code.

Presentation/formatting and optimistic-UI math stay per-client by design.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Aggregations defined once in Postgres (Priority: P1)

A maintainer changes how per-owner spend is computed. They edit one SQL
definition; both web and iOS pick up the change with no client code edit.

**Why this priority**: The aggregations are the bulk of the duplicated math and
the cheapest to dedupe (both clients already call Postgres).

**Independent Test**: Apply the migration; call each RPC with a known household
fixture and confirm the result equals the current client-side computation
(split-weighted owner spend, category totals, monthly income/expense, daily
expense series).

**Acceptance Scenarios**:

1. **Given** a household with shared + personal expenses, **When** the
   `household_owner_spend` RPC is called for a month, **Then** each owner's
   total equals the split-weighted sum the dashboard currently shows.
2. **Given** the same data, **When** `household_category_totals` /
   `household_month_summary` / `household_daily_expense` are called, **Then**
   each matches the existing TS computation for the same interval.
3. **Given** RLS, **When** a non-member calls the RPC, **Then** it returns no
   rows for that household (security definer functions respect membership).

### User Story 2 - Mortgage parity locked across languages (Priority: P1)

A maintainer edits the mortgage math in one language. CI fails if it diverges
from the canonical vectors, so Swift and TS can never silently drift.

**Why this priority**: Mortgage math already drifted once (day-aware month
counting). It is pure, deterministic, and high-trust (drives displayed equity).

**Independent Test**: Run the TS suite and the Swift suite against
`shared/test-vectors/mortgage.json`; both pass on identical expected outputs
for payment, balance, equity, equity fraction, maturity, years remaining, and a
12-month amortization slice.

**Acceptance Scenarios**:

1. **Given** a vector with fixed `closingDate`, rate, term, and `asOf`,
   **When** TS and Swift compute `monthlyPaymentCents`, **Then** both equal the
   vector's expected cents.
2. **Given** date-dependent fields, **When** both compute current balance /
   equity / years-remaining at the pinned `asOf`, **Then** both equal the
   vector (TS month/year counting is made calendar-accurate to match Swift).

### User Story 3 - Insight-engine parity locked across languages (Priority: P2)

The 8 insight rules fire identically in both languages for the same snapshot.

**Why this priority**: The insight engine is the other duplicated pure module;
it's the basis for the future LLM recommendation pass, so parity matters.

**Independent Test**: Run both suites against
`shared/test-vectors/insights.json`; for each scenario (fixed `referenceDate`),
the set of fired insight IDs and their `(severity, category, magnitude_cents)`
match the vector.

**Acceptance Scenarios**:

1. **Given** a scenario that should fire "top category", "over budget", and
   "spending exceeds income", **When** both engines run, **Then** both return
   exactly those insight IDs with matching severity + magnitude.
2. **Given** a scenario with no qualifying data, **When** both run, **Then**
   both return an empty list.

### Edge Cases

- **Day-of-month month counting** near boundaries (closing on the 28th, asOf on
  the 1st) — vectors pin safe dates; TS is corrected to match Swift semantics.
- **Zero-interest mortgage** — flat amortization path covered by a vector.
- **Empty / non-member household** for RPCs — returns nothing under RLS.
- **Currency** — all vectors and RPC outputs are USD cents (display conversion
  stays on the client; out of scope here).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A Postgres migration MUST define security-definer RPCs returning
  USD-cent aggregates for a household over a date range: split-weighted per-owner
  expense, per-category expense, monthly income/expense/net, and a daily expense
  series. Definitions MUST match the current TS computations.
- **FR-002**: RPCs MUST respect household membership (no cross-household leakage).
- **FR-003**: The web app MUST gain a thin data-access wrapper for the RPCs
  (additive — the app keeps working before the migration is applied; cut-over is
  documented).
- **FR-004**: `shared/test-vectors/` MUST contain `mortgage.json` and
  `insights.json` with fixed inputs (including pinned `asOf`/`referenceDate`) and
  expected outputs in USD cents.
- **FR-005**: The web test suite (Vitest) MUST assert `lib/finance/mortgage.ts`
  and `lib/finance/insights.ts` against the vectors and pass.
- **FR-006**: A Swift XCTest MUST assert `MortgageInfo` and `InsightEngine`
  against the *same* vector files (added as a bundled resource).
- **FR-007**: TS mortgage month/year counting MUST be made calendar-accurate to
  match Swift's `dateComponents` semantics so the vectors pass on both.
- **FR-008**: No backend service is introduced; clients still talk to Supabase
  directly. Presentation/optimistic logic stays per-client.

### Key Entities

- **Test vector**: a JSON case — inputs (mortgage params + `asOf`, or a tx/budget
  snapshot + `referenceDate`) and expected outputs (cents / insight set).
- **Aggregate RPC**: a Postgres function over `(household_id, start, end)`
  returning cents, callable by both clients.

## Success Criteria *(mandatory)*

- **SC-001**: One SQL edit changes an aggregation for both clients (no client
  code change required to adopt).
- **SC-002**: TS and Swift produce identical outputs for 100% of mortgage
  vectors and insight scenarios.
- **SC-003**: Editing either mortgage/insight implementation to diverge makes at
  least one suite fail (drift is caught mechanically).
- **SC-004**: The running web app is not broken by this change before the
  migration is applied (RPC wrapper is additive).

## Assumptions

- The SQL migration is applied by the maintainer (no DB credentials in this
  environment); the web RPC path activates after apply.
- The Swift XCTest is added to an Xcode test target by the maintainer and run on
  macOS (cannot compile XCTest here); the test file + vectors are delivered ready.
- Vectors encode the *intended* (iOS-canonical) behavior; TS is corrected where
  it diverged.
- Currency/locale formatting and live FX remain client concerns, untouched.
