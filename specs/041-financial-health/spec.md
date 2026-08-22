# Feature Specification: Financial Health

**Feature Branch**: `feat/041-financial-health`

**Created**: 2026-08-06

**Status**: Draft

**Input**: User description: "Financial Health — a baseline financial-fitness metric for a household. After account creation the user completes a short 5-section onboarding questionnaire; from those answers, blended with transaction history, budgets, and goals, a pure engine computes a 0–100 health score across five dimensions, surfaced as a calm, never-red dashboard widget with a progress-over-time story and one actionable next step. Feature one of two; the Purchase Advisor is a deferred follow-up. Design locked in docs/plan/financial-health.md."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See my financial health from day one (Priority: P1)

A brand-new user with **no transaction history and no linked bank** creates an account, answers a
short questionnaire about their income, housing, monthly commitments, and safety net, and
immediately sees a single, calm 0–100 health score with a band label (Strong / Steady / Building /
Getting started) and one concrete next step. The score is meaningful from the questionnaire alone.

**Why this priority**: This is the whole point of the feature for Ortho's primary user (lower-income,
immigrant, no-bank-first household). If the metric required transaction history it would be useless
on day one for exactly the people it is for. Delivered alone, it is a complete, valuable product:
"tell me where I stand and what to do first."

**Independent Test**: Complete the questionnaire with a fresh account (empty ledger, no budgets, no
goals) and confirm a score, a band, and an actionable next step appear on the dashboard — with no
red anywhere.

**Acceptance Scenarios**:

1. **Given** a new account with no transactions/budgets/goals, **When** the user completes the
   questionnaire, **Then** a 0–100 score, a band label, and one next-step suggestion are shown.
2. **Given** the user states a variable income, **When** the score is computed, **Then** the
   cautious (lower) income estimate is used for all ratios.
3. **Given** any completed questionnaire, **When** the score is displayed, **Then** no element uses
   a red/alarm color and the band label is never clinical ("poor", "at-risk").
4. **Given** the user records a monthly remittance / family-support commitment, **When** the score
   is computed, **Then** it is counted as a real fixed commitment (not miscategorized or ignored).

---

### User Story 2 - Watch my health improve over time (Priority: P2)

A returning user sees how their health score has moved since their first baseline ("you moved from
Building → Steady since March") as they log transactions, set budgets, and contribute to goals — the
score updates on its own, without re-taking the questionnaire.

**Why this priority**: The research says progress framing — not an absolute number — is what
motivates this user and keeps them engaged. It builds directly on P1 and turns a one-time score into
an ongoing reason to return.

**Independent Test**: With a completed profile, add transactions/budgets/goals that improve the
picture, reload, and confirm the live score rises and the widget shows the baseline-to-now movement.

**Acceptance Scenarios**:

1. **Given** a completed profile with a stored baseline, **When** the user's budgets/goals/spending
   improve, **Then** the live score reflects the improvement without a questionnaire re-take.
2. **Given** at least two snapshots exist, **When** the widget renders, **Then** it shows the
   movement between the first baseline and the current score.
3. **Given** a household with budgets that are on-track and a goal being funded, **When** the score
   is computed, **Then** the Plan-engagement and Safety-net dimensions reflect that activity.

---

### User Story 3 - Keep my profile current (Priority: P3)

A user whose situation changes (raise, move, new loan paid off, started sending remittances) re-opens
the questionnaire from Settings, updates their answers, and saves — recording a fresh baseline and
immediately re-scoring.

**Why this priority**: Life changes; a stale profile produces a wrong score and erodes trust. Needed
for the metric to stay credible, but the feature delivers value before it (P1/P2) so it is P3.

**Independent Test**: Edit the profile in Settings, save, and confirm the score recomputes and a new
snapshot is recorded.

**Acceptance Scenarios**:

1. **Given** an existing profile, **When** the user edits answers in Settings and saves, **Then** the
   stored answers, the derived score, and a new baseline snapshot all update.
2. **Given** the user adjusts a dimension's 1–5 importance slider, **When** the score recomputes,
   **Then** that dimension's contribution to the composite changes accordingly.

---

### Edge Cases

- **Skipped onboarding**: a user who skips the questionnaire gets neutral defaults written (so the
  widget still works) and a gentle "Set up your financial profile for a meaningful score" prompt; the
  flow never blocks access to the app and never nags after dismissal.
- **Zero / negative disposable income**: a rent-burdened household with little left over still gets a
  supportive (non-zero) score and an encouraging first step — never a red "failing" state.
- **No savings / no emergency fund**: "None yet" is a valid, non-judgmental answer that yields a low
  Safety-net dimension but a supportive overall tone and a concrete starter step.
- **All importance sliders equal**: the default (all 3) yields an equal-weight composite.
- **Profile present but empty ledger**: history-driven dimensions fall back to supportive neutrals;
  the score still computes.
- **Deploy-before-migrate window**: if the new data store is not yet present, the app must not fail
  to load — the feature is simply absent until the store exists.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST present a first-run questionnaire to a user who has not yet created a
  financial profile, covering income (with a variable-income low estimate), housing (with a
  shared-cost share), monthly fixed commitments (with a first-class remittance / family-support
  option), an emergency-fund level, and a 1–5 importance rating per health dimension.
- **FR-002**: Users MUST be able to complete the questionnaire and see a resulting health score
  using **only** their questionnaire answers — no transaction history, budgets, goals, or linked
  bank required.
- **FR-003**: The system MUST compute a single 0–100 composite health score from five dimensions
  (Cash flow, Safety net, Commitment load, Savings momentum, Plan engagement), each scored 0–100 and
  weighted by the user's per-dimension 1–5 importance rating (default 3 = equal weight).
- **FR-004**: The system MUST map the composite score to one of four calm bands — Strong (80–100),
  Steady (60–79), Building (40–59), Getting started (0–39) — and MUST never render the score or band
  with a red/alarm color or a clinical/judgmental label.
- **FR-005**: The system MUST present exactly one actionable, encouraging next step derived from the
  lowest-contributing dimension.
- **FR-006**: The system MUST use the cautious (lower) income figure for all ratio math when the user
  indicates their income varies.
- **FR-007**: When transaction history, budgets, or goals exist, the system MUST use them to sharpen
  the relevant dimensions, and when they are absent MUST fall back to a supportive neutral value
  (never a penalty that reads as failure).
- **FR-008**: The system MUST recompute the score live as the user's underlying data (transactions,
  budgets, goal contributions) changes, without requiring a questionnaire re-take.
- **FR-009**: The system MUST record a baseline snapshot (score + band + timestamp) when the
  questionnaire is first completed and each time the profile is saved, and MUST show the user how
  their score has moved from their first baseline to now.
- **FR-010**: Users MUST be able to re-open and edit their profile from Settings, and saving MUST
  persist the new answers, re-score, and record a new baseline snapshot.
- **FR-011**: The health metric MUST be surfaced as a toggleable dashboard widget (consistent with
  the existing widget system), not as a new top-level navigation destination.
- **FR-012**: A user who skips the questionnaire MUST still be able to use the app; the system MUST
  write neutral defaults so the widget functions and MUST show a non-blocking prompt to complete the
  profile, without nagging after dismissal.
- **FR-013**: The system MUST scope all financial-profile data to the individual user (private to
  that account) and MUST protect it so no other user can read or modify it.
- **FR-014**: All new user-facing copy MUST be available in the app's supported languages and MUST
  follow the plainspoken, second-person voice and money-formatting conventions.
- **FR-015**: The absence of the feature's data store MUST NOT break application load (graceful
  degradation during the deploy-before-migrate window).

### Key Entities *(include if feature involves data)*

- **Financial Profile**: the household member's stated financial situation — monthly income and
  whether it varies (+ low estimate), housing type/cost and the share they pay, savings intention,
  and emergency-fund level. One per user, private to that user.
- **Fixed Commitment**: a recurring monthly obligation beyond housing (label + amount + kind), where
  kind includes a first-class remittance / family-support option. Zero or more per user.
- **Dimension Weight**: the user's 1–5 importance rating for a single health dimension (default 3).
  One per user per dimension.
- **Health Snapshot**: a point-in-time record of the computed score and band, used to show progress
  over time. Append-only, many per user.
- **Health Score (derived, not stored)**: the live 0–100 composite, its band, the five per-dimension
  sub-scores with their weights, and the single next-step action.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user with an empty ledger and no linked bank can obtain a meaningful health score
  (score + band + next step) after completing only the questionnaire.
- **SC-002**: A user can complete the onboarding questionnaire in under 2 minutes.
- **SC-003**: No screen in the feature displays the score, band, or any dimension in a red/alarm
  color, and no band or copy uses a judgmental label — verified across every band including the
  lowest.
- **SC-004**: For a rent-burdened, low-savings household, the resulting score and copy remain
  supportive (non-zero score, encouraging next step) rather than presenting a "failing" state.
- **SC-005**: After a user improves their budgets/goals/spending, the score increases on next view
  without re-taking the questionnaire, and the widget shows the movement from the first baseline.
- **SC-006**: Editing the profile in Settings updates the score and records a new baseline within the
  same session.
- **SC-007**: Adjusting a dimension's importance slider measurably changes that dimension's
  contribution to the composite score.
- **SC-008**: The application loads normally even when the feature's data store is not yet present.

## Assumptions

- **Target user**: lower-income, immigrant, no-bank-first NYC households (per `docs/research/`); the
  metric is calibrated to stability and direction of travel, not distance from a middle-class
  50/30/20 ideal.
- **Profile-first by design**: questionnaire answers are the primary data; transaction history,
  budgets, and goals only sharpen the score. This is a product decision, not a limitation.
- **Per-user, not per-household** (v1): the profile is private to the individual account; a shared
  household-income mode is deferred.
- **Existing engines reused**: budget-status, goal-pacing, and savings-rate logic already exist and
  are composed by this feature rather than re-implemented.
- **Widget surface**: the feature reuses the existing dashboard widget system (toggle in Settings);
  no new navigation destination is added (the app keeps its five destinations).
- **Feature one of two**: the Purchase Advisor (`docs/plan/purchase-advisor.md`) is a deferred
  follow-up that will consume this feature's derived profile and scoring engine; it is out of scope
  here.
- **Calibration is data, not logic**: dimension thresholds/weights live in a tunable configuration so
  they can be adjusted without changing the scoring logic.
