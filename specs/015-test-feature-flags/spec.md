# Feature Specification: Test-Build Feature Flags (Test Data + Auth Bypass)

**Feature Branch**: `015-test-feature-flags`

**Created**: 2026-07-03

**Status**: Draft

**Input**: User description: "the ortho web app and ios app should have a feature flag button on test devices that lets the user toggle on or off various test features so that my actual transactions do not get poisoned with test data. the settings page should have a dummy data model but i think it is outdated. lets create a ff section that allows users to use test data and also a ff that bypasses auth."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Exercise the app with disposable test data, never touching real money (Priority: P1)

A person testing Ortho (the owner, a QA tester, or a reviewer) opens **Settings** on a test build and finds a **Developer** area with a **Use test data** switch. Turning it on replaces everything they see — transactions, cards, household members, budgets, housing — with a rich, realistic sample dataset. They can freely add, edit, delete, split, and settle transactions to explore every screen, and none of it ever reaches the real, shared backend. When they turn the switch off (or leave the test build), their real household data is exactly as it was — untouched and un-poisoned.

**Why this priority**: This is the whole point of the request — the user is worried their "actual transactions get poisoned with test data." Isolation of test activity from the live shared backend is the core value and the one thing that must be true. It is independently useful even without the auth-bypass flag.

**Independent Test**: On a test build, sign in normally, enable **Use test data**, create/edit/delete several transactions, then disable the flag (or re-launch without it) and confirm the real household shows none of those changes and the live backend received no writes. Fully delivers "test without poisoning."

**Acceptance Scenarios**:

1. **Given** a signed-in user on a test build with test data OFF, **When** they open Settings, **Then** a **Developer** section with a **Use test data** switch (OFF) is visible.
2. **Given** test data is OFF, **When** the user turns **Use test data** ON, **Then** the app presents the seeded sample dataset across Dashboard, Transactions, Housing, and Settings, with populated household members, member balances/settle-up, budgets, and rental payments.
3. **Given** test data is ON, **When** the user adds, edits, or deletes a transaction (or card, budget, property, member), **Then** the change is reflected immediately in the app **and** no create/update/delete request is sent to the live backend.
4. **Given** the user made changes while test data was ON, **When** they turn **Use test data** OFF, **Then** the app returns to their real live data and none of the test-mode changes are present in it.
5. **Given** the user is viewing test data, **When** they navigate to member balances / settle-up and to the month/range pickers, **Then** balances are non-empty and there are multiple months to navigate (the sample spans several months).

---

### User Story 2 - Enter the app without signing in, for fast test iteration (Priority: P2)

On a test build, a tester wants to jump straight into the app to check a screen without waiting for an emailed one-time code. In the same **Developer** area they turn on **Bypass auth**. The app opens directly to the main tabs, backed by the in-memory test dataset, with no sign-in step. Because there is no real account behind this mode, it always uses test data — it can never read or write the real backend.

**Why this priority**: A convenience that speeds up manual testing and screenshot/QA passes. Valuable but secondary to isolation; it is only meaningful when paired with the test dataset, so it depends on User Story 1.

**Independent Test**: On a fresh test build with no stored session, enable **Bypass auth**, relaunch, and confirm the app opens straight to the main tabs on the test dataset with no sign-in screen and no live-backend traffic.

**Acceptance Scenarios**:

1. **Given** a test build and no signed-in session, **When** **Bypass auth** is ON, **Then** launching the app skips the sign-in screen and opens the main tabs directly.
2. **Given** **Bypass auth** is turned ON, **Then** **Use test data** is also treated as ON (bypass implies test data), and the app shows the seeded dataset.
3. **Given** **Bypass auth** is ON, **When** the user performs any action, **Then** no request reaches the live backend and no real session is created.
4. **Given** **Bypass auth** is ON, **When** the user turns it OFF, **Then** the app returns to the normal authentication gate (sign-in required if there is no valid real session).

---

### User Story 3 - Flags are invisible and inert in a real production release (Priority: P1)

A regular customer downloads the shipping App Store build (iOS) or visits the production website. They must never see the Developer section, and there must be no way — not even by editing local storage or reusing a value set on an earlier test build — to turn on test data or auth bypass in that production experience. Their real money data is the only thing the app will ever show them.

**Why this priority**: Safety. A test-only affordance leaking into production could hide a real customer's data behind sample data or remove the auth gate. This must be guaranteed structurally, not by convention.

**Independent Test**: Build/run the production configuration of each surface and confirm the Developer section is absent and that a pre-set "on" flag value has no effect on behavior.

**Acceptance Scenarios**:

1. **Given** a production build/deploy, **When** any user opens Settings, **Then** no Developer / Feature Flags section is present.
2. **Given** a production build/deploy where a test flag value was somehow persisted (e.g. carried over from a prior test build on the same device, or hand-edited in browser storage), **When** the app runs, **Then** the flags are forced off and behavior is identical to flags never having existed.
3. **Given** a production build, **Then** neither test-data seeding nor auth-bypass code paths can be reached.

---

### Edge Cases

- **Toggling mid-session**: Turning **Use test data** on or off is a mode switch between two entirely separate data sources; the app re-initializes its data cleanly on toggle (via re-seed / re-bootstrap or a prompted relaunch) rather than mixing live and test rows.
- **Bypass auth ON while a real session also exists**: Bypass always wins and uses test data; the real session is left intact and untouched (not signed out, not modified) so turning bypass off returns to it.
- **Sample owner/identity integrity**: The seeded dataset must use current owner identities (household people) so member balances, per-person breakdowns, and split editing all resolve — no "removed"/placeholder owners.
- **Cross-surface visibility**: Because iOS and web share one backend, any test write that escaped isolation would appear on the other surface; the isolation guarantee is what prevents this. (Verifying "no live writes" is a first-class acceptance criterion.)
- **Concurrency of the two flags**: Every combination is defined — (off, off) = normal; (test-data on, bypass off) = normal auth, test data; (bypass on) = test data forced on regardless of the test-data switch.
- **Reset**: A user can return to a clean seeded dataset (re-seed) after making test edits, without affecting live data.

## Requirements *(mandatory)*

### Functional Requirements

**Discovery & gating**

- **FR-001**: The system MUST present a **Developer** section in Settings on both the iOS app and the web app that contains the feature-flag switches, using the app's existing Settings section/row visual language.
- **FR-002**: The Developer section MUST be visible **only** on test builds — on iOS, DEBUG builds and TestFlight test-device builds; on web, non-production builds/deploys — and MUST be entirely absent from a real production/App Store release.
- **FR-003**: In a production build/deploy, every flag MUST be forced to its off/disabled state regardless of any persisted value, and the code paths those flags gate MUST be unreachable.

**Use test data flag**

- **FR-004**: The system MUST provide a **Use test data** switch that, when ON, makes the app operate against an isolated in-memory sample dataset for all four destinations (Dashboard, Transactions, Housing, Settings).
- **FR-005**: While **Use test data** is ON, the system MUST NOT send any read or write (create, update, delete) to the live shared backend; all mutations MUST remain local to the in-memory dataset.
- **FR-006**: While **Use test data** is ON, the user MUST be able to add, edit, delete, split, and settle transactions and see the results, with no effect on real data.
- **FR-007**: Turning **Use test data** OFF MUST restore the app to the user's real live data with no residue from the test session, and the real data MUST be unchanged from before the test session.
- **FR-008**: The system MUST persist the flag state per device/browser so it survives app relaunch on a test build (subject to FR-003 in production).

**Refreshed sample dataset**

- **FR-009**: The system MUST replace the current outdated sample/dummy dataset with a refreshed one that reflects the current data model: owners are household **people** (not legacy user ids), transactions carry the payer so member balances and settle-up compute, and the household has members.
- **FR-010**: The refreshed sample dataset MUST include budgets and housing/rental data, and MUST span enough time (multiple months) that the range and month pickers have data to navigate.
- **FR-011**: The refreshed sample dataset MUST render without placeholder/"removed" owners and MUST exercise splits, joint items, and reimbursement/transfer activity so member balances are non-zero.
- **FR-012**: The refreshed sample dataset MUST reuse deterministic, fixed identities (stable across launches) and MUST NOT leak those identities into the live backend.

**Bypass auth flag**

- **FR-013**: The system MUST provide a **Bypass auth** switch that, when ON, opens the app directly to the main tabs without a sign-in step and without creating a real session.
- **FR-014**: When **Bypass auth** is ON, the system MUST treat **Use test data** as ON (bypass implies test data) and back the session-less experience with the in-memory sample dataset.
- **FR-015**: When **Bypass auth** is ON, the system MUST NOT contact the live backend for authentication or data, and MUST leave any existing real session untouched so that turning bypass OFF returns to normal behavior.
- **FR-016**: On the web surface, the auth-bypass MUST short-circuit **both** the server-side route protection and the client-side bootstrap/session watcher together, so bypass yields neither a redirect loop nor an empty shell.

**Design, testing, parity**

- **FR-017**: All new UI MUST use only existing design tokens and Settings primitives (calm, tokens-only, no new colors, hairline rules) per the project constitution.
- **FR-018**: The feature MUST include automated behavior tests where the platform supports them (web test suite; iOS test suite) covering: section visibility gating, flag persistence, production force-off, and that test-data mode issues no live-backend writes.
- **FR-019**: The feature MUST NOT introduce or require any shared golden test vector (it contains no money/date math contract); it is outside the golden-vector parity harness.
- **FR-020**: The project's parity record (PARITY.md) MUST document that the two surfaces gate this section by different mechanisms (compile-time/test-build on iOS vs build-environment on web) as an intentional per-surface divergence.

### Key Entities *(include if feature involves data)*

- **Feature flag**: A named, per-device/browser boolean test toggle with a safe default of OFF. Members: **Use test data**, **Bypass auth**. Only readable/effective on test builds; forced OFF in production.
- **Sample dataset ("test data")**: A self-contained, in-memory collection mirroring the real domain — a household with members (people), transactions (with payer, owners, splits, and reimbursement/transfer items), cards, budgets, and housing/rental records — spanning multiple months, using fixed deterministic identities, never persisted to the live backend.
- **Test-build signal**: The per-surface indicator of "this is a test build" (iOS: DEBUG or TestFlight sandbox receipt; web: non-production build/deploy environment) that gates both the section's visibility and the honoring of any flag.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With **Use test data** ON, 100% of transaction create/update/delete actions produce zero writes to the live backend (verifiable by inspecting outbound calls / backend rows), while the change is visible in-app.
- **SC-002**: After a full test session with test data ON and then OFF, the user's real household data is byte-for-byte identical to before the session (no added, changed, or removed real rows).
- **SC-003**: In the seeded dataset, member balances/settle-up are non-empty, at least two months are navigable in the range/month pickers, and no transaction shows a placeholder/"removed" owner — on both surfaces.
- **SC-004**: In a production build/deploy, the Developer section is absent in 100% of cases and a pre-set "on" flag value changes nothing about behavior.
- **SC-005**: A tester can go from launching a test build to a fully populated test app in under 10 seconds using the flags (enable test data, or enable bypass and relaunch).
- **SC-006**: The automated test suites for both surfaces pass, including new tests asserting gating, persistence, production force-off, and no-live-writes-in-test-mode.

## Assumptions

These are reasonable defaults chosen where the request left detail open; the user can override any of them.

- **Test-build detection (iOS)**: "Test devices" is interpreted as **DEBUG builds and TestFlight builds**. The section shows on both (DEBUG via the compile flag; TestFlight via the sandbox app-store receipt) and is compiled/forced out of App Store production. If the intent was DEBUG-only (no TestFlight), that is a smaller variant of this same design.
- **Test-build detection (web)**: Non-production is detected by build environment (development / preview) via a build-time environment signal, so the section and all flag-honoring code dead-code-eliminate from the production bundle. The auth-bypass flag additionally uses a cookie (not just browser local storage) because the web route-protection layer runs server-side and cannot read local storage.
- **Isolation strategy**: The only safe isolation for a shared live backend is **in-memory/local**. A "clearly-marked test household" is explicitly rejected because it still requires real backend rows and would sync to the other surface. Test mode therefore routes all reads/writes to an in-memory store and never constructs live-backend calls.
- **Bypass implies test data**: Because there is no real session under bypass (and server-side data access is identity-enforced), auth-bypass is only meaningful with the in-memory dataset; enabling bypass forces test data on.
- **Toggle semantics**: Switching the test-data flag is a clean mode switch (re-seed / re-bootstrap, or a prompted relaunch if that is simpler per surface); the app never blends live and test rows.
- **Persistence**: Flag state persists per device/browser using each surface's existing preference-persistence pattern (the same mechanism the appearance/language preferences use), namespaced so it cannot collide with existing keys, and gated so production ignores it.
- **Scope**: Exactly two flags ship now (Use test data, Bypass auth), but the Developer section is structured as an extensible registry so future test flags can be added without re-architecture.
- **Sample identities**: The refreshed sample dataset reuses the app's existing sample personas/household but corrected to the current people-based owner model; fixed UUIDs are retained for determinism and are guaranteed never to be sent to the live backend.
- **Web auth-bypass reach**: Web auth-bypass is meaningful only against non-production environments; it cannot and does not attempt to defeat production server-side access control. This is documented as an intentional asymmetry with iOS.

## Dependencies

- Reuses the existing Settings screens, section/row components, and design tokens on both surfaces.
- Reuses each surface's existing preference-persistence mechanism.
- Depends on the current domain models (people-based owners, payer/settle-up, budgets, housing/rental) to build a faithful sample dataset.
- No backend schema change, no new shared golden vectors, no new third-party dependency.
