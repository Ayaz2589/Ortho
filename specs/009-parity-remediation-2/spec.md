# Feature Specification: Cross-Platform Parity Remediation, Part 2

**Feature Branch**: `009-parity-remediation-2`

**Created**: 2026-06-17

**Status**: Draft

**Input**: User description: "Close the verified web↔iOS divergences found in the post-008 parity re-audit (`specs/008-parity-remediation/parity-reaudit.md`): silent money-correctness divergences (owner-ordering leftover cent, currency-conversion rounding, non-atomic share writes), web money locale + zero-fraction currency, pure-logic reconciliations (subscription average, mortgage months-elapsed, outlier insight vector), and the desktop-web capability tail (budget widget, lease banner). Vector-first; cosmetic tail out of scope."

## Overview

A re-audit after Spec 008 confirmed both clients' automated suites are green (web 430/430,
iOS 6/6) and the four 008 clusters are substantially closed. It also surfaced ~10 remaining
divergences — most importantly a set of **silent money-correctness** differences that the
shared golden vectors do not currently catch, plus the **money/locale** weak spot (~62% parity)
and the **desktop-web capability tail** that 008 cluster-4 did not fully close.

This feature reconciles existing behavior; it is not a new surface or a redesign. The four
destinations (Dashboard, Transactions, Housing, Settings) and iOS information density are
preserved. iOS is the canonical client; where a pure function diverges, web conforms to iOS
unless iOS's behavior is itself demonstrably wrong (the mortgage months-elapsed case), in which
both clients move to the correct result. Every pure-logic reconciliation is **vector-first**:
a shared golden vector asserted by BOTH suites is added with (or before) the fix, per
Constitution Principle VI. The ~25 cosmetic / 9 low-severity audit differences are explicitly
**out of scope** (a separate polish pass).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The same transaction shows the same money on both clients (Priority: P1)

A household enters a transaction with money, a split, and/or a foreign-currency display setting
on one client, then opens it on the other. The per-person amounts, the leftover cent's owner,
and the converted display amount are identical to the cent — and a transaction is never left
half-written with its shares missing.

**Why this priority**: These are *silent* data-correctness divergences — the user is told nothing
is wrong, yet the two clients can attribute the leftover cent to a different person, store a
different USD-cents value for the same foreign amount, or (on web) leave a transaction persisted
without its owner shares so it rehydrates as "creator owns all." Numbers the two clients disagree
about erode trust in every figure the app shows, and today's golden vectors do not catch any of
these because they feed pre-ordered inputs and never exercise currency conversion.

**Independent Test**: Construct a multi-owner split at an odd amount where the owners' natural
entry order differs from their canonical order, on each client → the leftover cent lands on the
same person. Set a foreign display currency with a non-1.0 rate that triggers a half-cent tie →
both clients show the same converted amount. Simulate a shares-write failure on web → the parent
transaction is not left orphaned (matches iOS's all-or-nothing behavior).

**Acceptance Scenarios**:

1. **Given** a transaction split among ≥2 owners at an amount that does not divide evenly,
   **When** the per-owner shares are computed on web and on iOS for the same owner set,
   **Then** each owner's cents are identical, the leftover cent is assigned to the same owner,
   and the shares sum exactly to the total — regardless of the order owners were entered in.
2. **Given** a foreign display currency and an FX rate that produces a half-cent rounding tie,
   **When** an amount is converted to USD cents on entry and back to the display amount at render,
   **Then** web and iOS produce the same stored cents and the same displayed amount across all
   supported display currencies.
3. **Given** a transaction is being saved with its owner shares, **When** writing the shares fails,
   **Then** the transaction is not left persisted without shares on either client (the write is
   all-or-nothing, or is repaired), so it never rehydrates as a single-owner "creator owns all."

---

### User Story 2 - Money reads correctly in the chosen language and currency on web (Priority: P2)

A person sets the app to a non-English language and/or a zero-decimal currency on the web app.
Money re-formats for that locale (grouping, symbol placement, decimal separator) the way numbers
and dates already do, and zero-decimal currencies show the correct magnitude — matching iOS.

**Why this priority**: A visible, not silent, divergence: web localizes dates and numbers but
formats every money value as en-US, and renders zero-fraction currencies (e.g. JPY) ~100× too
large because it skips the cents division. This is the true completion of the 008 language work
(FR-017) and removes the last in-scope behavioral mismatch with iOS's app-wide locale.

**Independent Test**: On web, switch language to one with a different number format → all money
re-renders in that locale (symbol, grouping, decimals) and persists across reload. Set display
currency to a zero-decimal currency → amounts show the correct magnitude, matching iOS.

**Acceptance Scenarios**:

1. **Given** a non-English language is selected on web, **When** any monetary value is displayed,
   **Then** it is formatted for that locale (matching how dates/numbers already localize and
   matching iOS), and the choice persists across reloads.
2. **Given** a zero-decimal display currency, **When** a stored USD-cents amount is shown on web,
   **Then** the magnitude is correct (the cents→units conversion is applied) and matches iOS.

---

### User Story 3 - Insight and mortgage figures match to the cent (Priority: P2)

A household sees the same recurring-subscription cost estimate, the same outlier-spending alert,
and the same mortgage balance/equity on both clients for the same data.

**Why this priority**: Derived numbers silently differ — the recurring-subscription average uses
different rounding (web rounds, iOS truncates), the mortgage months-elapsed count is off by one
for loans closed late in a long month, and the outlier insight rule fires with no golden-vector
coverage on either client (the known FR-014 residual, 7 of 8 rules covered). Each is a pure
function that must be locked by a shared vector so it cannot drift again.

**Independent Test**: For a merchant whose monthly total doesn't divide evenly, the recurring
estimate matches on both clients. For a loan closed on the 31st viewed early in a 30-day month,
the months-elapsed (and thus balance/equity) match. A fixture with ≥5 same-category trailing
transactions triggers the outlier insight identically on both clients and is asserted by a vector.

**Acceptance Scenarios**:

1. **Given** a recurring merchant whose per-occurrence total does not divide evenly across
   occurrences, **When** the recurring-spend insight is generated, **Then** the estimated magnitude
   is identical on web and iOS and is locked by a golden vector.
2. **Given** a mortgage closed on a day-of-month that exceeds a later reference month's length,
   **When** months-elapsed (and the resulting current balance and equity) are computed, **Then**
   web and iOS produce the same elapsed-month count and the same balance/equity, locked by a vector
   covering the day-29–31 boundary.
3. **Given** an account with ≥5 trailing same-category transactions and a current-month expense
   well above the category norm, **When** insights are generated, **Then** both clients emit the
   same outlier insight with the same stable id and payload, and a golden vector asserts it.

---

### User Story 4 - The wide/desktop web view keeps every widget the phone shows (Priority: P3)

A person using the web app on a large screen sees the same dashboard widgets and the same housing
information as on the phone web view and on iOS — nothing is dropped just because the window is wide.

**Why this priority**: 008 cluster-4 tail. On wide screens the web app omits the Budget Progress
widget from the dashboard and the lease-renewal banner from housing, both present on iOS and the
phone web view. Desktop is meant to be more room to breathe, never less capability.

**Independent Test**: On a ≥1024px web window with budgets set, open the dashboard → the Budget
Progress widget is present (matching the phone view and iOS). Open a property whose lease renews
soon → the lease-renewal banner is shown (matching the phone view and iOS).

**Acceptance Scenarios**:

1. **Given** budgets are set, **When** the dashboard is viewed on a ≥1024px web window, **Then**
   the Budget Progress widget appears in the same position relative to the other widgets as on the
   phone web view and iOS.
2. **Given** a property whose lease is within its renewal window, **When** its housing detail is
   viewed on a ≥1024px web window, **Then** the lease-renewal banner is shown, matching the phone
   web view and iOS.

---

### User Story 5 - Sign-in copy and the test command behave as documented (Priority: P3)

A new person on web reads how long the email code is before it arrives, and a developer can run
the web test suite with the project's default Node without a startup error.

**Why this priority**: Lowest user impact — one copy line and developer/CI hygiene — but cheap to
fold in and they close the last FR-005 residual and a real "tests won't start" gotcha (the suite
only passed under a hand-selected Node version).

**Independent Test**: Read the web sign-in screen → it states the 8-digit code length, matching
iOS. Run the web test command under the repository's pinned/default Node → it starts and passes
without a module-loading error.

**Acceptance Scenarios**:

1. **Given** the web sign-in screen, **When** a person is about to request a code, **Then** the
   on-screen copy states that the code is 8 digits, matching iOS.
2. **Given** a clean checkout, **When** a developer runs the web test command with the repository's
   default/pinned runtime, **Then** the suite starts and runs to completion without a runtime/module
   load error.

### Edge Cases

- **Owners whose entry order differs from canonical order** at an odd amount → leftover cent lands
  on the same owner on both clients; sums still reconcile exactly.
- **A single-owner transaction** → full attribution, no leftover-cent logic engaged, identical on both.
- **A half-cent rounding tie during currency conversion** (e.g. amount × rate ends in .5) → both
  clients resolve the tie the same way; round-trip (to-USD-cents then to-display) is stable.
- **A zero-decimal display currency with a non-1.0 FX rate** → correct magnitude and identical on both.
- **A shares-write failure mid-save on web** (e.g. RLS denial) → no orphaned share-less parent remains.
- **A mortgage closed on the 31st, viewed in a 30-day reference month** → elapsed-months matches; no
  off-by-one balance/equity drift.
- **An outlier fixture with exactly 5 trailing same-category transactions** (the rule's minimum) →
  rule fires identically and is vectored.
- **Language set to "System"** → money follows the device/browser locale on both clients (no regression).
- **A wide window with no budgets set** → the Budget Progress widget self-hides on desktop exactly as
  it does on the phone view (presence parity does not mean always-visible).

## Requirements *(mandatory)*

### Functional Requirements

**Silent money-correctness (Story 1)**

- **FR-001**: For any split across ≥2 owners, both clients MUST assign per-owner cents identically
  and place the deterministic leftover cent on the same owner, using a single canonical owner
  ordering that does not depend on the order owners were entered or stored in.
- **FR-002**: Currency conversion MUST produce identical results on both clients: converting an
  entered foreign amount to stored USD cents, and converting stored USD cents to a display amount,
  MUST yield the same value on web and iOS for every supported display currency, including
  half-cent rounding ties.
- **FR-003**: Saving a transaction together with its owner shares MUST be all-or-nothing (or
  self-repairing) on both clients, so a partial failure never leaves a persisted transaction whose
  shares are missing and that therefore reads as a single-owner "creator owns all."

**Money & locale on web (Story 2)**

- **FR-004**: Monetary values on web MUST be formatted using the user-selected locale (symbol,
  grouping, decimal separator), consistent with how dates and numbers already localize and matching
  iOS's app-wide locale behavior; the selection MUST persist across reloads.
- **FR-005**: Zero-decimal display currencies MUST render at the correct magnitude on web (the
  stored-USD-cents conversion is applied), matching iOS and preserving the cents storage invariant.

**Pure-logic reconciliations (Story 3)**

- **FR-006**: The recurring-spend insight's estimated magnitude MUST be computed identically on both
  clients (same rounding) and be locked by a shared golden vector.
- **FR-007**: The mortgage months-elapsed computation MUST be correct and identical on both clients
  for closing days that exceed a later reference month's length, with the resulting balance and
  equity matching, locked by a shared golden vector covering the day-29–31 boundary.
- **FR-008**: The outlier-transaction insight rule MUST be covered by a shared golden vector that
  triggers it, and both clients MUST emit the same insight (stable id + payload) for that fixture,
  bringing golden-vector coverage to every insight rule.

**Desktop web capability (Story 4)**

- **FR-009**: The wide/desktop web dashboard MUST render the Budget Progress widget when budgets are
  set, in parity with the phone web view and iOS (self-hiding when no budgets exist).
- **FR-010**: The wide/desktop web housing view MUST show the lease-renewal banner for a property in
  its renewal window, in parity with the phone web view and iOS.

**Follow-ons (Story 5)**

- **FR-011**: The web sign-in copy MUST state the actual code length (8 digits), matching iOS.
- **FR-012**: The web test suite MUST start and run to completion under the repository's default/pinned
  runtime without a module-loading/startup error.

**Cross-cutting**

- **FR-013**: Every change to a pure function or a stored data representation in this feature MUST be
  implemented identically on both clients and locked by a shared golden vector asserted by BOTH the
  web and iOS suites (Constitution Principle VI). A deliberate divergence introduced into any newly
  vectored function MUST fail both suites.
- **FR-014**: No change in this feature may alter the existing category/source/kind taxonomy, the four
  destinations, or the existing mobile/iOS information density; behavior is reconciled, not redesigned.

### Key Entities *(include if data involved)*

- **Owner share allocation**: the authoritative per-owner cents for a transaction, which must sum to
  the exact total and round-trip losslessly; the leftover cent's placement depends on a single
  canonical owner ordering shared by both clients.
- **Currency conversion**: the pair of pure transforms between stored USD cents and a foreign display
  amount at a given FX rate; must be deterministic, rounding-stable, and identical across clients and
  all supported currencies.
- **Transaction + shares write**: the combined persistence of a transaction and its owner shares;
  must be atomic/repairing so neither half can exist without the other.
- **Golden vector**: a shared input/expected-output fixture asserted by both suites; this feature adds
  vectors for owner-ordering leftover cent, currency conversion, recurring-spend rounding, mortgage
  months-elapsed boundary, and the outlier insight rule.
- **Insight (outlier, recurring)**: generated spending observations whose magnitudes and stable ids are
  a cross-client contract.
- **Mortgage schedule**: the amortization-derived current balance and equity, sensitive to the
  elapsed-month count from closing date to reference date.
- **Desktop layout parity**: the wide-screen web composition must include the same capability widgets
  (Budget Progress, lease-renewal banner) as the phone/iOS surface.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a split transaction entered on either client, the per-owner amounts (and which person
  holds the leftover cent) read on the other client match to the cent in 100% of cases, independent of
  owner entry order.
- **SC-002**: For every supported display currency and FX rate, the stored USD cents and the displayed
  amount are identical on web and iOS in 100% of cases, including rounding ties.
- **SC-003**: A partial transaction-save failure leaves zero orphaned share-less transactions on either
  client (no "creator owns all" rehydration) in 100% of simulated-failure cases.
- **SC-004**: On web, switching language re-formats 100% of displayed money values to the selected
  locale, and zero-decimal currencies show the correct magnitude — matching iOS feature-for-feature.
- **SC-005**: For the recurring-spend, mortgage balance/equity, and outlier insight computations, the
  same inputs produce identical outputs on both clients, and every one is locked by a shared golden
  vector — bringing insight-rule vector coverage to 8 of 8.
- **SC-006**: On a ≥1024px web window, the Budget Progress widget and the lease-renewal banner are
  present in parity with the phone web view and iOS.
- **SC-007**: Both automated suites pass (web and iOS), the web suite starts under the default/pinned
  runtime with no manual version selection, and an intentionally introduced divergence in any function
  newly vectored by this feature fails both suites.
- **SC-008**: Across all in-scope areas, a person performing the same task on web and iOS observes the
  same stored data and the same displayed amounts — no behavioral divergence remains in scope.

## Assumptions

- **iOS is canonical**: where a pure function diverges with no objectively-correct answer (owner
  ordering, conversion rounding), web conforms to iOS's behavior; where one side is demonstrably wrong
  (mortgage months-elapsed off-by-one), both move to the correct result. The exact canonical rule for
  each is pinned during planning via the vector's expected values.
- The supported display-currency set and FX-rate source are unchanged by this feature; only the
  conversion math/rounding is reconciled and newly vectored.
- The `transactions` + owner-shares schema is unchanged; atomicity is achieved client-side or via an
  existing/standard server transaction mechanism, not a data-model change.
- Full UI-string translation on web remains out of scope; this feature delivers locale-aware
  money/number/date formatting parity only, consistent with 008.
- The configured sign-in code length is 8 (per 008); this feature only aligns the web copy to it.
- The ~25 cosmetic / 9 low-severity audit differences and the housing-detail IA difference
  (push-stack vs chip switcher, judged capability-equivalent) are out of scope.
- Source of truth for the divergences and their evidence is `specs/008-parity-remediation/parity-reaudit.md`.
