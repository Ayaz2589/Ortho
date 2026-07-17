# Feature Specification: Connect a Bank Account (Plaid Connect)

**Feature Branch**: `024-plaid-connect`

**Created**: 2026-07-16

**Status**: Draft

**Input**: User description: "Connect a bank account via Plaid (connect-only). A household member can opt in to link one or more of their real bank accounts to Ortho through Plaid Link — embedded Link on web, Hosted Link via the external browser in the iOS shell. Server side in Supabase Edge Functions; the permanent access token is stored server-side only and never reaches any client. New household-scoped tables record linked institutions (provider-agnostic, 'plaid' first) and their accounts. Members see, connect, and disconnect banks in a Settings sub-page. Connect-only: NO transaction sync, NO balances, NO owner assignment. Opt-in and privacy-forward. Dev/test exclusively on Plaid Sandbox."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect a bank from the web app (Priority: P1)

A signed-in household member opens Settings, finds a "Linked banks" area, reads a
plain-language disclosure (bank sign-in happens with Plaid, a bank-connection
service — Ortho never sees the bank username or password; Ortho only receives the
list of connected accounts), chooses to connect, completes their bank's sign-in
inside the Plaid connection flow, and lands back in Ortho where the newly linked
institution and its accounts (name, type, last-4 mask) now appear.

**Why this priority**: This is the feature — the first standing connection between
Ortho and a real bank. Without it nothing else in this spec exists. Web is the
canonical implementation and the fastest surface to validate end-to-end.

**Independent Test**: Using the provider's sandbox institution, a member can go
from Settings → connect → sandbox bank sign-in → back to Settings and see the
institution with its accounts listed. Delivers the complete core value on its own.

**Acceptance Scenarios**:

1. **Given** a signed-in household member on the web app with the feature
   configured, **When** they open Settings, **Then** they see a "Linked banks"
   entry that leads to a page with a disclosure and a way to connect a bank.
2. **Given** the member starts connecting, **When** the Plaid connection flow
   completes successfully, **Then** the institution and each of its accounts
   (display name, account type, last-4 mask) appear in the Linked banks list
   without a manual refresh.
3. **Given** the member starts connecting, **When** they abandon or cancel the
   flow, **Then** they return to the Linked banks page unchanged, with no partial
   institution recorded and no alarmist error.
4. **Given** a bank whose sign-in requires the bank's own website (OAuth-style),
   **When** the member is sent to the bank and then returned to Ortho,
   **Then** the connection flow resumes and completes without the member
   re-entering anything.
5. **Given** the connection flow succeeded at the bank but recording it in Ortho
   fails (e.g. network drop), **When** the member retries from the same page,
   **Then** the connection can be completed without linking the bank a second
   time, or the member is told plainly to try connecting again.

---

### User Story 2 - Connect a bank from the iOS app (Priority: P2)

The same member on the iOS app taps "Connect a bank" in Settings → Linked banks.
Because the bank sign-in must not happen inside the app's embedded web view, the
secure connection flow opens in the phone's browser. When the member finishes
there and returns to the app, the app completes the connection on its own and the
new institution and accounts appear in the list.

**Why this priority**: iOS is a first-class delivery target of the same codebase;
the feature is not shippable to the household without it. It builds directly on
User Story 1's plumbing, so it comes second.

**Independent Test**: On an iOS build (or a simulated in-app environment in
tests), starting a connection opens the external browser flow, and returning to
the app after finishing results in the institution appearing in the list without
further member action.

**Acceptance Scenarios**:

1. **Given** a member in the iOS app, **When** they choose to connect a bank,
   **Then** the connection flow opens outside the app (in the system browser),
   never inside the app's embedded view.
2. **Given** the member finished the flow in the browser, **When** they return to
   the app (via the automatic hand-back or by switching back manually),
   **Then** the app detects the finished session and the new institution and
   accounts appear without the member re-doing anything.
3. **Given** the member finished the flow but the hand-back to the app was lost
   (e.g. they closed the browser tab), **When** they bring the app to the
   foreground within the session's validity window, **Then** the app still
   completes and records the connection.
4. **Given** the member abandons the browser flow, **When** they return to the
   app, **Then** the Linked banks page is unchanged and calm — no error state, no
   partial record.

---

### User Story 3 - Disconnect a bank (Priority: P2)

A member views a linked institution in Settings → Linked banks and chooses to
disconnect it. Ortho revokes its own access with the provider and the
institution's entry is marked disconnected — the household's standing access to
that bank ends.

**Why this priority**: A standing bank connection without a working "off switch"
is a trust and privacy failure; disconnect must ship in the same release as
connect. It is second priority only because it needs something connected first.

**Independent Test**: With one institution linked (sandbox), disconnecting it
ends provider access (verifiable server-side) and the UI shows it as
disconnected/removed from the active list.

**Acceptance Scenarios**:

1. **Given** a linked institution, **When** a household member chooses
   "Disconnect" and confirms, **Then** Ortho's access at the provider is revoked
   and the institution no longer appears as an active connection.
2. **Given** the provider cannot be reached, **When** the member tries to
   disconnect, **Then** the connection is NOT silently kept — the member sees a
   calm, plain message that disconnecting didn't go through and can retry.
3. **Given** a disconnected institution, **When** members view Linked banks,
   **Then** no stale account entries from it appear among active accounts.

---

### User Story 4 - Household visibility of linked banks (Priority: P3)

Any member of the household — not just the person who connected — can see which
institutions and accounts are linked, who connected them, and when. Linked banks
are household-level facts, like transactions and budgets.

**Why this priority**: Shared visibility matches Ortho's household model and
builds trust ("what is connected to our money app?"). It is a read-only view on
data User Story 1 already records, so it lands last.

**Independent Test**: Sign in as the *other* household member and confirm the
institution linked in User Story 1 is visible with the connector's name, with no
ability to see anything secret.

**Acceptance Scenarios**:

1. **Given** member A linked a bank, **When** member B opens Settings → Linked
   banks, **Then** B sees the institution, its accounts, and that A connected it.
2. **Given** any member's session, **When** inspecting everything the app ever
   receives (network responses, local storage), **Then** no bank credentials and
   no provider access secrets are present — only display data (names, types,
   masks, statuses).

---

### Edge Cases

- **Feature not configured**: if the operator has not yet configured the provider
  credentials on the server, the Linked banks page states plainly that bank
  linking isn't available yet — no broken buttons, no error tone (mirrors the
  subscription feature's "dark until operator setup" posture).
- **Connection session expiry**: the connection flow's server-issued session is
  time-limited (~30 minutes). If the member returns after expiry, they are asked
  to start the connection again; nothing partial is recorded.
- **Duplicate linking**: linking the same institution twice creates a second,
  distinct connection (the provider treats each link as new — and on the live
  trial plan each consumes one of only 10 permanent slots). The UI shows both and
  the disclosure copy discourages accidental re-linking; automatic deduplication
  is out of scope.
- **Member not in a household**: connecting requires household membership; a user
  with no household never sees the Linked banks entry.
- **Provider outage / rate limiting**: any provider failure surfaces as a short,
  calm, localized message ("Couldn't reach the bank-connection service. Try
  again in a bit.") — never a red panel, never raw provider error text.
- **iOS hand-back arrives twice** (automatic return AND foreground detection):
  completing an already-completed session must be harmless — exactly one
  institution is recorded.
- **Signed out mid-flow**: if the member's Ortho session ends while connecting,
  completing the flow requires signing back in; the half-finished connection is
  either completed on next visit within the validity window or dropped cleanly.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Ortho MUST let a signed-in household member start a bank
  connection from Settings via a dedicated "Linked banks" page, on both delivery
  targets (responsive web and the iOS shell) from the same implementation.
- **FR-002**: Before the first connection, Ortho MUST present a plain-language,
  localized disclosure: bank sign-in happens with the connection provider
  (Plaid); Ortho never sees or stores bank usernames/passwords; Ortho receives
  only account metadata (names, types, last-4); the member may disconnect at any
  time; manual entry and statement import remain fully supported alternatives.
- **FR-003**: On desktop/mobile web, the connection flow MUST run embedded in
  the page, including support for institutions that bounce through the bank's
  own site and back (the return resumes the same session without data loss).
- **FR-004**: In the iOS shell, the connection flow MUST NOT run inside the
  app's embedded web view; it MUST open in the external system browser, and the
  app MUST complete the connection automatically when the member returns —
  including when the automatic hand-back is lost, by checking the pending
  session on foreground within its validity window. Completing the same session
  more than once MUST be idempotent (exactly one institution recorded).
- **FR-005**: All provider interactions that involve secrets (issuing a
  connection session, exchanging its result for standing access, listing an
  institution's accounts at link time, revoking access) MUST happen server-side.
  The client MUST only ever hold the short-lived session token needed to run the
  connection UI.
- **FR-006**: The standing provider access credential (access token) MUST be
  stored server-side encrypted at rest, readable only by server-side code — it
  MUST never appear in any client payload, client-readable table, log line, or
  the app bundle. Provider API credentials MUST live only in operator-set server
  secrets.
- **FR-007**: On successful connection, Ortho MUST record the institution
  (provider, provider's institution identity, display name, connection status,
  who connected it, when) and each of its accounts (display name, official name,
  last-4 mask, account type/subtype) as household-scoped data.
- **FR-008**: Every household member MUST be able to view the household's linked
  institutions and accounts (including connector and status); only display
  metadata is readable — never anything secret-equivalent (FR-006).
- **FR-009**: A household member MUST be able to disconnect an institution:
  access is revoked at the provider first, then the institution is marked
  disconnected locally; if revocation fails, the member is told and can retry
  (no silent zombie connections). Disconnected institutions MUST NOT show their
  accounts among active accounts.
- **FR-010**: The recorded data model MUST be provider-agnostic (the provider is
  a recorded attribute, with Plaid as the first provider), so a future second
  provider does not require reshaping household data.
- **FR-011**: Scope guard — this feature MUST NOT fetch, store, or display
  transactions or balances, and MUST NOT assign accounts to household people.
  The connection MUST, however, be established with the provider consents needed
  for a future transactions feature so members won't have to re-link (consent
  collected now, unused until that feature exists).
- **FR-012**: When the provider is unconfigured (no operator setup yet), the
  Linked banks page MUST say bank linking isn't available yet, calmly, with all
  connect affordances absent or disabled — the rest of the app is unaffected.
- **FR-013**: All failure states (provider unreachable, session expired,
  completion failed, revocation failed) MUST surface as short, calm, localized
  copy per the design constitution (never red, never raw provider errors), and
  every new user-facing string MUST ship in all supported languages.
- **FR-014**: All automated development and testing MUST run against the
  provider's sandbox environment; connecting a live bank account MUST require a
  deliberate operator act (production credentials are never present in
  development or CI). An operator runbook MUST document setup (provider
  credentials, environment switch, dashboard registration of the web return
  address) in the pattern of the subscription feature's runbook.

### Key Entities

- **Linked institution**: one standing connection between the household and one
  financial institution via one provider. Attributes: household, provider
  (`plaid` first), provider's connection identity, institution name, status
  (active / disconnected), who connected it, when. The provider's standing
  access credential is associated with it but is NOT part of the entity any
  client can read.
- **Linked account**: one bank account revealed by a linked institution.
  Attributes: parent institution, provider's account identity, display name,
  official name, last-4 mask, type/subtype (e.g. depository/checking). Display
  metadata only.
- **Pending connection session** (transient): a started-but-unfinished
  connection attempt — who started it, the provider session reference, expiry.
  Exists so the iOS return path and retry paths can complete a flow; never
  outlives its validity window as an actionable record.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A household member can go from Settings to a fully connected
  sandbox institution (accounts visible) in under 2 minutes on web and on iOS.
- **SC-002**: Zero secret material client-side: an audit of every network
  response body the client receives, all client-readable rows, and the built app
  bundle finds no standing access credential and no provider API credentials —
  only display metadata and short-lived session tokens.
- **SC-003**: After finishing the provider flow, the linked institution and its
  accounts are visible in Settings within 5 seconds on web; on iOS, within 5
  seconds of the app returning to the foreground.
- **SC-004**: Disconnecting an institution revokes provider access in 100% of
  successful disconnects (verified against the provider's sandbox), and a failed
  revocation is always surfaced to the member — never a silent zombie link.
- **SC-005**: Members abandoning the flow at any step leave zero partial
  household records, measured across all abandonment points in the test suite.
- **SC-006**: The full existing test suite stays green, and the new feature's
  logic lands test-first with the same regression discipline as the rest of the
  codebase (every new pure function covered; every new user-visible string in
  all 5 language catalogs).

## Assumptions

- US-only institutions and USD households for now (matches the rest of Ortho);
  provider country scope is US at connection time.
- Linked banks are household-scoped shared facts (like budgets), not private to
  the connecting member — any member can view and disconnect. Ortho households
  are two-person and high-trust; per-member permissions are out of scope.
- The household exists and the member belongs to it (existing onboarding).
- Re-linking the same institution intentionally is allowed (it creates a second
  connection); automatic duplicate prevention is out of scope for v1.
- The provider's free trial tier (10 permanent live connections, sandbox
  unlimited) is sufficient for dogfooding; upgrading to a paid production plan
  (business verification) is a later, operator-level decision aligned with
  Ortho's commercial intent.
- Webhooks from the provider are NOT required for connect-only (session results
  are pollable server-side for hours after completion); event-driven sync
  arrives with the future transactions feature.
- No raw provider documents/files are stored; only structured metadata.
- The frozen native SwiftUI app is untouched; iOS ships via the existing
  web-bundle shell. No new native code beyond configuration (the app must be
  reachable from the browser hand-back, which is a build-configuration concern).
