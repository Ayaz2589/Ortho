# Feature Specification: Finance Model Correctness & Honest Labels

**Feature Branch**: `feat/finance-model-correctness`

**Created**: 2026-07-18

**Status**: Draft

**Input**: User description: "Finance model correctness & honest labels (spec 9.4): verify and fix timezone insight-bucketing (A2), verify CLI leftover-cent ordering (A4), extend the independent oracle to risky engines — insights, amortization schedule, filters, lease timing (A3), relabel equity/net-rental/paid-off mortgage approximations honestly (B3), document the leftover-cent fairness policy (B4). TDD throughout. Feature number: 027."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Timezone-safe insight bucketing (Priority: P1)

A household member living west of UTC (e.g., Pacific time) has a bank-imported
transaction dated June 1. Today they open the Dashboard and see their June
insights. The transaction must appear in June's bucket, not May's — regardless
of the local system timezone.

**Why this priority**: A2 is confirmed-bug territory: any date-only string parsed
as UTC midnight shifts a day westward of UTC, silently placing boundary
transactions in the wrong month. Invisible in CI (pinned TZ=UTC) but exposed to
every real user whose device is west of UTC. Correctness of the core financial
model is the highest-priority class of fix.

**Independent Test**: Run `generateInsights` with a boundary-dated transaction
(June 1 date-only string) under `TZ=America/Los_Angeles` and assert it appears
in the June bucket, not May.

**Acceptance Scenarios**:

1. **Given** a transaction with `date: "2026-06-01"` (date-only, UTC midnight),
   **When** insights are generated with a June reference date under
   `TZ=America/Los_Angeles`,
   **Then** the transaction is counted as a June expense (not May).

2. **Given** the existing `insights.json` regression vectors (generated at TZ=UTC),
   **When** the test suite runs under `TZ=UTC`,
   **Then** all existing vectors continue to pass (no regression).

3. **Given** a noon-UTC app-created transaction (`"2026-06-15T12:00:00.000Z"`),
   **When** insights run under any timezone,
   **Then** it always lands in June (no change in existing behavior).

---

### User Story 2 — Oracle coverage for risky engines (Priority: P2)

A developer changes the amortization schedule calculation by one line. The CI
Vitest suite should catch this before it ships, using independently-derived
expected values — not values laundered from the same TS implementation. The same
protection must cover insights rule math, transaction filter edge cases, and
lease timing.

**Why this priority**: The spec-025 oracle (hand-verified goldens + property tests)
covered mortgage payment, balance, equity, housing math, splits, balances, and
money. The riskiest unprotected engines are insights (8 complex rules),
amortization schedule (float-dollar code path), filter month windows, and lease
timing. Without independent goldens, a bug in these engines passes straight
through the regeneration cycle.

**Independent Test**: Add hand-derived test cases to `finance-goldens.test.ts` for
each engine; verify a deliberate off-by-one in the covered formula fails the suite
(then revert).

**Acceptance Scenarios**:

1. **Given** an independent amortization-schedule golden (month 1 and month N
   derived from textbook formulas),
   **When** `upcomingAmortization` is called with the same inputs,
   **Then** the output matches the independent expected values to within 1¢.

2. **Given** independent invariants for `generateInsights` (rule 3 budget-over
   threshold, rule 5 recurring average truncation, rule 8 mortgage-ratio
   calculation),
   **When** the oracle suite runs,
   **Then** all pass against independently-computed expected values.

3. **Given** independent lease-timing goldens (`rentDueDay`, `daysUntilNextRent`
   with a month-end due day and a near-boundary `asOf`),
   **When** the oracle suite runs,
   **Then** all pass.

4. **Given** an independent filter-window golden (`monthBounds` UTC half-open
   boundary, cross-timezone stability),
   **When** the oracle suite runs,
   **Then** the `dateFrom`/`dateTo` values match the independently computed UTC
   timestamps.

---

### User Story 3 — CLI leftover-cent ordering verified (Priority: P2)

A household with two members whose `sort_order` differs from their lexical UUID
order imports a statement via the CLI. The leftover cent (from an odd-amount even
split) must land on the same person it would in the web app — so settle-up
balances derived later are accurate.

**Why this priority**: A4 is agent-surfaced and unverified. If the CLI already
uses `orderedOwnerIds` throughout, the spec documents the verification and
closes the item. If a divergence is found, the fix unifies the code path before
real splits are corrupted in the live database.

**Independent Test**: Construct a household where `sort_order` ≠ lexical UUID
order (member A has `sort_order=0` but UUID > member B's UUID). Run an odd-cent
even split through the CLI code path and the web code path; assert the leftover
cent lands on the same person (the one first in lexical UUID order).

**Acceptance Scenarios**:

1. **Given** household members `[{id: "zz…", sort_order: 0}, {id: "aa…", sort_order: 1}]`
   and a $3 (300¢) even split,
   **When** `toTransaction` in the CLI engine computes shares,
   **Then** `shares["aa…"] = 150, shares["zz…"] = 150` (even; no leftover),
   OR for a 101¢ split: `shares["aa…"] = 51, shares["zz…"] = 50` (leftover to
   lexically-first `"aa…"`, not sort-first `"zz…"`).

2. **Given** the verification reveals no divergence,
   **When** the PARITY.md entry is reviewed,
   **Then** the stale "sort_order divergence" note is updated to reflect the
   verified current state.

3. **Given** the verification reveals an actual divergence,
   **When** the CLI code path is fixed,
   **Then** the leftover cent lands identically in CLI and web for all split methods.

---

### User Story 4 — Honest labels for financial approximations (Priority: P3)

A homeowner opens the property detail screen and sees "Equity." They should
understand at a glance that this number is *principal paid down*, not market
value. Similarly "Net rental" excludes taxes, insurance, and maintenance — and a
fully paid-off mortgage should not perpetually show ~$2 of debt.

**Why this priority**: Labeling trust is important before the product reaches
strangers splitting bills. However, no money math changes — this is pure UI copy
and comment-level documentation, so the risk of regression is low and it can
land after the correctness fixes.

**Independent Test**: Read the housing screens for the three affected labels;
confirm copy matches the new honest descriptions without a live backend or math
change.

**Acceptance Scenarios**:

1. **Given** a property with a mortgage where the owner has made N payments,
   **When** the Housing card shows "Equity",
   **Then** the label reads "Principal paid down" (or equivalent honest phrasing)
   rather than "Equity" alone, and a subtitle or tooltip clarifies it excludes
   market-value appreciation.

2. **Given** a multifamily property with occupied units,
   **When** the Housing card shows "Net rental",
   **Then** a clarifying note indicates the figure is rent minus P&I only (taxes,
   insurance, maintenance excluded).

3. **Given** a mortgage with `currentPrincipalBalanceCents` returning a positive
   value solely due to floating-point residual (≤ $5),
   **When** the paid-off display is shown,
   **Then** the UI treats the property as paid off rather than showing a spurious
   debt amount. [NEEDS CLARIFICATION: should the paid-off threshold be a
   configurable constant, or is ≤ 500¢ a sensible fixed floor?]

---

### User Story 5 — Rounding fairness policy documented (Priority: P4)

A developer reading the splits code should immediately understand *why* the
leftover cent always goes to the canonically-first owner (not the
largest-remainder owner), and the product team should have made a deliberate
decision about this before the product scales.

**Why this priority**: B4 is a documentation / policy item with zero behavior
change. It should be done before the product goes to strangers, but can land last.

**Independent Test**: Read the updated code comment and PARITY.md entry; confirm
the policy is stated explicitly and non-ambiguously.

**Acceptance Scenarios**:

1. **Given** the leftover-cent rounding logic in `splits.ts`,
   **When** a developer reads the relevant comment,
   **Then** the comment explicitly states: "the leftover cent goes to the
   canonically-first owner (lexical UUID sort), not the largest-remainder owner —
   a deliberate, documented, sub-cent-magnitude policy choice."

2. **Given** PARITY.md's entry for "Canonical leftover-cent order",
   **When** read by a new engineer,
   **Then** it states the policy and references the decision rationale.

---

### Edge Cases

- What happens when the timezone offset straddles midnight on exactly the first of
  a month (a transaction that's June 1 UTC midnight = May 31 local time)?
- What if a household has only one active member? (No leftover-cent ambiguity —
  trivially the sole owner gets everything. The test should still pass.)
- What if `sort_order` is identical for all members? (Identical `sort_order`
  values mean the DB ordering is non-deterministic — `orderedOwnerIds` still
  produces a stable canonical order from UUIDs.)
- What if `upcomingAmortization` is called at the last month of the loan? (No
  overflow; the principal should floor to 0.)
- What if `daysUntilNextRent` is called when today is the due day? (Should return
  0 or the next cycle's count — validate against the existing vector.)

## Requirements *(mandatory)*

### Functional Requirements

**Track A — Correctness**

- **FR-001**: The `generateInsights` function MUST bucket transactions by the
  local calendar month of `now` consistently with how it parses transaction date
  strings — so a `"YYYY-MM-DD"` date-only string on a month boundary is never
  miscategorized for users in timezones west of UTC.

- **FR-002**: A dedicated non-UTC timezone test MUST exist in the Vitest suite
  for `generateInsights` that exercises a boundary-dated transaction (first of
  month, date-only) under `TZ=America/Los_Angeles`; it MUST be isolated from
  the `TZ=UTC`-pinned parity vectors (different test file or explicit TZ override
  per test).

- **FR-003**: The CLI's `toTransaction` engine MUST canonicalize owner order via
  `orderedOwnerIds` before computing split shares, identically to the web app —
  verified by a unit test with a `sort_order` ≠ lexical-UUID-order household.

- **FR-004**: `web/test/finance-goldens.test.ts` MUST be extended with
  independently-derived hand-computed goldens for:
  - Month-1 and month-N amortization schedule entries (principal + interest
    derived from the textbook recurrence).
  - At least two `generateInsights` rule computations (budget-over threshold with
    a specific spend/limit ratio; recurring-average truncation with an exact
    inter-charge gap sequence).
  - `monthBounds("YYYY-MM")` output verified as correct UTC half-open boundaries.
  - `daysUntilNextRent` for a 31-day-due-day lease when `asOf` crosses a
    short month (due day clamped to month-end).

- **FR-005**: `web/test/finance-properties.test.ts` MUST be extended with
  invariant tests for `generateInsights`:
  - All returned insight `id`s match the documented scheme patterns.
  - `magnitude_cents` is always ≥ 0.
  - Total insights returned ≤ `limit`.

**Track B — Labels & Policy**

- **FR-006**: The housing UI MUST relabel the "Equity" figure with copy that
  communicates it represents *principal paid down*, not market appreciation.

- **FR-007**: The housing UI MUST add a clarifying note to "Net rental" stating
  it is rent income minus P&I mortgage payment only (taxes, insurance, maintenance
  not included).

- **FR-008**: The `currentEquityCents` display path MUST treat any residual
  balance ≤ a defined constant (`PAID_OFF_THRESHOLD_CENTS`, default 500¢ / $5)
  as fully paid off, to avoid displaying a spurious ~$2 debt after the final
  amortization payment.

- **FR-009**: `web/lib/splits.ts` MUST contain a code comment above the leftover-
  cent distribution block explicitly stating the policy: "leftover cents go to the
  canonically-first owner in `orderedOwnerIds` order — a deterministic, sub-cent-
  magnitude fairness choice, not largest-remainder." PARITY.md MUST reference
  this policy in the canonical-leftover-cent row.

### Key Entities

- **Transaction date string**: A date stored as `"YYYY-MM-DD"` (date-only, parses
  UTC midnight) vs `"YYYY-MM-DDTHH:MM:SS.sssZ"` (full ISO 8601, noon-UTC for
  app rows). The timezone bug lives at the boundary between these two regimes.
- **Insight month window**: The `[mStart, mEnd)` interval derived from `now` using
  local calendar getters in `monthInterval`. Must be consistent with how
  transaction date strings are parsed in `inInterval`.
- **Leftover cent**: The 1¢ remainder from integer division of `amount_cents / n`
  for an even split with an odd amount. Goes deterministically to the first owner
  in `orderedOwnerIds` (ascending string sort of UUIDs).
- **Paid-off threshold**: A small positive balance ≤ `PAID_OFF_THRESHOLD_CENTS`
  that represents floating-point residual, not real debt.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All existing 1,375 Vitest tests continue to pass after the changes
  (zero regressions).

- **SC-002**: The new non-UTC insight-timezone test passes under
  `TZ=America/Los_Angeles`; the same test fails (or is absent) against the
  pre-fix `insights.ts` code (verified by reverting the fix and confirming failure).

- **SC-003**: At least 8 new independently-derived oracle test cases are added
  across the four target engines (amortization, insights rules, filter windows,
  lease timing), each with the derivation visible in the test source.

- **SC-004**: The CLI leftover-cent ordering is verified; the outcome (no
  divergence found OR divergence found and fixed) is recorded in PARITY.md with
  the test reference.

- **SC-005**: The housing UI copy changes are visible in the rendered components
  for equity and net rental; no financial math changes in any `.ts` engine file.

- **SC-006**: The leftover-cent policy comment in `splits.ts` and PARITY.md entry
  can be read by a new engineer without prior context and understood in under
  60 seconds.

## Assumptions

- All money logic is pure TypeScript in `web/lib/finance/*`, `web/lib/splits.ts`,
  etc. — no backend/database changes are needed for any correctness item.
- The timezone fix for A2 does not require changing the `TZ=UTC` pin in
  `gen-vectors.ts` or `vitest.config.ts` — the non-UTC test runs with an explicit
  TZ override per test, not by unpinning the generator.
- The existing `insights.json` regression vectors are mid-month (noon-UTC) by
  convention and therefore are unaffected by the timezone fix; vectors need not
  be regenerated for A2.
- For B3 UI copy changes, the single source of truth is the React component layer;
  no design token or CSS change is needed.
- The paid-off threshold (FR-008) is a display-only guard — `currentEquityCents`
  keeps returning the exact computed value; the threshold is applied at the
  render/display layer.
- A4 verification may conclude "no divergence" — in which case the deliverable is
  the test proving correctness plus a PARITY.md update removing the stale note.
