# Feature Specification: Financial Routines

**Feature Branch**: `[044-financial-routines]`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "Add a financial-routine feature that learns a user's recurring spend
patterns and habits over time — e.g. eating at the same time/day each day (a lunch/dinner routine),
or paying for the same service around the same time each month (a subscription that can be
automated). The system should pick up trends and habits, turn recurring payments into a recognized
system, and combine that understanding with the existing financial-health system so the app builds
a deep, ongoing picture of the user over time. Grounded in the prior decision record
(github.com/Ayaz2589/Ortho/pull/5, `findings.md`): detect routines from the transaction stream
first (merchant/category + cadence + time-bucket, no permission required, works on every
transaction including bank imports), then layer an optional location booster on top (merchant-name
geocoding by default; opt-in passive dwell detection as a later upgrade). Financial-health
integration (spec 041) is in scope for v1, not deferred."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recognize recurring charges as routines (Priority: P1) 🎯 MVP

A user has been logging or importing transactions for a while — a streaming subscription, a gym
membership, a phone bill — each charged to roughly the same merchant, roughly the same amount,
roughly every month. The app notices this pattern on its own and surfaces it as a **recognized
routine**, without the user having to do anything or grant any new permission. The user can see a
short list of "things that repeat" — what they are, how often, and how much — and can confirm,
rename, or dismiss each one.

**Why this priority**: This is the highest-value, lowest-risk slice — it needs no new data
(location, time-of-day), works retroactively on existing transaction history including bank
imports, and immediately turns "recurring payments" into a system the user can see and trust. It
is also the foundation every later story builds on.

**Independent Test**: Seed a transaction history containing a charge to the same payee for
approximately the same amount on a roughly monthly cadence (e.g. 3+ consecutive months), alongside
ordinary one-off transactions. Confirm the recurring charge is surfaced as a recognized routine and
the one-off transactions are not. Can be fully tested with transaction data alone — no location, no
time-of-day, no new permissions.

**Acceptance Scenarios**:

1. **Given** a household with 3+ months of a same-merchant, same-amount (±small tolerance) monthly
   charge, **When** the user views their routines, **Then** that charge appears as a recognized
   routine with its cadence and typical amount shown.
2. **Given** a household with only one or two occurrences of a repeating-looking charge, **When**
   the user views their routines, **Then** it does not yet appear as a recognized routine (not
   enough evidence).
3. **Given** a recognized routine, **When** the user dismisses it, **Then** it stops being surfaced
   and is not re-suggested from the same evidence.
4. **Given** a recognized routine whose underlying charge stops appearing for several expected
   cycles (e.g. a cancelled subscription), **When** the user views their routines, **Then** the
   routine is marked as lapsed/inactive rather than continuing to be shown as active.

---

### User Story 2 - Recognize behavioral spending routines (Priority: P2)

Beyond fixed-amount subscriptions, a user tends to spend at the same kind of place around the same
time of day or day of week — coffee most weekday mornings, lunch out most workdays, a Sunday
grocery run — even though the amount varies each time. The app notices these looser, higher-frequency
patterns too, and shows them alongside the fixed-amount routines from Story 1, distinguished as
"habits" rather than "recurring charges."

**Why this priority**: This is the broader "understand the user's habits" half of the ask and is
where the qualitative, human insight ("you have a coffee routine") lives — but it is a strict
enhancement over Story 1's engine (same detection approach, looser matching) and depends on it, so
it is sequenced second.

**Independent Test**: Seed transactions at a consistent merchant-or-category + weekday + time-of-day
combination across several weeks, with the amount varying each time, alongside unrelated variable
spending. Confirm the pattern is surfaced as a habit-style routine distinct from the fixed-amount
routines of Story 1, using only transactions that carry a real time (manual/receipt entries) — no
location data required.

**Acceptance Scenarios**:

1. **Given** a household with several weeks of similarly-timed spend at the same merchant or
   category on the same weekday(s), with the amount varying, **When** the user views their
   routines, **Then** it is surfaced as a habit/behavioral routine (not a fixed-amount charge).
2. **Given** transactions with no recorded time of day (e.g. bank-import rows), **When** the system
   evaluates behavioral routines, **Then** those transactions are excluded from time-of-day pattern
   matching but still eligible for Story 1's merchant+cadence detection.
3. **Given** a household with genuinely irregular spending at a given merchant/category, **When**
   the user views their routines, **Then** no behavioral routine is surfaced for it.

---

### User Story 3 - Routines inform the financial-health picture (Priority: P3)

A user who has recognized routines sees them reflected in their existing financial-health score and
breakdown, not as a separate, disconnected feature. Recognized routines feed a new, dedicated
**routine awareness** dimension — alongside the existing cash-flow, safety-net, commitment-load,
savings-momentum, and plan-engagement dimensions — that reflects how much of the household's
spending is understood and predictable vs. not. The health picture gets more specific as more
routines are learned, without the user re-entering anything, and the user can weight this new
dimension's importance the same way they already weight the other five.

**Why this priority**: This is the "deep, ongoing understanding of the user" payoff the feature
exists for, but it is only meaningful once routines are actually being recognized (Stories 1–2), so
it is sequenced after them.

**Independent Test**: Compare the financial-health breakdown for two otherwise-identical households,
one with recognized routines present and one without. Confirm the breakdown for the household with
routines cites specific recognized routines as contributing to its result, and that removing/
dismissing a routine changes the corresponding part of the breakdown.

**Acceptance Scenarios**:

1. **Given** a household with recognized recurring-charge routines, **When** the user views their
   financial-health breakdown, **Then** the routine awareness dimension reflects those recognized
   routines specifically (not just raw transaction totals), citing which routines contributed.
2. **Given** a household with no recognized routines yet (new user, insufficient history), **When**
   the user views their financial-health breakdown, **Then** the other five dimensions behave
   exactly as they do today (no regression) and the routine awareness dimension shows a calm
   "not enough history yet" state rather than a misleadingly low score.
3. **Given** a user dismisses a recognized routine as incorrect, **When** the financial-health
   breakdown is next viewed, **Then** the routine awareness dimension no longer factors in that
   dismissed routine.
4. **Given** a user has set a low importance weight on the routine awareness dimension, **When**
   their overall health score is computed, **Then** that dimension contributes proportionally less
   to the overall score, consistent with how weighting already works for the other five dimensions.

---

### User Story 4 - Optional location-boosted routine detection (Priority: P4)

A user who opts in gets sharper routine detection: the app can tell apart two merchants with the
same name in different neighborhoods, and — for the boldest version of this — can notice the user is
in the habit of visiting a place on a schedule even before a matching transaction has been logged,
gently suggesting it might be worth logging. This is entirely additive: a user who never opts in
gets full value from Stories 1–3 with no reduced functionality.

**Why this priority**: Location sharpens and extends routine detection but is not required for the
feature to be useful or trustworthy, carries the highest privacy cost of anything in this feature,
and — per the grounding decision record — needs the most implementation-feasibility validation
against the app's actual current platform. It ships last, and only as much of it as proves feasible.

**Independent Test**: With location assistance opted in, seed a location signal for a place visited
on a repeating schedule with no matching logged transaction yet. Confirm the app can surface it as a
candidate routine worth reviewing. With location assistance off (the default), confirm routine
detection behaves identically to Stories 1–3 with zero location-related prompts, storage, or
behavior.

**Acceptance Scenarios**:

1. **Given** a user has not opted in to location assistance, **When** they use any part of the
   routines feature, **Then** no location permission is requested and no location data is
   collected.
2. **Given** a user opts in to location assistance, **When** the app geocodes a merchant name it
   already has from a transaction, **Then** no additional device permission is required for that
   baseline enrichment.
3. **Given** a user has opted in to the deeper, passive location upgrade and a qualifying repeating
   visit pattern is observed, **When** the pattern meets the confidence bar, **Then** the user is
   shown a low-friction, dismissible suggestion — never an automatically-created transaction or
   silent ledger change.
4. **Given** a user revokes location permission after opting in, **When** they return to the app,
   **Then** location-derived signals stop being collected and previously-surfaced location-only
   routine suggestions are removed, with all other routine detection continuing unaffected.

---

### Edge Cases

- New household / insufficient history: routines must not be fabricated from too little evidence;
  the feature should show a calm "not enough history yet" state rather than false positives.
- Merchant-name variance (chain locations, point-of-sale code suffixes, slightly different strings
  for the same biller) must not each be treated as a distinct, separately-tracked merchant when a
  reasonable match exists.
- A one-time large or seasonal purchase at a merchant the user also visits routinely (e.g. a big
  one-off purchase at a grocery store they shop at weekly) must not distort or be absorbed into that
  merchant's routine.
- Shared/split household transactions: a routine tied to a split transaction must attribute
  correctly to the household vs. the individual member(s) who actually incurred it.
- A recognized routine's underlying pattern breaks (subscription price changes, cadence shifts,
  cancellation) — the system must adapt or retire the routine rather than keep asserting a stale
  pattern indefinitely.
- Large one-time historical backfills (e.g. a bank import of a year of history in one batch) must be
  handled by the detection window the same as transactions arriving gradually over time — a bulk
  load should not silently skip or double-count routine evidence.
- A user dismisses a routine that later recurs again: the system must not immediately re-surface the
  identical dismissed suggestion from the same evidence.
- A user manually overrides an auto-applied category on a transaction that was matched to a
  confirmed routine: the system must treat that as a signal to review the match (e.g. lower
  confidence, prompt re-confirmation), not silently reapply the same category again next time.
- A routine derived from a shared/split transaction crosses household-vs-personal visibility: the
  visibility rule (FR-016) must resolve unambiguously which member(s) — or the whole household —
  can see it, with no state where a routine is visible to no one or produces conflicting visibility
  for different members.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST detect recurring fixed-amount charges (candidate subscriptions/bills)
  from transaction history alone — merchant/payee, approximate amount, and cadence — with no
  location or time-of-day data required.
- **FR-002**: System MUST require a minimum number of consistent occurrences before surfacing a
  recurring-charge routine, so that one or two coincidentally similar transactions are not
  misidentified.
- **FR-003**: System MUST detect looser, higher-frequency behavioral routines (same merchant/
  category around a consistent weekday and/or time-of-day, amount varying) using only transactions
  that carry a real time of day, and MUST exclude transactions without a real time (e.g. bank-import
  rows) from time-of-day-based matching while still allowing them to contribute to FR-001.
- **FR-004**: System MUST let a user view their recognized routines (both recurring charges and
  behavioral habits) in one place, showing what was recognized, how often, and roughly how much.
- **FR-005**: System MUST let a user confirm, rename, or dismiss a recognized routine, and MUST NOT
  re-surface an identical dismissed suggestion from the same underlying evidence.
- **FR-006**: System MUST re-evaluate recognized routines on an ongoing basis as new transactions
  arrive, retiring/marking-lapsed a routine whose pattern stops recurring for a reasonable number of
  expected cycles, and updating a routine (e.g. amount or cadence drift) rather than treating a
  drifted pattern as an entirely new, unrelated one.
- **FR-007**: System MUST normalize/deduplicate near-identical merchant name variants (e.g.
  point-of-sale suffixes, chain-location differences) so they are not tracked as unrelated
  merchants for routine purposes.
- **FR-008**: System MUST correctly attribute routines derived from shared/split household
  transactions to the appropriate household and/or member scope, consistent with how the app already
  scopes shared vs. personal spending.
- **FR-009**: System MUST score recognized routines through a new, dedicated "routine awareness"
  financial-health dimension — in addition to the existing cash-flow, safety-net, commitment-load,
  savings-momentum, and plan-engagement dimensions — reflecting how much of the household's spending
  is recognized/predictable routine vs. not, and the breakdown's presentation MUST be able to cite
  the specific recognized routine(s) contributing to that dimension's score.
- **FR-010**: System MUST let users set an importance weight for the routine awareness dimension,
  consistent with how importance is already set for the existing five dimensions, and MUST behave
  exactly as it does today for the existing five dimensions when a household has no recognized
  routines (no regressions), showing a neutral, non-penalizing state for the new dimension instead.
- **FR-011**: System MUST NOT collect, request, or use any location data unless the user has
  explicitly opted in; with location assistance off, all routine detection and financial-health
  integration MUST function fully via FR-001–FR-010 alone.
- **FR-012**: System MUST offer merchant-name-based location enrichment (deriving a place from a
  merchant name already present on a transaction) as the opt-in baseline, requiring no device
  location permission.
- **FR-013**: System MUST treat any deeper, passive/background location-based routine detection as
  a separate, higher-friction opt-in beyond the baseline in FR-012, gated behind an explicit,
  plain-language explanation of what will be collected and why.
- **FR-014**: System MUST NOT automatically create or modify a transaction from a location-only
  signal — a location-derived routine candidate MUST always be presented to the user as a dismissible
  suggestion, never a silent ledger change.
- **FR-015**: System MUST stop collecting location-derived signals and remove previously-surfaced
  location-only suggestions immediately if the user revokes location permission or opts out, without
  affecting non-location routine detection.

- **FR-016**: System MUST scope visibility of a recognized routine to match the visibility of the
  transactions it was derived from: a routine derived from shared household transactions MUST be
  visible to the household, and a routine derived from personal-scope transactions MUST be private
  to the member it belongs to — mirroring the app's existing shared-vs-personal transaction
  visibility rather than introducing a new visibility model.
- **FR-017**: System MUST support bounded automation for a routine the user has explicitly
  confirmed (not merely recognized-but-unreviewed): the system MAY auto-apply the routine's
  recognized category/tag to a future transaction that matches it (same merchant/payee and
  approximate amount) at the time that transaction is entered or imported. System MUST NOT create,
  delete, or change the amount of a transaction from a routine alone — auto-categorization only
  applies to a transaction the user or the import pipeline is already creating, and the user MUST be
  able to see and override any auto-applied categorization.
- **FR-018**: System MUST represent the financial-health integration from Story 3 as a new,
  dedicated "routine awareness" dimension (see FR-009/FR-010) rather than only enriching the inputs
  of the existing five dimensions.

### Key Entities *(include if feature involves data)*

- **Recognized Routine**: A detected recurring pattern — either a fixed-amount recurring charge
  (subscription/bill-style) or a behavioral habit (variable-amount, time-pattern-based). Has a kind,
  the merchant/category it's tied to, its cadence, a typical/representative amount or amount range,
  a confidence/evidence level, a status (recognized, confirmed, lapsed, dismissed), and a visibility
  scope (household or a specific member) inherited from the transactions it was derived from
  (FR-016). Only a **confirmed** routine is eligible for bounded automation (FR-017).
- **Routine Evidence / Occurrence**: The individual transactions (and, if location assistance is on,
  location visits) that support a Recognized Routine — used to compute confidence, detect drift, and
  explain "why this was suggested" to the user.
- **Location Consent**: A per-user record of whether location-based enrichment is off, on at the
  merchant-geocoding baseline, or on at the deeper passive-detection level, plus when/how consent was
  given so it can be revoked.
- **Financial-Health Contribution**: The link between a Recognized Routine and the routine awareness
  dimension of the financial-health breakdown it informs, so the breakdown can cite specific
  routines.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A household with at least three months of transaction history containing a genuine
  recurring charge sees it surfaced as a recognized routine without any manual setup.
- **SC-002**: Fewer than 1 in 10 recognized routines shown to users are dismissed as incorrect,
  once a household has enough history for the feature to be active (a proxy for detection quality).
- **SC-003**: Users can review, confirm, rename, or dismiss any recognized routine in under 30
  seconds per routine.
- **SC-004**: A household with recognized routines can identify, without leaving the
  financial-health view, which specific routines are shaping their score — not just an unexplained
  number.
- **SC-005**: A user who never opts in to location assistance experiences zero functional
  difference in routine detection quality for their logged/imported transaction history compared to
  a user who has opted in, aside from the additive location-only suggestions.
- **SC-006**: A user who opts in to the deepest level of location assistance and later opts out sees
  all location-derived data and suggestions gone from their account within one app session.
- **SC-007**: Households with recognized routines show a routine awareness score in their
  financial-health breakdown that measurably changes as routines are confirmed, dismissed, or
  lapse — not a static or placeholder value.
- **SC-008**: A user who confirms a recurring-charge routine sees the next matching transaction
  arrive already categorized, without manually re-tagging it.

## Assumptions

- Ortho's canonical implementation is the web app (Next.js) wrapped via Capacitor for iOS (spec
  021); the frozen native SwiftUI app (`iOS/`) receives no new work. The prior decision record this
  feature is grounded in (github.com/Ayaz2589/Ortho/pull/5) was written assuming the frozen native
  app's location APIs. **Whether, and how much of, Story 4's deeper passive/background location
  detection is technically achievable on the current Capacitor/web architecture is unconfirmed and
  must be validated as a technical spike during planning.** If background dwell detection proves
  infeasible on this architecture, Story 4 is expected to reduce to the merchant-geocoding baseline
  (FR-012) only, with passive dwell detection (FR-013) either descoped or replaced with an
  explicit, user-initiated "I'm here now" style capture — this does not affect Stories 1–3.
  [[financial-health]]
- Recognized routines are surfaced calmly, consistent with the app's existing brand (no red, no
  urgent-feeling push notifications) — matching how the existing `InsightEngine` surfaces findings
  today.
- Following the grounding decision record's recommendation, routine detection is expected to start
  as fast-iterating frequency/statistics-based logic (not machine learning), and to live outside the
  existing vector-locked `InsightEngine` regression harness initially, graduating into it only once
  the detection math has stabilized against real data — an implementation sequencing detail for the
  planning phase, not a constraint on this spec's requirements.
- A transaction's true time-of-day is only available for sources that carry one today (manual entry,
  receipt scan); bank/statement imports carry a placeholder date with no reliable time, which is why
  FR-003 explicitly excludes them from time-of-day-based (but not cadence-based) matching.
- Minimum-evidence thresholds (how many occurrences, over how long, before a routine is "recognized")
  are a tuning detail to be finalized during planning against real transaction data, not a
  user-facing scope decision. "Recognized" (system-detected) and "confirmed" (user-approved) are
  distinct states — only the latter unlocks bounded automation (FR-017).
- Adding a sixth financial-health dimension (FR-009/FR-010/FR-018) is a structural change to the
  spec 041 engine, not just a new insight surface — it touches the dimension enum, the per-dimension
  weighting UI, band/score computation, and the vector-locked regression harness for financial
  health. Planning should treat this as its own significant slice of work, sequenced after the
  routine-detection engine (Stories 1–2) produces real data to score against.
- A recognized routine's visibility (FR-016) needs its own access-control scoping distinct from —
  but consistent with — however shared vs. personal transactions are scoped today; this is a
  planning-phase data-model detail, not a new visibility model at the spec level.
