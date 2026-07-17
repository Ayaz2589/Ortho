# Feature Specification: Finance Model Hardening

**Feature Branch**: `025-finance-hardening`

**Created**: 2026-07-17

**Status**: Draft

**Input**: Hardening backlog from the `docs/finance.md` review (items H1–H3 + smaller notes): the regression suite is a change-detector not a correctness oracle; the USD-cents invariant is enforced by discipline rather than types; insight thresholds are inline magic numbers.

## Overview

Ortho's finance logic (`web/lib/finance/*`, `splits.ts`, `balances.ts`,
`transactionFilters.ts`) is careful, pure, and vector-pinned — but the review in
`docs/finance.md` §16 found the *scaffolding* has weakened since the Swift mirror
was frozen (spec 021). This feature closes the highest-value, lowest-risk gaps
**without changing any observable money/date behavior**: it adds a real
correctness oracle, gives the cents invariant a type, and de-magics the insight
thresholds. All work is pure TypeScript, developed test-first, and runs green in
CI on Linux.

Behavior-changing or infrastructure items from the backlog (the database
shares-sum constraint H3(b); the `upcomingAmortization` integer-cents rework H2;
the date-regime consolidation H4) are **explicitly out of scope** here — they
need a migration and/or a reviewed behavior change and are tracked separately (see
Assumptions & Out of Scope).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Money math is provably correct, not just unchanged (Priority: P1)

The maintainer needs confidence that the finance engines compute the *right*
answer, not merely the *same* answer as last time. Today the vectors are
generated from the implementation, so an unintended change is silently baked in
on regeneration. Independently-derived assertions break this circularity.

**Why this priority**: This is the core weakness (backlog H1). Every other item is
secondary to knowing the numbers are correct. Highest safety-per-effort.

**Independent Test**: Add a suite of hand-computed golden values (each with its
manual derivation shown) and property-based invariants, and confirm they pass
against the current implementation and would fail if a core formula regressed.
Deliverable is the tests themselves — no production code required for this story.

**Acceptance Scenarios**:

1. **Given** a mortgage of $300,000 at 6% over 30 years, **When**
   `monthlyPaymentCents` is called, **Then** it returns the independently-computed
   payment (≈ $1,798.65) within ±1 cent.
2. **Given** an amount that does not divide evenly, **When** `computeShares`
   splits it even/percent, **Then** the per-owner cents **sum exactly to the
   amount** and the leftover lands on the first owner in canonical order — asserted
   over many randomized-but-seeded owner sets.
3. **Given** any transaction set, **When** `balanceBetween(a, b, txs)` and
   `balanceBetween(b, a, txs)` are computed, **Then** they are exact negatives of
   each other (antisymmetry).
4. **Given** any whole-cent amount and any supported currency/rate, **When** it is
   converted to display and back, **Then** it round-trips to the original cents
   within the currency's representable tolerance.

### User Story 2 - The cents invariant is expressed in the type system (Priority: P2)

A maintainer wiring money through a new code path should be caught at compile time
if they pass dollars where cents are expected, and at runtime if a non-integer
cent value slips in.

**Why this priority**: Backlog H3(a). Turns an implicit, comment-enforced invariant
into a checkable one. Additive (a branded subtype of `number`), so it does not
ripple through existing callers.

**Independent Test**: Introduce a branded `Cents` type plus validated constructors
and guards; assert the constructors accept integers, reject non-integers/NaN, and
that `Cents` remains assignable to `number` so existing code is unaffected.

**Acceptance Scenarios**:

1. **Given** `toCents(1299)`, **When** constructed, **Then** it returns a `Cents`
   value equal to 1299.
2. **Given** `toCents(12.5)` or `toCents(NaN)`, **When** constructed, **Then** it
   throws a clear error.
3. **Given** `centsFromDollars(12.99)`, **When** constructed, **Then** it returns
   `1299` as `Cents` (round-half-away-from-zero).
4. **Given** existing functions typed with `number`, **When** a `Cents` value is
   passed, **Then** the project still typechecks (no ripple).

### User Story 3 - Insight thresholds are named and centralized (Priority: P3)

A maintainer tuning or reviewing the insight rules should read intent
(`INSIGHT_THRESHOLDS.budgetNearFraction`), not a bare `0.85` buried mid-function.

**Why this priority**: Smallest item, pure readability/testability win, zero
behavior change (the vectors prove it).

**Independent Test**: Extract every inline threshold in `insights.ts` to one named
config object, refactor the engine to consume it, and confirm `npm run gen:vectors`
produces a byte-identical `insights.json` (no behavior change).

**Acceptance Scenarios**:

1. **Given** the refactor, **When** the full Vitest suite runs, **Then**
   `insights.parity.test.ts` passes with the committed `insights.json` unchanged.
2. **Given** the config object, **When** inspected, **Then** it names every
   threshold the engine uses (MoM delta floor, budget near/under fractions,
   recurring cadence band, outlier multiple, savings/mortgage ratios, etc.).

### Edge Cases

- Zero-interest mortgage: golden covers `r === 0` payment/balance.
- Single-owner split: the whole amount goes to the one owner (no leftover logic).
- Percent split totalling `100 + tolerance`: shares still sum to the amount (the
  reclaim path), covered by property test.
- `toUSDCents` with `rate <= 0`: returns 0 (documented guard), asserted so the
  behavior is pinned, not accidental.
- Currency round-trip for a zero-fraction currency (JPY): tolerance accounts for
  the coarser representable unit.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The suite MUST include independently-computed golden values (with the
  derivation shown in comments) for at least: `monthlyPaymentCents`,
  `currentPrincipalBalanceCents`, `computeShares` (leftover placement),
  `balanceBetween`, `netRentalCents`, and currency conversion.
- **FR-002**: The suite MUST include property/invariant tests asserting: shares sum
  to amount (even & percent, incl. the over-100 reclaim); `computeShares(owners,
  asInput(seedSplit(...))) === storedCents`; `balanceBetween` antisymmetry;
  currency round-trip within tolerance; no share is negative.
- **FR-003**: These tests MUST be independent of the generated vectors (they assert
  derived truth, not the `shared/test-vectors/*.json` fixtures).
- **FR-004**: A branded `Cents` type MUST exist with validated constructors
  (`toCents`, `centsFromDollars`) and guards (`isCents`, `assertCents`); non-integer
  or NaN inputs MUST be rejected at runtime.
- **FR-005**: `Cents` MUST be a subtype of `number` so introducing it does NOT
  require changing existing call sites (no typecheck ripple).
- **FR-006**: All inline insight thresholds MUST be extracted to one named config
  and consumed by `insights.ts`, with **no change** to `insights.json` output.
- **FR-007**: The full suite (`npm test`) and `tsc --noEmit` MUST pass; the
  committed vectors MUST remain byte-identical (proving no behavior change).
- **FR-008**: All new behavior MUST be developed test-first (a failing test precedes
  the production code that satisfies it), per constitution Principle VI.

### Key Entities

- **Cents**: a branded integer representing whole US cents; the compile-time
  expression of the storage invariant.
- **INSIGHT_THRESHOLDS**: a named config object holding every numeric cutoff the
  insight rules use.
- **Golden case**: an `{ input, expected, derivation }` record whose `expected` is
  computed by hand/independently, not by the implementation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: ≥ 15 independently-derived golden assertions and ≥ 6 property
  invariants cover the finance engines.
- **SC-002**: Introducing a deliberate off-by-one in any covered formula makes at
  least one new test fail (the oracle actually bites) — demonstrated once during
  development, then reverted.
- **SC-003**: `npm test` is green and `shared/test-vectors/*.json` is unchanged by
  this feature (git shows no diff to those files).
- **SC-004**: `tsc --noEmit` passes with the branded `Cents` type present and zero
  changes required to existing call sites.
- **SC-005**: Every threshold in `insights.ts` is referenced from
  `INSIGHT_THRESHOLDS`; no bare numeric cutoff remains in the rule bodies.

## Assumptions & Out of Scope

- **Assumption**: Work is pure TypeScript under `web/`, runnable and CI-verifiable
  on Linux (no Xcode, no live Supabase needed).
- **Assumption**: Round-half-away-from-zero and the existing documented behaviors
  (e.g. `toUSDCents` rate guard) are *correct as specified* — this feature pins
  them, it does not change them.
- **Out of scope — H3(b) database shares-sum guarantee**: a Postgres
  `CHECK`/trigger or atomic parent+shares RPC. Needs a migration and live-DB
  verification; tracked as a follow-up spec/PR.
- **Out of scope — H2 `upcomingAmortization` integer-cents rework**: a real
  behavior change to a vectored function; must be done behind an independent golden
  and reviewed as a behavior diff. Deferred.
- **Out of scope — H4 date-regime consolidation**: documentation/guard-rail only;
  no refactor warranted. Covered by `docs/finance.md` §12 and §16.
- **Dependency**: none beyond the existing web workspace (`cd web && npm install`).
</content>
