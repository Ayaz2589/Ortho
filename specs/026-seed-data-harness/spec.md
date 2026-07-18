# Feature Specification: Seed-Data Harness + Edge-Case Coverage Corpus

**Feature Branch**: `026-seed-data-harness`

**Created**: 2026-07-17

**Status**: Draft

**Input**: User description: "Seed-data harness + edge-case coverage corpus (backlog §9.1). A deterministic, pure, seedable generator that emits a COVERAGE CORPUS across the whole Ortho finance data model, consumable as a test corpus and runnable to seed a dev/demo database, explicitly scoped to reproduce the A2 (timezone insight-bucketing) and A4 (CLI sort_order split) bugs."

## Overview

Ortho's finance model (transactions, per-member splits, multi-currency, budgets,
mortgages/leases, insights) is currently exercised by ~16 hand-written happy-path
sample rows (`web/lib/testdata/seed.ts`) and a handful of test factories
(`web/test/helpers/fixtures.ts`). That data never crosses a month boundary west
of UTC, never disagrees on owner ordering, never carries a refund, and never
pays off a mortgage — so whole branches of the money logic are validated only by
hand-picked cases, and demos always show the tidy path.

This feature builds a **deterministic coverage-data generator**: a pure function
that emits a deliberately diverse corpus of households spanning the finance
model's edge cases. The corpus is consumed two ways — as an in-memory fixture for
the automated test suite, and as a runnable seed for a development/demo database.
Its explicit design goal is **coverage over volume**: a few hundred deliberately
varied households that touch every branch, not thousands of near-identical clones.

Two suspected correctness defects — **A2** (insight month-bucketing misassigns
boundary-dated rows for viewers west of UTC) and **A4** (the import path and the
app disagree on which member absorbs a split's leftover cent) — are currently
invisible to the test suite because no fixture reproduces the conditions that
trigger them. This corpus is scoped to **make both defects observable**, so that
verifying them (and, in a later feature, fixing them) becomes a byproduct of
running the corpus rather than a separate manual investigation.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Deterministic edge-case corpus for the test suite (Priority: P1)

A developer writing or maintaining Ortho's finance logic imports the generated
corpus into an automated test and asserts behavior against households that
deliberately span the edge cases — every split method, month-boundary dates,
multiple currencies, refunds/negatives, paid-off mortgages, budgets in every
band. The corpus is byte-for-byte identical on every run, so tests are
reproducible and snapshotable; a diff in the serialized corpus is a signal, not
noise.

**Why this priority**: This is the engine. Without a deterministic, importable
corpus there is nothing to seed a database from and nothing to reproduce the
bugs against. It delivers standalone value the moment it exists: the finance
engines gain systematic edge-case coverage they lack today.

**Independent Test**: Generate the corpus twice with the same seed and confirm
the serialized output is identical; import it into a test and confirm it contains
at least one household for each required coverage dimension (enumerated in FR-004).

**Acceptance Scenarios**:

1. **Given** a fixed seed value, **When** the corpus is generated twice, **Then**
   the two serialized outputs are byte-for-byte identical.
2. **Given** the generated corpus, **When** a developer enumerates its households,
   **Then** every dimension in the coverage matrix (FR-004) is represented by at
   least one household, and the mapping from dimension → household is discoverable
   (each scenario is labelled).
3. **Given** any generated transaction with owners and a split method, **When**
   its per-owner shares are summed, **Then** the sum equals the transaction
   amount exactly (shares reconcile) for every transaction in the corpus.
4. **Given** the generated corpus, **When** it is validated against the current
   data-model types, **Then** every row is type-valid and every foreign-key
   reference (member → household, share → transaction, mortgage → property, etc.)
   resolves.

---

### User Story 2 - Reproduce the A2 and A4 correctness defects (Priority: P1)

A developer runs the corpus through the affected engines to confirm two suspected
defects are real and to lock them with a failing test, before any fix is written.

- **A2 (timezone insight-bucketing)**: the corpus contains transactions dated on
  a month boundary and stored at a time-of-day that is *not* noon-UTC. When the
  insights engine buckets those transactions into months while the evaluating
  environment's local timezone is west of UTC (e.g. `America/New_York`), at least
  one boundary-dated transaction lands in the wrong month.
- **A4 (split leftover-cent divergence)**: the corpus contains a household whose
  members' stored display order disagrees with their canonical (lexical-id)
  order, and a transaction whose even split produces a leftover cent. Ordering the
  owners the way the import path does versus the way the app does assigns that
  leftover cent to a *different* member.

**Why this priority**: The whole rationale for building the corpus now (rather
than after the realism research) is that it doubles as the verification harness
for these two defects. If it cannot reproduce them, it has not met its purpose.

**Independent Test**: A test running under `TZ=America/New_York` over the corpus
shows an insight month-bucket disagreeing with the hand-derived expected bucket
for the boundary rows (A2); a test computes the leftover-cent recipient under both
owner orderings for the divergent household and shows the recipient differs (A4).

**Acceptance Scenarios**:

1. **Given** the corpus and an evaluating timezone west of UTC, **When** the
   insight month-bucketing is applied to the month-boundary transactions, **Then**
   at least one transaction is bucketed into a month different from the one a
   correct calendar-date assignment would choose, and the affected transactions
   are identifiable.
2. **Given** the same corpus evaluated under UTC, **When** the same bucketing is
   applied, **Then** the misassignment does **not** occur — demonstrating the
   defect is timezone-dependent (and explaining why UTC-pinned CI never saw it).
3. **Given** the divergent-ordering household and a leftover-cent transaction,
   **When** shares are computed with owners ordered by stored display order versus
   canonical lexical-id order, **Then** the member receiving the leftover cent
   differs between the two orderings.
4. **Given** a household whose display order already matches canonical order,
   **When** the same comparison is run, **Then** the leftover-cent recipient is
   the same under both orderings (the divergence is specific to the mismatched
   household, not universal).

---

### User Story 3 - Seed a development / demo database (Priority: P2)

A developer or demo operator runs the harness against a development database and
populates it with the coverage corpus, so the running app shows populated,
varied, non-idealized screens (multiple households, over-budget categories,
refunds, a paid-off property) instead of empty states or the tidy 16-row sample.
Running it again produces the same rows (idempotent by construction of the
deterministic corpus).

**Why this priority**: This is the "runnable seed" half of the deliverable and
the bridge to demo/design validation. It is P2 because the corpus (P1) delivers
its core test value without it, but it is in-scope for this feature.

**Independent Test**: Seed an empty development database from the corpus, then
confirm the app renders populated households, transactions, budgets, and
properties drawn from the corpus; re-run and confirm no duplicate rows are
created.

**Acceptance Scenarios**:

1. **Given** an empty development database, **When** the harness seeds it from the
   corpus, **Then** the database contains exactly the corpus's rows and the app
   renders them across its screens.
2. **Given** a development database already seeded from the corpus, **When** the
   harness is run again, **Then** the resulting row set is identical (no
   duplicates, deterministic ids).
3. **Given** a request to seed, **When** the target is not a clearly
   development/local database, **Then** the harness refuses to write (it never
   targets shared/production data).

---

### Edge Cases

- **Zero-decimal currencies**: JPY has no minor unit — the corpus must represent
  JPY amounts correctly (whole yen), not as "cents", so any code that assumes a
  2-decimal minor unit is exercised.
- **Month boundaries of differing length**: the corpus must include the 1st and
  the last day of months of 28/29/30/31 days (including a February in both a leap
  and non-leap year) so off-by-one month math is exposed.
- **Refunds / credits**: a return must be present. The data model forbids
  negative amounts (the `amount_non_negative` DB check on `transactions`, and
  `transaction_shares` are `>= 0`), so a refund is represented the way the app
  represents money coming back — a positive income-kind credit — not a negative
  expense. The corpus must not emit negative amounts (they are unstorable).
- **Leftover-cent wrapping**: amounts and owner counts must include cases where
  the even/percent split leaves 1..n-1 leftover cents to distribute (e.g. a
  3-owner even split of an amount not divisible by 3).
- **Paid-off mortgage residual**: a mortgage whose schedule has run to completion
  must be present (the case that today shows a perpetual ~$2 residual), so
  end-of-schedule behavior is represented.
- **Separate-finances household**: a household where members do not share money
  (no joint rows) must exist alongside joint households, so settle-up/balance
  logic is exercised at both extremes.
- **Sparse vs dense months**: at least one household with months containing zero
  transactions and at least one with a high transaction count, so per-month
  aggregation handles both.
- **Multifamily occupancy**: a property with multiple units where some are
  occupied and some vacant, so occupied-only net-rental logic is exercised.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a generator that, given a fixed seed input,
  produces a coverage corpus that is **deterministic** — identical on every run,
  with no dependence on the wall clock or non-seeded randomness.
- **FR-002**: The generated corpus MUST serialize to a **stable, canonical form**
  (stable ordering and formatting) so it can be snapshotted and diffed; an
  unintended change to the generator surfaces as a diff.
- **FR-003**: The corpus MUST cover the full finance data model — households,
  members and their household-people records, users, funding sources/cards,
  transactions, per-owner transaction shares, properties, mortgages, leases,
  rental units, rental payments, and budgets — such that no entity type is
  entirely absent.
- **FR-004**: The corpus MUST include at least one labelled household for **each**
  of the following coverage dimensions, and the label MUST make the dimension it
  targets discoverable:
  - joint-finances household **and** separate-finances household;
  - each split method: even, percent, and value;
  - leftover-cent split cases (amount/owner-count combinations that leave 1..n−1
    cents to distribute);
  - multiple currencies including USD, EUR, JPY (zero-decimal), and BDT;
  - transactions dated on month boundaries (1st and last day) across months of
    differing length, including February in a leap and a non-leap year;
  - refunds/credits (positive income-kind rows; negative amounts are forbidden
    by the DB `amount_non_negative` check and are never emitted);
  - sparse months (zero transactions) and dense months (high count);
  - a property with a mortgage, a property with a lease, a **paid-off** mortgage,
    and a multifamily property with mixed unit occupancy;
  - budgets falling in the under, near, and over spending bands;
  - recurring merchants (the same merchant appearing across multiple months);
  - a household whose members' stored display order does **not** match their
    canonical lexical-id order.
- **FR-005**: Every transaction in the corpus MUST have per-owner shares that
  **reconcile to the transaction amount exactly**, computed via the project's
  existing split logic (the corpus MUST NOT re-implement or fork split math).
- **FR-006**: The corpus MUST reproduce the **A2** condition: it MUST include
  month-boundary-dated transactions stored at a time-of-day other than noon-UTC,
  such that applying the insight month-bucketing under a timezone west of UTC
  misassigns at least one of them to the wrong month, while applying it under UTC
  does not. The affected transactions MUST be identifiable from the corpus labels.
- **FR-007**: The corpus MUST reproduce the **A4** condition: it MUST include a
  household whose stored display order disagrees with canonical lexical-id order
  together with a leftover-cent transaction, such that the leftover cent is
  assigned to different members under the two orderings. The household MUST be
  identifiable from the corpus labels.
- **FR-008**: The system MUST provide a way to **seed a development/local
  database** from the corpus, producing exactly the corpus's rows with stable
  ids, such that re-running does not create duplicates.
- **FR-009**: The seeding path MUST refuse to write to any target that is not
  clearly a development/local database, so it can never mutate shared or
  production data.
- **FR-010**: The corpus MUST be consumable as an **in-memory fixture** by the
  automated test suite without requiring a database or network.
- **FR-011**: The generator MUST be structured so a later realism layer can supply
  distribution inputs (category mixes, amounts, cadences) **without changing the
  generation engine** — the "what is realistic" inputs are separable from the
  "how the corpus is assembled" engine. (Producing those realistic distributions
  is out of scope here — see Out of Scope.)
- **FR-012**: The corpus size MUST honor **coverage over volume**: on the order of
  a few hundred households chosen for diversity, not a large pool of near-identical
  clones. Adding scale (thousands of clones) is explicitly out of scope.
- **FR-013**: The corpus MUST NOT introduce a second definition of any shared
  concept (split math, currency minor units, ordering rules); it MUST reuse the
  existing definitions so it stays a faithful mirror of production behavior.

### Key Entities *(include if feature involves data)*

- **Coverage corpus**: the top-level deterministic dataset — a collection of
  households plus all their dependent rows, in a stable serialized form, with each
  household carrying a label identifying the coverage dimension(s) it targets.
- **Household scenario**: one labelled household and its complete dependent graph
  (members, funding sources, transactions + shares, properties + mortgage/lease/
  units/payments, budgets), constructed to exercise one or more coverage
  dimensions.
- **Member (household person)**: a person within a household, carrying both a
  canonical identity (its id) and a stored display order; the relationship between
  those two is a coverage dimension (matching vs mismatched order).
- **Transaction + shares**: a money event with a kind (expense/income/transfer/
  refund), amount, currency, date (including time-of-day, which matters for A2),
  owners, split method, and the per-owner share breakdown that must reconcile to
  the amount.
- **Property + housing records**: a property with an optional mortgage (including
  the paid-off case), lease, rental units with occupancy, and rental payments.
- **Budget**: a per-category monthly limit placed so that the household's actual
  spend falls in a chosen band (under/near/over).
- **Seed input**: the fixed value that makes generation deterministic; the same
  input always yields the same corpus.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Generating the corpus twice with the same seed yields byte-for-byte
  identical serialized output (100% reproducible).
- **SC-002**: Every coverage dimension listed in FR-004 is represented by at least
  one discoverable, labelled household (100% dimension coverage), verifiable by an
  automated check that maps dimensions to households.
- **SC-003**: 100% of transactions in the corpus have shares that reconcile
  exactly to their amount.
- **SC-004**: A test evaluating the corpus under a timezone west of UTC observes
  the A2 misbucketing, and the same test under UTC does not — demonstrating the
  defect and its timezone dependence in an automated, repeatable way.
- **SC-005**: A test shows the A4 leftover-cent recipient differs between the two
  owner orderings for the divergent household and is identical for an
  aligned-order household.
- **SC-006**: Seeding a fresh development database from the corpus populates every
  major app screen with corpus data, and re-running the seed produces no duplicate
  rows.
- **SC-007**: The corpus contains on the order of a few hundred households (target
  band, not thousands), and no dimension relies on a single fragile hand-authored
  row that could silently drop out.
- **SC-008**: No new duplicate implementation of split math, currency minor-unit,
  or ordering rules is introduced (verifiable by inspection — the generator calls
  existing shared logic).

## Assumptions

- The generator lives in the web/TypeScript workspace and reuses the existing
  domain types and split logic; it is developer-facing tooling, not an end-user
  feature (no in-app UI to browse the corpus is in scope).
- "A few hundred households" is the target size band; the exact count is an
  implementation choice as long as every FR-004 dimension is covered and the
  corpus stays diverse rather than cloned.
- Reproducing A2/A4 means making them **observable in an automated test**; the
  actual fixes are a separate feature (§9.4) and are explicitly out of scope here.
  Tests that pin the *current* (buggy) behavior may be written as
  expected-to-change locks so the later fix has a clear before/after.
- Multi-currency amounts are represented per the app's current accounting model
  (the decision to move to a native-currency ledger, §9.5, is out of scope); the
  corpus only needs to *carry* multiple currencies through the model, including the
  zero-decimal JPY case, to exercise currency handling.
- The seed/demo database target is a local or development Supabase instance; the
  harness must have a safe way to distinguish that from shared/production and
  refuse the latter.
- A later research-gated realism layer (§9.2) will supply believable
  distributions on top of this engine; this feature only guarantees the engine is
  shaped to accept them, not that realistic distributions exist yet.

## Out of Scope

- **Realistic / believable demo profiles (§9.2)** — plausible category mixes,
  amounts, and cadences informed by finance-habits research. This feature builds
  the engine and the edge-case corpus, not the realism layer.
- **The A2 and A4 fixes (§9.4)** — this feature makes the defects reproducible and
  observable; aligning the timezone regimes and unifying owner ordering are
  separate work.
- **Atomic split persistence (§9.3)** and the **multi-currency accounting decision
  (§9.5)** — independent tracks.
- **Scale/performance seeding** — thousands of near-identical households to test
  throughput is a later, separate concern (coverage over volume here).
- **Any end-user-facing UI** to browse, select, or manage the corpus.
