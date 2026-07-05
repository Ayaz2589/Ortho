# Feature Specification: Partner Invite & Join

**Feature Branch**: `017-partner-invite-join`

**Created**: 2026-07-05

**Status**: Draft

**Input**: User description: "Partner invite & join — the second person of the two-person household finally signs in. The household owner generates a one-time invite code from Settings > Household (copyable code + /join?token= link on web, ShareLink on iOS), sees pending/redeemed/expired invites, and can revoke unredeemed ones. The invited partner signs in with their own email OTP and joins the shared household: on web via a 'Join with a code / Start fresh' choice presented before the silent find-or-create household bootstrap; on iOS via a Settings 'Join a household' code-redeem sheet (no bootstrap interception). During join the partner claims their existing household Person row (only unlinked rows offered) or creates a new one, so historical splits, paid-by attribution, and settle-up balances immediately attribute to their account. Both apps deterministically reopen the joined household on every subsequent launch (persisted household preference replaces the .limit(1) pick). Grafted companion capability: a discreet manual refresh control (quiet header refresh on web, pull-to-refresh on the iOS transactions ledger) re-invoking the existing one-shot loadAll so two live sessions can see each other's writes without relaunching — explicitly manual, not realtime."

Ortho describes itself as a household budgeting app for **two people sharing one household** — yet today only one person can ever sign in. The second person exists only as a name in the household roster: they have no account, no device, no view of the shared money. This feature closes that gap. The household owner hands their partner a one-time invite code; the partner signs in with their own email, joins the household, claims their identity in the roster, and from that moment sees — and participates in — the same shared ledger, balances, and budgets. A companion manual-refresh affordance ensures the very first shared session works: when both partners are in the app, either can refresh and see the other's latest entries without relaunching.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Owner invites their partner (Priority: P1)

The household owner opens **Settings** and finds an **Invite your partner** area in the household section. They generate an invite, which produces a one-time code they can hand to their partner — copyable on the web, shareable through the system share sheet on iOS, and on the web also expressible as a join link that embeds the code. The invite is visibly time-limited (it expires after 7 days) and appears in a small list showing its status.

**Why this priority**: Nothing else in this feature can happen until an invite exists. This is the entry point of the whole journey and is independently valuable even before the partner acts — the owner can prepare and share the invite at their own pace.

**Independent Test**: As a signed-in household owner, generate an invite from Settings, confirm a code is produced and displayed exactly once in shareable/copyable form, and confirm the invite appears in the pending list with a visible expiry. Delivers "the owner can hand a working invitation to their partner."

**Acceptance Scenarios**:

1. **Given** a signed-in household owner on Settings, **When** they choose to invite their partner, **Then** a one-time invite code is generated and presented in a copyable form (web) or shareable form (iOS), together with plain guidance on how the partner uses it.
2. **Given** an invite was just created, **When** the owner looks at the household area of Settings, **Then** the invite is listed as pending with a human-readable expiry ("Expires in 7 days").
3. **Given** an invite code was presented at creation, **When** the owner navigates away and returns, **Then** the raw code is not retrievable again (it is shown once); the list still shows the invite's status, and the owner can create a fresh invite if the code was lost.
4. **Given** a household member who is not the owner, **When** they open Settings, **Then** invite creation and revocation controls are not offered to them.

---

### User Story 2 - Partner joins the shared household (Priority: P1)

The invited partner signs in to Ortho with their **own email** (the same one-time-passcode sign-in every user gets). On the web, a brand-new user who has no household is offered a clear choice before anything is created for them: **"Join with a code"** or **"Start fresh"**. Choosing "Join with a code" (or arriving through the join link) lets them enter/confirm the invite code and join the owner's household. On iOS, the partner signs in normally and joins afterwards from **Settings → Join a household** by entering the code. Either way, the partner lands in the full shared household — the same transactions, balances, budgets, and housing the owner sees.

**Why this priority**: This is the moment the product's central promise becomes true — the second person of the two-person household is finally inside the app. Everything downstream (identity claim, refresh) depends on it.

**Independent Test**: With a valid invite code from US1, sign in as a second account and complete the join on either surface; confirm the joiner sees the shared household's existing data (not an empty fresh household). Delivers "two accounts, one household."

**Acceptance Scenarios**:

1. **Given** a person with a valid invite code and no Ortho account, **When** they sign in on the web for the first time, **Then** they are offered "Join with a code / Start fresh" **before** any household is silently created for them.
2. **Given** the web join choice, **When** they enter a valid, unexpired, unredeemed code (or arrive via the join link carrying it), **Then** they become a member of the inviting household and land in it, seeing its existing shared data.
3. **Given** a signed-in iOS user, **When** they enter a valid code in Settings → Join a household, **Then** they become a member of the inviting household, the app switches to it, and its shared data is visible.
4. **Given** a partner who chose "Start fresh" instead, **When** they later obtain a code, **Then** they can still join from the join flow (web link) or Settings (iOS) without losing their own existing data.
5. **Given** an invalid, expired, revoked, or already-redeemed code, **When** the partner attempts to join, **Then** they see a calm, specific explanation and can retry with a different code or start fresh — never a crash, never a silent failure, and never a half-joined state.
6. **Given** a successful join, **When** the partner signs out and back in, or force-quits and relaunches, **Then** both apps deterministically reopen the joined shared household (not an arbitrary or newly created one).

---

### User Story 3 - Partner claims their identity so history follows them (Priority: P1)

The shared household's roster already contains the partner as a named person — splits, "paid by", and settle-up balances have been attributed to that person all along. As part of joining, the partner is shown the household's unclaimed roster names and claims the one that is them (or creates a new one if none fits). From that moment, everything historically attributed to that person — their share of every split, everything they paid for, the running "who owes whom" balance — is theirs, immediately, with no data migration or re-entry.

**Why this priority**: Claiming is what makes the join *meaningful*. Without it the partner is a spectator; with it, months of history — balances the couple actively settles against — attach to their account on day one.

**Independent Test**: In a household whose roster has an unclaimed person with historical splits and balances, join as the partner and claim that person; confirm per-member spend, paid-by labels, and the settle-up balance immediately reflect the claimed identity as "you." Delivers "your history is already here."

**Acceptance Scenarios**:

1. **Given** a joining partner and a roster containing unclaimed (never-linked, active) people, **When** the claim step is shown, **Then** exactly those unclaimed people are offered — people already linked to an account (including the owner) are not offered.
2. **Given** the partner claims a roster person, **Then** the claim takes effect immediately: existing splits, paid-by attributions, and the settle-up balance involving that person now present as the partner's own ("you") on both surfaces.
3. **Given** no unclaimed roster person fits (or none exists), **When** the partner chooses to continue as a new person, **Then** a new roster entry is created for them and they participate in the household from that point on.
4. **Given** the join completed, **Then** the partner ends the flow linked to exactly one roster person in that household — the flow cannot complete with the partner unlinked.

---

### User Story 4 - Partners see each other's activity without relaunching (Priority: P1)

The first evening both partners are signed in, one adds a grocery expense; the other, with the app already open, refreshes — a discreet refresh control on the web, the platform's familiar pull-to-refresh gesture on the iOS activity list — and the new expense appears. The affordance is quiet and unobtrusive, sets the expectation plainly (data updates when you refresh), and never interrupts or surprises.

**Why this priority**: Without any way to refresh, the first genuinely shared session would look broken — one partner's entries invisible to the other until an app relaunch. This story protects the trust the whole feature is meant to create. It is deliberately a *manual* refresh; live/automatic syncing is out of scope.

**Independent Test**: With one account signed in on two sessions (or two accounts in one household), write a transaction in one session and refresh in the other; the new row appears without relaunch. Delivers "we both see the same money."

**Acceptance Scenarios**:

1. **Given** a signed-in user on the web with current data on screen, **When** another session adds or edits household data and the user activates the refresh control, **Then** the view reflects the other session's changes without a page reload or sign-out.
2. **Given** a signed-in iOS user viewing the activity/transactions list, **When** they pull to refresh after another session made changes, **Then** the list reflects those changes without relaunching the app.
3. **Given** a refresh in progress or a refresh failure (offline, server error), **Then** the user sees calm feedback; on failure the previously displayed data remains intact and usable — a failed refresh never blanks or corrupts the view.
4. **Given** a refresh completes, **Then** everything currently derived from household data (lists, balances, dashboard figures) is consistent with the refreshed data — no mixed old/new state.

---

### User Story 5 - Owner manages outstanding invites (Priority: P2)

The owner can see at a glance the state of the invites they've created — pending (with expiry), redeemed (the partner is in), or expired — and can revoke a pending invite they no longer want honored (sent to the wrong address, changed their mind, code leaked). A revoked or expired code stops working immediately and tells the person attempting to use it, calmly, that it's no longer valid.

**Why this priority**: Basic hygiene and safety for the invitation capability — important, but the happy path (US1–US4) delivers the core value without it.

**Independent Test**: Create an invite, revoke it, and confirm (a) it disappears from/updates in the list and (b) redemption with its code now fails with the calm invalid-code message. Delivers "the owner stays in control of who can join."

**Acceptance Scenarios**:

1. **Given** invites in various states, **When** the owner views the household area of Settings, **Then** each invite shows a clear status: pending with time remaining, redeemed, or expired.
2. **Given** a pending invite, **When** the owner revokes it, **Then** it can no longer be redeemed, and the change is reflected in the list immediately.
3. **Given** a revoked or expired invite code, **When** someone attempts to redeem it, **Then** they receive the same calm "no longer valid" experience as US2 scenario 5.
4. **Given** a redeemed invite, **Then** it is not revocable (the join already happened) and is presented as completed history.

---

### User Story 6 - Nothing changes for existing solo users (Priority: P2)

A person who has used Ortho alone — or anyone who never touches an invite — signs in and uses the app exactly as before. Their household loads as it always has, their data is untouched, and (on the web) choosing "Start fresh" gives a brand-new user exactly the same first-run experience that exists today.

**Why this priority**: This feature must be purely additive. The one household-selection behavior that *does* change (deterministic reopening of the same household) is an invisible reliability improvement, not a visible change.

**Independent Test**: Run the full existing sign-in/bootstrap behavior suites for a single-account user with no invites; all behavior is unchanged apart from the new join offer shown to fresh, household-less web users.

**Acceptance Scenarios**:

1. **Given** an existing user with a household and no involvement with invites, **When** they sign in on either surface, **Then** their experience is unchanged and their household opens as always.
2. **Given** a brand-new web user who chooses "Start fresh", **Then** the outcome is identical to today's first-run experience (their own new household, ready to use).
3. **Given** any user who belongs to more than one household (e.g., a joiner who previously started fresh), **When** they relaunch, **Then** the same household they last joined/used opens every time — never a different one at random.

---

### Edge Cases

- **Code shown once**: The raw invite code is displayed only at creation. If lost, the owner revokes (or lets expire) and creates a new invite; the list never re-reveals a code.
- **Redeeming your own household's code**: If the owner (or an existing member) enters a code for a household they already belong to, the app tells them plainly they're already a member; nothing breaks, nothing duplicates. The entered code is spent by the attempt (a new one can be created).
- **Two people race one code**: An invite is one-time. The first successful redemption wins; the second attempt receives the calm "no longer valid" message.
- **Claim-step interruption**: If the partner joins (membership created) but abandons the app before claiming an identity, the claim step is re-presented when they next open the joined household — the flow completes before they participate as an unlinked member (US3 scenario 4).
- **Roster person removed mid-flow**: If the person the partner is about to claim is removed by the owner in the same moment, the claim fails calmly and the picker refreshes to the still-available choices.
- **Joiner already has their own data**: Joining never deletes or merges the joiner's own prior household; it remains intact (though not visible until a future household switcher exists — see Out of Scope).
- **Expiry while typing**: A code that expires between being displayed and being submitted simply fails with the standard "no longer valid" message and a retry path.
- **Refresh with unsaved edits in progress**: Refresh never destroys an in-progress add/edit form; a refresh underneath an open form leaves the form's contents alone.
- **Offline refresh**: Pull-to-refresh / refresh control while offline shows calm failure feedback and keeps the existing data on screen.
- **Invite listing longevity**: Redeemed and expired invites remain visible as history in the list (the backend keeps them); the list stays small in practice for a two-person household.

## Requirements *(mandatory)*

### Functional Requirements

**Invite creation & sharing**

- **FR-001**: Household owners MUST be able to generate a one-time invite from the household area of Settings on both surfaces; generation produces a human-shareable code, displayed exactly once at creation.
- **FR-002**: On the web, the invite MUST be presented both as a copyable code and as a join link that carries the code; on iOS it MUST be shareable through the system share sheet as well as copyable.
- **FR-003**: Invites MUST expire 7 days after creation; the expiry MUST be visible wherever the invite is listed.
- **FR-004**: Only household owners MUST be offered invite creation and revocation; other members MUST NOT see those controls.
- **FR-005**: The raw invite code MUST NOT be stored or retrievable in readable form after its one-time display (only a non-reversible form may persist), and MUST NOT appear in logs or error messages.

**Invite management**

- **FR-006**: The household area of Settings MUST list the household's invites with status — pending (with time remaining), redeemed, expired — on both surfaces.
- **FR-007**: Owners MUST be able to revoke a pending invite; revocation takes effect immediately and permanently. Redeemed invites MUST NOT be revocable.

**Join flow**

- **FR-008**: On the web, a newly signed-in user who belongs to no household MUST be offered an explicit choice — join with a code, or start fresh — before any household is created for them; "start fresh" MUST preserve today's first-run outcome exactly.
- **FR-009**: The web join flow MUST also be reachable via the join link (the link carries the code; after sign-in the user confirms and joins), including for users who already have a household.
- **FR-010**: On iOS, joining MUST be available from Settings ("Join a household") for any signed-in user, entering the code manually; iOS MUST NOT alter its existing first-run/sign-in sequence.
- **FR-011**: Redeeming a valid, unexpired, unrevoked, unredeemed code MUST make the redeeming user a member of the inviting household and open that household with its existing shared data.
- **FR-012**: Redemption of an invalid, expired, revoked, or already-redeemed code MUST fail with calm, specific, actionable messaging, leave no partial membership, and offer a retry path. The messaging MUST NOT distinguish "never existed" from "expired/revoked/redeemed" (no probing which codes exist).
- **FR-013**: A user redeeming a code for a household they already belong to MUST be told, calmly, that they are already a member; the attempt MUST NOT create a duplicate membership or alter their data. (The code itself is consumed by the redemption attempt — acceptable, since only someone already holding the household's code can trigger this; the owner can always create a fresh invite.)

**Identity claim**

- **FR-014**: The join flow MUST include an identity step in which the joiner either claims an unclaimed roster person or creates a new one; only roster people who are active (not removed) and not already linked to any account MAY be offered.
- **FR-015**: Claiming MUST take effect immediately: all existing attribution to the claimed person (splits, paid-by, member balances/settle-up, per-member breakdowns) MUST present as the joiner's own from that moment, with no data rewrite or migration.
- **FR-016**: The join MUST NOT complete with the joiner unlinked: if the identity step is interrupted, it MUST be re-presented when the joiner next opens that household, before they participate as a member.
- **FR-017**: A joiner MUST end up linked to exactly one roster person per household; already-linked people (including the owner's) MUST never be claimable.

**Household selection persistence**

- **FR-018**: Both apps MUST deterministically reopen the household the user last joined or used on every launch and sign-in; when a user belongs to multiple households, the choice MUST be stable and predictable, never arbitrary.
- **FR-019**: Completing a join MUST set the joined household as the one that opens, for that device/browser, from then on (until a future switching capability changes it).

**Manual refresh**

- **FR-020**: Signed-in users MUST have a manual way to refresh household data without relaunching: a discreet refresh control on the web, and the platform-native pull-to-refresh gesture on the iOS activity/transactions list.
- **FR-021**: A successful refresh MUST atomically replace displayed household data — every dependent view (lists, balances, dashboard) reflects the refreshed state consistently; a failed refresh MUST leave prior data fully intact and inform the user calmly.
- **FR-022**: Refresh MUST be explicitly manual; the feature MUST NOT introduce background/automatic syncing, and copy MUST set that expectation plainly where relevant.
- **FR-023**: Refresh MUST NOT clear or overwrite the contents of any add/edit form the user has open.

**Continuity, safety & platform promises**

- **FR-024**: All existing single-user behavior MUST be preserved: an account that never touches invites signs in, bootstraps, and uses the app exactly as before (verified by the existing behavior suites, amended only for the new no-household web choice).
- **FR-025**: The feature MUST require zero backend schema changes — it rides the invitation, membership, role, and identity-linking capabilities that already exist in the live backend — and zero changes to the shared finance-math parity vectors (no money/date math is touched).
- **FR-026**: Because the development environment cannot reach the live backend, the feature MUST ship with an operator-runnable readiness probe (verifying the invitation rails exist live) and an operator-runnable end-to-end smoke script (minting a disposable second account and redeeming a real invite), both documented as operator-pending verification steps.
- **FR-027**: All new user-facing text MUST ship simultaneously in all six supported languages on both surfaces, in Ortho's plainspoken, never-alarmist voice, and all new UI MUST use only existing design tokens and primitives per the constitution.
- **FR-028**: Members who joined via invite participate in the household under their (non-owner) role: they MUST be able to view and transact fully, while owner-only controls (inviting, revoking) remain gated to owners.
- **FR-029**: The parity record (PARITY.md) MUST document the new capability rows (invite/join, manual refresh) and record the deliberate per-canvas divergence: web offers a pre-bootstrap join choice, iOS joins post-hoc from Settings.

### Key Entities *(include if feature involves data)*

- **Invite**: A one-time, expiring (7-day) permission to join a specific household, created by its owner. Carries: household, status (pending / redeemed / expired / revoked-by-deletion), creation and expiry moments, and a secret code shown once (persisted only in non-reversible form). Redemption consumes it.
- **Household membership**: The relationship making a signed-in account a participant of a household, with a role (owner or member). Created by redemption; governs what the joiner can see and do.
- **Roster person (identity claim)**: The named person in the household roster that splits/balances have always referenced. A claim links a signed-in account to exactly one active, previously unlinked roster person per household, making history "theirs."
- **Household preference**: The per-device/browser record of which household to open on launch — set by joining, stable across relaunches.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A partner holding a valid invite code goes from starting sign-in to seeing the shared household's data in under 3 minutes (excluding email delivery time for the sign-in passcode).
- **SC-002**: Immediately after an identity claim, 100% of the claimed person's historical attribution (splits, paid-by, settle-up balance, per-member breakdown) presents as the joiner's own — zero re-entry, zero migration, zero discrepancy against what the owner's view shows for that person.
- **SC-003**: After one partner records a transaction, the other partner sees it in under 10 seconds using the refresh affordance — without relaunching or signing out.
- **SC-004**: Every pre-existing behavior test for single-user sign-in, bootstrap, and daily use still passes (amended only where the spec deliberately adds the new no-household choice), demonstrating zero regression for existing users.
- **SC-005**: 100% of failed redemption attempts (invalid/expired/revoked/redeemed codes) end in the calm explanatory message with a retry path — zero crashes, zero silent failures, zero partial joins — verified across all six languages.
- **SC-006**: The feature deploys with zero backend schema changes and zero shared-vector changes (verified by the vector-drift gate remaining green).
- **SC-007**: On launch after a join, the correct (joined) household opens on 100% of relaunches across both surfaces (no household roulette).

## Assumptions

- **The live backend already has the invitation rails.** The invitation storage, redemption operation, role model, and identity-linking column shipped in the very first backend migration and have never been altered; the apps exercise adjacent parts of that same migration daily. Because this development environment cannot reach the live backend (network policy), this is verified tonight by static evidence and shipped as an operator-runnable readiness probe (FR-026) rather than a live check. If the probe ever fails, the feature fails calmly at redemption time — no data corruption is possible.
- **Invite delivery is out of band.** The owner shares the code/link however they like (message, in person). Ortho does not send invitation emails; the invitation's optional email field remains unused.
- **7-day expiry** is the accepted default for invite lifetime (matches the backend's expiry design; no product requirement for configurability tonight).
- **Revocation is deletion.** The backend supports owner deletion of pending invites; "revoke" is that operation surfaced with honest copy. There is no "un-revoke."
- **One visible household per session.** A joiner's own previously created household remains intact but hidden until a household switcher ships (explicitly out of scope tonight); deterministic reopening (FR-018/019) makes the joined household the stable choice.
- **Role model is reused as-is**: invites confer the standard non-owner member role; no new roles or permission granularity are introduced.
- **Manual refresh is the deliberate scope** for cross-session consistency tonight; realtime/automatic sync is a separate future feature (see Out of Scope).
- **The sign-in mechanism is unchanged**: partners use the same email one-time-passcode sign-in that exists today; this feature adds no new authentication method.

## Out of Scope (tonight, explicitly)

- **Realtime / automatic background sync** — the refresh is manual by design; live subscriptions are a future feature with their own operational requirements.
- **Household switcher UI** — multiple memberships are tolerated and stable (FR-018), but switching between them has no UI yet.
- **iOS pre-bootstrap join interception** — iOS keeps its existing first-run sequence; joining is post-hoc from Settings. The web-only pre-bootstrap choice is recorded as a deliberate per-canvas divergence (FR-029).
- **Cleanup of a joiner's orphaned auto-created household** — harmless server-side; ledgered as operator follow-up.
- **Invitation emails, QR codes, or deep-link custom URL schemes on iOS.**
- **Multi-party (3+) balance simplification** — unchanged; balances remain pairwise.
- **Any backend schema/policy change** — including invite-cleanup jobs; the feature is deploy-complete at merge by design.
