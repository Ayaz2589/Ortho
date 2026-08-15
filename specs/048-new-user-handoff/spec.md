# Feature Specification: New-User Hand-Off to Financial Health

**Feature Branch**: `feat/048-new-user-handoff`

**Created**: 2026-08-15

**Status**: Draft — scaffolded for a sandbox agent. Run `/speckit-plan` next.

**Input**: Feature 4 of 4 in the onboarding funnel (`docs/plan/onboarding-funnel.md`). Closes the loop: a visitor who travelled the funnel and just created an account continues straight into the existing financial-health questionnaire instead of landing on an empty dashboard.

## Overview

The funnel ends at sign-in. This feature decides what happens immediately after.

Someone who read a landing page, took a tour, and made an account is mid-journey — dropping them on
an empty dashboard wastes the momentum the previous three features built. They should continue into
the financial-health questionnaire that already exists.

Someone who did **not** travel the funnel — a returning user on a new device, an invited household
member, anyone who went straight to sign-in — must see exactly what they see today.

**This is a deliberate, scoped reversal of a prior decision.** Spec 041 hard-redirected every
profile-less user into the questionnaire; spec 042 removed that redirect on purpose, replacing it
with a dismissible announcement. This feature reintroduces a hard hand-off **only** for
funnel-walkers. The announcement path stays intact for everyone else. Anything broader would undo
spec 042.

**Depends on spec 045 being merged.** Independent of 046 and 047 — it reads the funnel marker and
never touches the landing pages or the tour.

## Inherited contracts (do not reinvent)

| Contract | Where | Use |
|---|---|---|
| `readFunnelEntry()`, `clearFunnelEntry()` | `web/lib/onboarding/funnel.ts` | Read after sign-in; clear once acted on so it fires exactly once. |
| The questionnaire | `web/app/(app)/welcome/financial-profile/page.tsx` | The destination. Do not rebuild or restyle it. |
| The announcement drawer | `web/components/announcements/` | Must keep working unchanged for non-funnel users. |
| Sign-in | `web/app/sign-in/page.tsx` | Where the decision is made. Note it renders **outside** the app's data provider. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A funnel newcomer continues into financial health (Priority: P1)

Someone who came through the landing page and tour finishes creating their account and is taken
straight into the financial-health questionnaire — the journey continues rather than stopping at a
dashboard with nothing in it.

**Why this priority**: The feature.

**Independent Test**: Walk landing → tour → sign-in as a new user and confirm arrival at the
questionnaire; confirm the same user, signing in again later, is not asked twice.

**Acceptance Scenarios**:

1. **Given** a visitor who travelled the funnel, **When** they complete sign-in, **Then** they
   arrive at the financial-health questionnaire.
2. **Given** that visitor completes the questionnaire, **When** it finishes, **Then** they arrive at
   the dashboard with their profile saved.
3. **Given** that visitor signs in again later, **When** they authenticate, **Then** they go to the
   dashboard — the hand-off happens once.
4. **Given** the hand-off has fired, **When** the funnel record is inspected, **Then** it has been
   cleared.

---

### User Story 2 - Everyone else is untouched (Priority: P1)

Users who did not travel the funnel keep today's behavior exactly: sign-in leads to the dashboard,
and the existing "what's new" announcement is how financial health is offered to them.

**Why this priority**: Equal to P1. This feature reverses a deliberate prior decision, and the
reversal must not leak beyond the case it was scoped to.

**Independent Test**: Sign in without ever visiting the funnel and confirm the dashboard loads and
the announcement behaves as before.

**Acceptance Scenarios**:

1. **Given** a user who never travelled the funnel, **When** they sign in, **Then** they arrive at
   the dashboard.
2. **Given** that user has no financial profile, **When** the dashboard loads, **Then** the existing
   announcement offers financial health, dismissible as today.
3. **Given** an existing user who already has a profile, **When** they sign in, **Then** nothing
   about their experience changes.
4. **Given** a user with a profile who somehow carries the funnel record, **When** they sign in,
   **Then** they are not asked to redo the questionnaire.

---

### User Story 3 - Skipping is still honest (Priority: P2)

A funnel newcomer who declines the questionnaire is not nagged. Declining writes no profile, so the
dashboard honestly shows an unset state rather than a score derived from nothing, and they are not
immediately offered the same thing again by the announcement.

**Why this priority**: Spec 042 made skipping dismiss-only for a reason — a zero-income neutral
profile produced a misleading score. Reintroducing a hand-off must not reintroduce that.

**Independent Test**: Take the hand-off, decline, and confirm the dashboard shows the unset state
with no duplicate prompt.

**Acceptance Scenarios**:

1. **Given** a funnel newcomer in the questionnaire, **When** they decline, **Then** no profile is
   written and they arrive at the dashboard.
2. **Given** they declined, **When** the dashboard loads, **Then** the financial-health surface
   honestly shows its unset state.
3. **Given** they declined, **When** the dashboard loads, **Then** they are not immediately shown
   the announcement offering the same questionnaire.
4. **Given** they declined, **When** they later choose to set it up, **Then** the existing route to
   the questionnaire still works.

---

### Edge Cases

- **The account already has a profile** but the funnel record is present → go to the dashboard, do
  not re-ask.
- **Sign-in completed on a different device** from the one that walked the funnel → the record is
  per-device, so no hand-off; the announcement covers them. Acceptable, not a defect.
- **Storage unavailable** → no record can be read; sign-in behaves as today.
- **An invited household member** who signs in on a device that once walked the funnel → the profile
  guard governs; nobody is asked twice.
- **The visitor abandons before signing in** → the record simply persists harmlessly until used or
  cleared; it holds no personal data.
- **Sign-out and sign-in as a different user on the same device** → the hand-off must not fire for
  the second user on a stale record.
- **The installed mobile app** → a user who signs in there has not travelled the web funnel; today's
  behavior must be preserved.

## Requirements *(mandatory)*

- **FR-001**: A user who completes sign-in with the funnel record present MUST be taken to the
  financial-health questionnaire instead of the dashboard.
- **FR-002**: The record MUST be cleared once acted on, so the hand-off happens exactly once.
- **FR-003**: A user without the record MUST reach the dashboard exactly as today.
- **FR-004**: A user who already has a financial profile MUST NOT be sent to the questionnaire,
  whatever the record says.
- **FR-005**: The existing announcement path MUST continue to work unchanged for non-funnel users.
- **FR-006**: A funnel user handed to the questionnaire MUST NOT then be offered the same
  questionnaire again by the announcement.
- **FR-007**: Declining MUST remain dismiss-only — no profile written, no derived score.
- **FR-008**: Declining MUST leave the financial-health surface showing its honest unset state.
- **FR-009**: A stale record MUST NOT trigger a hand-off for a different user on the same device.
- **FR-010**: The feature MUST introduce no database change and no new runtime dependency.
- **FR-011**: No route, screen or setting outside the sign-in hand-off and the questionnaire's
  entry guard may change behavior.

## Success Criteria *(mandatory)*

- **SC-001**: 100% of funnel newcomers reach the questionnaire immediately after creating an
  account.
- **SC-002**: Zero non-funnel users experience any change to their sign-in destination.
- **SC-003**: The hand-off fires at most once per funnel journey.
- **SC-004**: Zero users are asked to set up financial health twice in one session.
- **SC-005**: Declining writes no profile, in 100% of cases.
- **SC-006**: The existing test suite passes unchanged, including every spec 041 and spec 042 test.

## Assumptions

- **The decision keys on the funnel record alone, not on profile absence.** Sign-in renders outside
  the app's data provider and cannot read the profile; a funnel-walker is a new user by definition.
  The profile check therefore belongs at the questionnaire's entry, not at sign-in — this split is
  the crux of the design and is why FR-004 exists separately from FR-001.
- **Per-device is acceptable.** A visitor who walks the funnel on a phone and signs in on a laptop
  gets the announcement instead of the hand-off. Making this cross-device would require server state
  for a marginal case.
- **Suppressing the duplicate prompt** (FR-006) means marking the existing financial-health
  announcement as seen when the hand-off fires.
- **The tour (spec 047) may not exist yet** — nothing sets the record until it ships. This feature
  is testable by setting the record directly, and merges independently.
- **No new copy is expected**; the questionnaire and its surfaces are already translated. Any string
  that does appear must be added across all catalogs per repo convention.
