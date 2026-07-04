# Feature Specification: Transaction-Based Routine Detector (Prototype)

**Feature Branch**: `016-routine-detector`

**Created**: 2026-07-04

**Status**: Draft

**Input**: User description: "Prototype a transaction-based routine detector — the follow-up validation slice for the financial-routine findings doc (findings.md). Prove or disprove the doc's central bet, that `merchant + cadence` ALONE (no location, no permission, works on bank imports) surfaces recurring-spend routines that feel insightful, by running a real detector over the app's existing sample dataset."

## Context

`findings.md` (PR #5) recommends decoupling "routine" from "location": detect a
household's recurring spend from the **transaction stream first** — no location,
no permission, works on bank imports — and treat location as optional later
enrichment. It names **one thing to validate before anything else** (findings.md
§"The one thing to validate first"):

> Does `merchant + cadence` **alone** already surface routines that feel
> insightful (run a v1 detector over the sample dataset)? If yes, location
> becomes a "nice sharpening" rather than a dependency, and the whole feature
> de-risks.

This feature is that validation slice — a small, self-contained, read-only
detector that answers the question with real output, nothing more. It is a
**decision-support prototype**, not a shipped user feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Detect routines from transaction history alone (Priority: P1)

The product team needs to know whether recurring spend is legible from the
transaction stream on its own. Given a household's transaction history, the
detector groups spending by *what* recurs (a merchant, or a category when the
merchant varies) and *how often* it recurs (its cadence), and returns a ranked
list of detected **routines** — each with a plain-language label, a cadence
(e.g. "weekday mornings", "weekly", "monthly"), a typical amount, how many times
it occurred, and a confidence score. It uses only fields the app already stores;
it needs no location and no permission.

**Why this priority**: This is the entire bet. Without a working detector there
is nothing to judge. Everything else (running it over data, cost roll-up) depends
on this producing correct, ranked routines.

**Independent Test**: Feed the detector a fixture whose recurring patterns are
known in advance and assert it surfaces exactly those routines with the right
cadence, typical amount, and count — and that it does **not** invent routines
from one-off spend. Fully unit-testable, no UI, no network.

**Acceptance Scenarios**:

1. **Given** a history where a merchant appears on most weekday mornings for
   several weeks, **When** the detector runs, **Then** a routine for that merchant
   is returned with a "weekday" cadence, a morning time-bucket, an occurrence
   count matching the history, and a typical amount within a cent of the median.
2. **Given** a history where one category (e.g. groceries) recurs weekly across
   several *different* merchants, **When** the detector runs, **Then** a
   category-level routine with a "weekly" cadence is returned even though no
   single merchant repeats enough on its own.
3. **Given** a history where a merchant appears exactly once, **When** the
   detector runs, **Then** no routine is produced for it (a single occurrence is
   never a routine).
4. **Given** two runs over the identical history with the same reference date,
   **When** the detector runs twice, **Then** the two ranked outputs are
   identical (deterministic).
5. **Given** a history containing income and reimbursement transfers, **When**
   the detector runs, **Then** those rows are ignored and only spend is
   considered.

---

### User Story 2 - Validate the bet against sample data (Priority: P2)

A developer or PM wants to *see* what the detector finds on real-shaped data and
judge whether the routines feel insightful. They run a small harness that loads a
chosen dataset and prints the ranked routines in a legible form. Two datasets are
available: the app's existing sample dataset (sparse, few repeats — a control for
"does it stay quiet when there's little to find?") and a richer demonstration
dataset with genuine recurring patterns (the positive case).

**Why this priority**: The findings doc's question is answered by *looking at
output*, not by tests alone. This turns the P1 engine into a decision the team can
actually make.

**Independent Test**: Run the harness against each dataset and confirm it prints a
ranked routine list; confirm the sparse sample yields few/only-strong routines and
the rich sample yields the planted ones. Runnable from the command line with one
command.

**Acceptance Scenarios**:

1. **Given** the existing sample dataset, **When** the harness runs, **Then** it
   prints a ranked routine list dominated by the genuinely repeating spend (e.g.
   monthly rent, roughly-weekly groceries) and does not fabricate routines from
   one-off purchases.
2. **Given** the richer demonstration dataset, **When** the harness runs, **Then**
   it prints the planted routines (e.g. weekday coffee, weekday transit, weekly
   groceries, monthly subscription) each with a sensible cadence and typical
   amount.
3. **Given** either dataset, **When** the harness runs, **Then** the output is
   human-readable at a glance (label, cadence, typical amount, count, confidence)
   so a reviewer can judge "insightful or not" without reading code.

---

### User Story 3 - Roll up an estimated monthly routine cost (Priority: P3)

From the detected routines, the detector produces a single calm summary: the
estimated monthly cost of the household's routine spend (e.g. "your weekday
coffee + subway routine ≈ $220/mo"), by normalizing each routine's typical amount
to a monthly figure by its cadence and summing them.

**Why this priority**: It is the most concrete, brand-fitting payoff named in the
findings doc and the clearest demonstration of value — but it is a thin
aggregation on top of P1 and not needed to answer the core question.

**Independent Test**: Given a fixed set of detected routines with known cadences
and amounts, assert the monthly roll-up equals the hand-computed sum.

**Acceptance Scenarios**:

1. **Given** routines of mixed cadence (daily/weekday, weekly, monthly), **When**
   the roll-up runs, **Then** each is converted to a monthly-equivalent amount by
   its cadence and the total equals the expected sum.
2. **Given** no detected routines, **When** the roll-up runs, **Then** the monthly
   routine cost is zero and the summary states there are no routines yet (never an
   alarmist or error state).

---

### Edge Cases

- **Noon-pinned imports have no real hour**: statement/bank imports store the date
  at noon-UTC, so their hour-of-day is not meaningful. The detector must fall back
  to weekday-only (or date-only) cadence for those rows rather than asserting a
  false time-of-day bucket.
- **Merchant name variants**: the same real merchant can appear under slightly
  different strings (`DD/BR #3401` vs `Dunkin'`). Light normalization is applied;
  full normalization is out of scope and its limits are documented.
- **Short or empty history**: fewer transactions than the support threshold, or an
  empty list, yields an empty routine list — never an error.
- **Irregular spacing**: occurrences that repeat but at wildly uneven intervals
  should score lower confidence than evenly-spaced ones, and may fall below the
  threshold.
- **Window boundary**: only activity within the lookback window (last M weeks)
  counts toward support; older repeats do not inflate a routine's count.
- **Ties in ranking**: routines with equal rank keys are ordered by a stable,
  documented tiebreak so output is deterministic.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The detector MUST accept a list of the household's existing
  transactions and a reference "now" date, and return a ranked list of detected
  routines, using only fields the app already stores (merchant, category, kind,
  amount, date). It MUST NOT require any location, coordinate, or new permission.
- **FR-002**: The detector MUST consider only spend: income and reimbursement
  transfers MUST be excluded from routine detection.
- **FR-003**: The detector MUST group candidate routines both by **merchant** and,
  independently, by **category**, so that a routine is surfaced when a single
  merchant repeats *or* when a category repeats across varying merchants.
- **FR-004**: The detector MUST classify each candidate's **cadence** from the
  spacing of its occurrences — at minimum distinguishing daily/weekday, weekly,
  and monthly patterns — and MUST label it in plain language.
- **FR-005**: The detector MUST assign a **time-of-day bucket** (e.g. morning /
  midday / afternoon / evening) only when a transaction carries a real hour, and
  MUST fall back to a weekday/date-only cadence when the hour is absent
  (noon-pinned imports).
- **FR-006**: The detector MUST surface a routine only when its occurrence count
  meets a support threshold **N** over a lookback window of **M** weeks; anything
  below threshold MUST NOT appear.
- **FR-007**: **N**, **M**, and the hour-bucket boundaries MUST be tunable
  constants with sensible, documented defaults.
- **FR-008**: For each detected routine the detector MUST return: a
  human-readable label, its cadence, a typical amount in USD cents, the occurrence
  count, and a confidence score in a fixed range.
- **FR-009**: The confidence score MUST reflect both how much support a routine has
  and how regular its spacing is, so that frequent, evenly-spaced routines rank
  above sparse or erratic ones.
- **FR-010**: The output list MUST be ranked (most confident / highest-value
  first) with a deterministic, documented tiebreak, and the whole detector MUST be
  deterministic: identical input and reference date yield identical output.
- **FR-011**: The detector MUST roll detected routines up into a single estimated
  **monthly routine cost**, normalizing each routine's typical amount to a monthly
  figure by its cadence.
- **FR-012**: A runnable harness MUST be able to execute the detector against (a)
  the app's existing sample dataset and (b) a richer demonstration dataset with
  planted routines, and print the ranked routines legibly enough for a reviewer to
  judge whether they feel insightful.
- **FR-013**: The detector and its supporting math MUST be covered by deterministic
  tests (injected reference date, fixture data, no network) per the project's
  test-driven constitution.
- **FR-014**: The feature MUST be additive and read-only: no schema change, no new
  stored field, no modification to the existing vector-locked insight engine or its
  golden vectors, and no change to iOS. It sits **outside** the golden-vector parity
  harness.

### Key Entities *(include if feature involves data)*

- **Transaction (existing, read-only input)**: the app's current transaction —
  merchant, category, kind (expense/income/transfer), amount in USD cents, and a
  date. The detector reads these and stores nothing new on them.
- **Routine (new, in-memory output)**: a detected recurring-spend pattern —
  identity (a merchant or a category), cadence, optional time-of-day bucket,
  typical amount (USD cents), occurrence count, and confidence. Purely a computed
  result; never persisted.
- **Routine Report (new, in-memory output)**: the ranked list of routines plus the
  estimated monthly routine cost and the parameters (N, M, window) used to produce
  it, so a reviewer sees under what settings the result held.
- **Demonstration dataset (new, fixture)**: a richer sample of transactions
  containing known, planted routines, used to prove the detector finds what it
  should; distinct from the app's existing sparse sample dataset used as a control.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Run over a dataset with planted recurring patterns, the detector
  surfaces **100% of the planted routines** and assigns each the correct cadence
  class.
- **SC-002**: Run over a dataset of purely one-off spend, the detector surfaces
  **zero** routines (no false positives from non-repeating purchases).
- **SC-003**: The detector is **fully deterministic**: repeated runs over the same
  input and reference date produce identical ranked output, verified by test.
- **SC-004**: A reviewer can run one command to see the ranked routines for either
  the existing sample dataset or the demonstration dataset, and from that output
  alone reach a **go / no-go** decision on the findings-doc bet — i.e. the output
  is legible enough to judge "insightful or not" without reading the code.
- **SC-005**: The detector returns results **instantly** (well under a second) for
  at least a year of a two-person household's transaction history.
- **SC-006**: The full test suite stays green and the change introduces **no
  modification** to existing insight output, golden vectors, or iOS — confirming
  the prototype is purely additive.

## Assumptions

- **Sample-data reality**: The app's existing sample dataset (spec 015 seed, ~16
  rows over ~3 months) is intentionally sparse and mostly one-offs, so it is used
  as the "stays quiet" control. To demonstrate the positive case, a **richer
  demonstration dataset with planted routines** is added as a fixture. This is the
  load-bearing assumption; if the team would rather validate only against a larger
  export of real data, that can replace the synthetic demo fixture later.
- **Surface**: The prototype is built in the web/TypeScript codebase only, because
  that is the surface that can be built and run in the current (Linux) environment;
  an iOS/Swift mirror and promotion into the vectored insight engine are explicitly
  out of scope and deferred.
- **Hour availability**: A transaction's hour is treated as "unknown" when it is
  the noon-UTC import sentinel; a genuine noon purchase is rare and the only cost of
  the heuristic is falling back to weekday-only bucketing for it.
- **Merchant normalization**: Only light normalization (case, whitespace, trailing
  store-number/punctuation trimming) is applied; robust merchant canonicalization is
  a known limitation documented, not solved, here.
- **Default thresholds**: Sensible starting defaults (e.g. minimum support N and a
  lookback of M weeks) are chosen and documented; they are tunable and expected to
  be adjusted once the team sees output.
- **Not a shipped UI**: There is no end-user screen in this slice; output is
  consumed via tests and a developer harness. Any household-facing surfacing of
  routines is a later feature.
- **Privacy/household scope**: Because there is no location and nothing new is
  stored, the per-person privacy questions raised in findings.md do not arise for
  this prototype; they are deferred with the location work.

## Out of Scope

- Any use of location, coordinates, dwell/visit detection, or geocoding.
- Schema changes, new stored fields (`occurred_at`, `location`), or migrations.
- Changes to the existing vector-locked insight engine, its golden vectors, or any
  iOS/Swift code.
- Machine learning or clustering — this is frequency/counting statistics only.
- An end-user UI for routines, notifications, or prompts.
- Merchant canonicalization beyond light normalization; dwell-to-charge matching.

## Dependencies

- The existing `Transaction` shape and the existing sample/seed dataset in the web
  codebase.
- The project's existing test runner and the constitution's test-driven, pure-`lib`
  conventions.
