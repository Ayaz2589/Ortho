# Feature Specification: Cross-Platform Parity Remediation

**Feature Branch**: `008-parity-remediation`

**Created**: 2026-06-16

**Status**: Draft

**Input**: User description: "Cross-platform parity remediation between the Ortho web and iOS clients — remediate the four high-impact divergence clusters found in the parity audit (auth/session, split + people data correctness, the unenforced iOS test harness, and the web desktop re-implementations that drop capability). Keep web and iOS in lockstep, locked by shared golden vectors."

## Overview

A deep web-vs-iOS parity audit found the two Ortho clients ~83% aligned: the pure-logic
layer, the data model, and the core flows already match. This feature closes the four
**high-impact** divergence clusters so the two clients are *trustworthily equivalent*. It is
reconciliation of existing behavior, not a new feature surface or a redesign — the four
destinations (Dashboard, Transactions, Housing, Settings) are preserved. The ~25 cosmetic
low-severity differences are explicitly **out of scope** (a separate polish pass).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Stay signed in, trust the data you see (Priority: P1)

A returning person opens the iOS app. They are taken straight to their data — the same
household, people, and transactions they had last time — without being bounced to a sign-in
screen or shown an empty app. When they sign out, the app fully forgets the previous person;
signing in again (as the same or a different person) loads a correct, fresh view.

**Why this priority**: This is the most damaging current divergence. On iOS, a normal cold
launch can drop the person onto the sign-in screen with empty data even though they have a
valid, restorable session — making the app feel broken and untrustworthy. Web restores the
session reliably. Until this matches, nothing else about parity matters because people cannot
dependably reach their data on iOS.

**Independent Test**: Sign in on iOS, force-quit, and relaunch — the app opens to the
person's real data without a sign-in detour. Let the access token age past expiry, relaunch —
the session refreshes silently rather than signing the person out. Sign out — the previous
person's data is gone from the app immediately. Each can be verified without any other cluster.

**Acceptance Scenarios**:

1. **Given** a person who signed in previously and has a valid stored session, **When** they
   cold-launch the iOS app, **Then** they land on their data (not the sign-in screen), and no
   empty-data flash of someone else's or no household occurs.
2. **Given** a stored session whose access token has expired but whose refresh token is still
   valid, **When** the app launches, **Then** the session is refreshed and the person stays
   signed in rather than being signed out.
3. **Given** a signed-in person, **When** they sign out, **Then** all in-memory household,
   people, transaction, card, property, and rental data is cleared and the next sign-in
   re-loads everything from the server fresh (no stale data from the prior account leaks in).
4. **Given** the same Supabase email-code configuration, **When** a person enters their
   sign-in code on web and on iOS, **Then** both clients accept the same code length and the
   on-screen instruction text matches the length actually required.
5. **Given** the product's "one active device at a time" guarantee, **When** a person signs in
   on iOS, **Then** iOS participates in the same active-platform lock that web honors (the
   guarantee holds regardless of which client is used), **or** the guarantee is removed
   consistently from both clients — it is never silently half-present.

---

### User Story 2 - Splits and people read and round-trip identically on both clients (Priority: P2)

A household splits a transaction and edits people. Whether they enter the split on web or iOS,
the per-person amounts are stored the same way and add up to the exact total. Re-opening and
re-saving a transaction never silently changes who owes what. A person's name and color can be
corrected after they were added, on either client.

**Why this priority**: These are silent **data-correctness** divergences — the worst kind,
because the person isn't told anything is wrong. The same income split stores different
allocations depending on the client; re-saving a custom split on iOS quietly discards the
custom amounts; and a typo in a person's name or color is uncorrectable on iOS. Data the two
clients disagree about erodes trust in every number the app shows.

**Independent Test**: Create a multi-owner income transaction with a custom split on web, open
it on iOS — the per-person amounts match exactly; re-save on iOS with no edits — the amounts
are unchanged. On iOS, rename and recolor an existing person and confirm it persists and shows
on web. Verifiable without the auth or desktop clusters.

**Acceptance Scenarios**:

1. **Given** a transaction with two or more owners that is **income**, **When** the person
   opens the add/edit form on iOS, **Then** the same even / by-percent / by-value split editor
   is available as for an expense, and the entered shares are persisted (not forced to an even
   split).
2. **Given** a stored transaction whose owner shares are a **custom (non-even)** split, **When**
   a person opens it for edit or copy on iOS and saves again without changing the split, **Then**
   the stored per-owner amounts are preserved exactly to the cent (no silent re-balancing to an
   even split).
3. **Given** a split entered as percentages or values on either client, **When** it is saved,
   **Then** the per-owner cents sum exactly to the transaction total and resolve to identical
   per-owner amounts on the other client.
4. **Given** an existing household person, **When** a person taps that member on iOS, **Then**
   they can change the member's name and color, the change persists to the server, and it
   appears on web — matching web's existing person editor.

---

### User Story 3 - Parity is automatically enforced, not assumed (Priority: P3)

A developer changes shared business logic. The cross-platform test suite runs on **both**
clients against the same golden vectors and fails if iOS and web would diverge, catching drift
before it ships.

**Why this priority**: The shared golden vectors exist precisely to keep the clients in
lockstep, but on iOS they are not wired to run, so drift (e.g. the insight-id divergence) went
undetected. Without an enforced harness, every fix in Stories 1, 2, and 4 can silently rot
again. This story makes parity self-defending.

**Independent Test**: Run the iOS test command — the shared vectors execute and pass; introduce
a deliberate divergence in a pure function and confirm the iOS suite goes red. Verifiable
independent of the runtime behavior of the other stories.

**Acceptance Scenarios**:

1. **Given** the shared golden vectors, **When** the iOS test suite is run, **Then** the
   vector-based parity tests actually execute (they are compiled and the vector files are
   available to the tests) and pass.
2. **Given** a pure function whose iOS output is changed to diverge from web, **When** the iOS
   test suite runs, **Then** it fails — drift cannot merge undetected.
3. **Given** the insight-generation logic, **When** both suites run, **Then** the stable
   identifiers each client emits for the same inputs match the single documented contract, and
   the previously uncovered rules are locked by vectors.

---

### User Story 4 - The wide/desktop web view shows everything the phone does (Priority: P3)

A person using the web app on a large screen sees the same depth of information as on their
phone or on iOS: how a split transaction is allocated per person, category and per-member
drill-down on the dashboard, and a language setting that actually changes number and date
formatting.

**Why this priority**: On wide screens, the web app currently uses separate layouts that drop
real capability present on both the phone web view and iOS — per-owner split amounts disappear
from the detail pane, dashboard drill-downs vanish, and the language picker does nothing.
Desktop is meant to be *more room to breathe*, never less capability.

**Independent Test**: On a ≥1024px web window, open a split transaction's detail — per-owner
amounts are shown; open the dashboard — category and per-member breakdowns are present; change
the language — numbers and dates re-format. Verifiable independent of iOS.

**Acceptance Scenarios**:

1. **Given** a split or multi-owner transaction, **When** its detail is viewed on a wide web
   screen, **Then** the per-owner amounts (and their share of the total) are shown, matching the
   phone web view and iOS.
2. **Given** the dashboard on a wide web screen, **When** the person views it, **Then** the
   category breakdown (with drill-down) and the per-member split breakdown are present, matching
   the phone view.
3. **Given** the Settings language picker on web, **When** the person selects a different
   language, **Then** monetary, number, and date formatting across the app re-render in that
   locale (and the choice persists across reloads).

### Edge Cases

- **Cold launch with no stored session** → sign-in screen, as today (no regression).
- **Cold launch with a stored session that is fully unusable** (refresh fails / revoked) →
  the person is taken to sign-in cleanly, not stranded on a blank signed-in shell.
- **A split whose percentages don't divide evenly** (leftover cent) → the leftover is assigned
  deterministically and identically on both clients; sums still reconcile to the exact total.
- **Editing a transaction down to a single owner** → the split editor collapses to full
  attribution, and no orphan shares remain.
- **Renaming the account-holder person or the last remaining member** → permitted (this is the
  case the missing iOS editor made impossible).
- **Active-platform lock contention** (person already "active" on the other client) → resolved
  by the same rule on both clients, with a consistent, non-alarmist explanation.
- **Language set to "System"** → follows the device/browser locale on both clients.

## Requirements *(mandatory)*

### Functional Requirements

**Auth & session (Story 1)**

- **FR-001**: The iOS app MUST restore an existing stored session before deciding whether to
  show the signed-in or signed-out view, so a returning person is not shown the sign-in screen
  when a valid session exists.
- **FR-002**: When a stored session's access token is expired but refreshable, the iOS app MUST
  attempt a refresh and keep the person signed in, rather than discarding the session and
  signing them out.
- **FR-003**: During session restore at launch, the iOS app MUST show a neutral launching state
  rather than briefly flashing the sign-in screen or empty data.
- **FR-004**: Signing out on iOS MUST clear all in-memory domain data (household, people,
  transactions, cards, properties, rental payments, budgets, current-household selection) and
  reset bootstrap state so a subsequent sign-in re-loads everything from the server.
- **FR-005**: Both clients MUST require the same sign-in code length, and that length MUST match
  the actual configured code; on-screen instructional copy MUST state the correct length on both
  clients.
- **FR-006**: The "single active platform" guarantee MUST behave identically across clients —
  either iOS participates in the same lock web uses (claim on sign-in, release on sign-out,
  yield when the other client is active), or the mechanism is removed from both. It MUST NOT be
  present on one client and absent on the other.
- **FR-007**: Both clients MUST validate the signed-in identity using an equivalent approach so
  that a stale or invalid session is treated the same way on each.

**Split & people data correctness (Story 2)**

- **FR-008**: iOS MUST offer the same split editor (even / by-percent / by-value) for multi-owner
  **income** as for multi-owner expense; entered income shares MUST be persisted, not coerced to
  an even split.
- **FR-009**: When a stored transaction has a custom (non-even) split, opening it for edit or
  copy MUST reconstruct the exact stored per-owner amounts on both clients, and re-saving without
  changing the split MUST preserve those amounts to the cent.
- **FR-010**: For any split, the per-owner cents MUST sum exactly to the transaction total, and
  the same inputs MUST produce identical per-owner amounts on both clients (including the
  deterministic placement of any leftover cent).
- **FR-011**: iOS MUST let a person edit an existing household member's name and color, with the
  change persisted to the server and reflected on web — matching web's existing person editor.

**Enforced parity harness (Story 3)**

- **FR-012**: The iOS test suite MUST compile and run the shared golden-vector parity tests, with
  the shared vector files available to those tests, and the suite MUST be runnable with a single
  command.
- **FR-013**: A deliberate divergence in any vector-locked pure function MUST cause the iOS suite
  to fail.
- **FR-014**: The stable identifiers emitted by the insight logic MUST match a single documented
  contract across both clients, and the golden vectors MUST cover every insight rule.

**Desktop web capability parity (Story 4)**

- **FR-015**: The wide/desktop web transaction detail MUST show per-owner amounts and each
  owner's share of the total for split/household transactions, matching the phone web view and
  iOS.
- **FR-016**: The wide/desktop web dashboard MUST present the category breakdown (with
  transaction drill-down) and the per-member split breakdown, matching the phone web view.
- **FR-017**: The web language selection MUST drive locale-aware formatting (money, numbers,
  dates) across the app and persist across reloads, matching iOS's app-wide locale behavior.

**Cross-cutting**

- **FR-018**: Any change to a pure function or a stored data representation MUST be implemented
  identically on both clients and locked by a shared golden vector asserted by both suites
  (Constitution Principle VI).
- **FR-019**: No change in this feature may alter the existing category/source/kind taxonomy, the
  four destinations, or the existing mobile/iOS information density; behavior is reconciled, not
  redesigned.

### Key Entities *(include if feature involves data)*

- **Session**: the signed-in person's authenticated context. Has a restorable stored form, an
  access token that can expire, and a refresh token that can renew it. Drives the signed-in vs
  signed-out view and must be torn down on sign-out.
- **Transaction owner share**: the authoritative per-owner allocation of a transaction, stored as
  cents that always sum to the transaction total. Produced from an even, by-percent, or by-value
  split and must round-trip losslessly through edit/copy on both clients.
- **Household person**: a name-only household member with a display color; editable (name +
  color) after creation; soft-removable. The account holder is one such person.
- **Insight**: a generated observation about spending with a stable identifier used for
  de-duplication; the identifier scheme is a cross-client contract.
- **Active-platform lock**: a record of which single client is currently "active" for a person,
  enforcing the one-active-platform guarantee; must be honored or absent symmetrically.
- **Golden vector**: a shared input/expected-output fixture for a pure function, asserted by both
  the web and iOS test suites to keep the clients in lockstep.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A returning person with a valid session reaches their real data on iOS cold launch
  in 100% of attempts, with zero sign-in detours and zero empty-data flashes.
- **SC-002**: After an expired-but-refreshable session, the person stays signed in on relaunch in
  100% of attempts (no forced sign-out).
- **SC-003**: For a transaction entered with a custom split on either client, the per-owner
  amounts read on the other client match to the cent in 100% of cases, and a no-op edit-and-save
  changes those amounts in 0% of cases.
- **SC-004**: A person can correct a household member's name and color on iOS, and the correction
  is visible on web — a task that has a 0% completion rate today.
- **SC-005**: The iOS test suite executes the shared golden vectors and passes; an intentionally
  introduced divergence in a vector-locked function fails the suite (parity drift is caught
  before merge, not after).
- **SC-006**: On a wide web screen, per-owner split amounts, dashboard category/per-member
  drill-downs, and locale-aware formatting are all present — matching the phone view feature for
  feature.
- **SC-007**: The automated checks on both clients pass — covering money, split, and date logic —
  before the feature is considered complete; neither client's suite is skipped.
- **SC-008**: Across the four remediated clusters, a person performing the same task on web and
  iOS observes the same outcome (same stored data, same displayed amounts) — no behavioral
  divergence remains in the in-scope areas.

## Assumptions

- The session, transactions, people, and active-platform data already live in Supabase and are
  unchanged by this feature; this remediation changes client behavior, not the schema (the
  `platform_locks` and `household_people` tables already exist).
- The configured sign-in code length is the canonical one; both clients are aligned to it (the
  audit observed iOS gating on 8 and web on 6 — the implementation will reconcile to the actual
  Supabase setting).
- The shared golden vectors are the single source of truth for cross-client parity; new vectors
  are added for any newly-reconciled logic (income splits, custom-split edit prefill, full insight
  coverage).
- Web remains the additive desktop canvas of the same product; "desktop parity" means the wide
  layout reuses the shared capability, not that iOS gains desktop-style layouts.
- Full UI-string translation on web is **not** in scope; the language work delivers locale-aware
  number/date/money formatting parity only.
- The ~25 cosmetic low-severity audit gaps are handled separately and are not part of this
  feature's done-definition.
