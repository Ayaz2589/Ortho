# Feature Specification: SimpleFIN Bank-Sync (Connect + Transaction Sync)

**Feature Branch**: `028-simplefin-sync`

**Created**: 2026-07-19

**Status**: Draft

**Input**: User description: "SimpleFIN bank-sync integration (connect + transaction sync). Add SimpleFIN as a second bank-data provider behind the existing `linked_provider` seam, alongside Plaid. Members connect via a pasted setup token; Ortho claims it server-side, stores the Access URL in Vault, lists institutions/accounts, and syncs transactions into the household ledger. Plaid is contained (deprecated, kept wired) not removed. Read-only, privacy-forward, TDD against mocked responses."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect a bank with SimpleFIN (Priority: P1)

A signed-in household member opens Settings → Linked banks. SimpleFIN is presented
as the primary way to connect a bank. They read a plain-language disclosure (bank
sign-in happens on SimpleFIN Bridge, a bank-connection service — Ortho never sees
the bank username or password, and access is read-only), follow a link to obtain a
one-time **setup token** from the Bridge, paste that token back into Ortho, and
Ortho establishes a standing, read-only connection. The newly linked institution
and its accounts (name, type, currency, last-4 mask) then appear in the list.

**Why this priority**: This is the feature's foundation — the first standing
SimpleFIN connection between Ortho and a real bank. Without it, nothing else in
this spec exists. Web is the canonical implementation and the fastest surface to
validate end-to-end.

**Independent Test**: With a (mocked) setup token, a member can go from Settings →
paste token → back to Settings and see the institution with its accounts listed.
Delivers complete connect value on its own, even before any transaction sync.

**Acceptance Scenarios**:

1. **Given** a signed-in household member on the web app with SimpleFIN configured,
   **When** they open Settings → Linked banks, **Then** they see SimpleFIN offered
   as the recommended connection method with a disclosure and a way to connect.
2. **Given** the member has a valid setup token, **When** they paste it and confirm,
   **Then** Ortho claims it server-side and the institution and each account
   (name, type, currency, last-4 mask) appear in the Linked banks list without a
   manual refresh.
3. **Given** the member pastes an invalid or already-claimed token, **When** the
   claim fails, **Then** they see a plain, non-alarmist message explaining the token
   couldn't be used and can try again with a fresh token — with no partial
   institution recorded.
4. **Given** the claim succeeds at the Bridge but recording it in Ortho fails
   (e.g. network drop), **When** the member retries, **Then** the connection
   completes without creating a duplicate institution, or they are told plainly to
   try again.

---

### User Story 2 - Sync transactions into the ledger (Priority: P2)

Once a bank is connected, Ortho keeps the household ledger current from it. On a
daily schedule — and when a member taps a rate-limited "Refresh now" — Ortho pulls
the connection's recent transactions and adds them to the household's Activity as
real ledger transactions, correctly signed (money in vs money out), correctly
dated, de-duplicated so nothing is doubled, and with pending charges reconciled to
their posted form once they settle. Synced transactions carry a sensible default
per-person split so household balances stay correct.

**Why this priority**: Connect alone is table-stakes; the recurring value of a
budgeting app is that the ledger stays current without manual entry. It builds
directly on Story 1's connection, so it comes second.

**Independent Test**: With a connected institution and a (mocked) `/accounts`
response, a scheduled/manual sync inserts the returned transactions into the ledger
with correct signs and amounts, a second sync of overlapping data inserts no
duplicates, and a pending transaction that later posts is reconciled rather than
doubled.

**Acceptance Scenarios**:

1. **Given** a connected SimpleFIN institution, **When** a sync runs, **Then** each
   returned transaction appears in the household Activity with the correct amount
   (money-in shown as income, money-out as spending) and date.
2. **Given** a sync has already imported a set of transactions, **When** a later
   sync returns overlapping transactions, **Then** no duplicate ledger entries are
   created (idempotent on the account + provider transaction id).
3. **Given** a pending transaction was imported, **When** a later sync returns its
   posted version, **Then** the ledger reflects the posted transaction rather than
   both a pending and a posted copy.
4. **Given** a member taps "Refresh now" repeatedly, **When** the rate limit is in
   effect, **Then** further refreshes are declined with a calm "just updated —
   try again shortly" message rather than hammering the provider.
5. **Given** a synced transaction is created, **When** household balances are
   computed, **Then** the transaction has a valid per-person split whose shares sum
   to the transaction total.

---

### User Story 3 - Disconnect a SimpleFIN bank (Priority: P3)

A household member opens Linked banks and disconnects a SimpleFIN-linked
institution. Ortho stops syncing from it, removes the stored access credential, and
the institution is shown as disconnected. Already-imported transactions remain in
the ledger (they are the household's records now).

**Why this priority**: Privacy and control require that a member can always sever a
connection. It depends on a connection existing, so it follows Stories 1–2.

**Independent Test**: With a connected institution, disconnecting marks it
disconnected, deletes its stored credential, and stops future syncs; the action is
idempotent (disconnecting an already-disconnected institution is a calm no-op).

**Acceptance Scenarios**:

1. **Given** a connected SimpleFIN institution, **When** the member disconnects it,
   **Then** its stored access credential is deleted, its status becomes
   disconnected, and no further syncs run for it.
2. **Given** an already-disconnected institution, **When** disconnect is invoked
   again, **Then** the result is a calm success with nothing further changed.
3. **Given** an institution is disconnected, **When** the member views Activity,
   **Then** transactions already imported from it remain present.

---

### User Story 4 - Plaid preserved as a deprecated rollback path (Priority: P3)

The previously-shipped Plaid connection method still works exactly as before, but is
de-emphasized in the UI in favor of SimpleFIN. A household that linked banks via
Plaid continues to see and manage them; the Plaid code path remains fully wired as a
rollback option.

**Why this priority**: Plaid is a live, shipped feature. Containing rather than
removing it protects existing users and preserves a rollback path with zero
regression risk.

**Independent Test**: The existing Plaid connect / list / disconnect flows continue
to pass their existing tests unchanged, and the app still builds, after Plaid code
is relocated into clearly-marked deprecated namespaces.

**Acceptance Scenarios**:

1. **Given** the Plaid integration existed and passed its tests, **When** SimpleFIN
   is added and Plaid code is relocated to deprecated namespaces, **Then** all
   existing Plaid tests still pass and the app still builds.
2. **Given** a member previously linked a bank via Plaid, **When** they open Linked
   banks, **Then** that institution still appears and can still be disconnected.
3. **Given** the Linked banks page, **When** a member goes to connect a new bank,
   **Then** SimpleFIN is the primary/recommended method and Plaid is available but
   de-emphasized.

---

### Edge Cases

- **Malformed / expired / already-claimed setup token** → claim fails cleanly, no
  institution recorded, member can retry with a fresh token.
- **Bridge unreachable during claim or sync** → nothing changes locally; the member
  sees a calm retry message. A failed sync never partially corrupts the ledger.
- **`/accounts` returns in-band errors** (SimpleFIN returns errors alongside data) →
  surfaced to the member as a connection warning; partial data is still processed
  where safe.
- **90-day window** — history longer than 90 days requires multiple windowed pulls;
  the first sync backfills a bounded window, later syncs fetch only the recent
  window.
- **Provider quota** (SimpleFIN intends ≤ ~24 requests/day per connection) → sync
  scheduling and the manual-refresh rate limit must stay within quota; exceeding it
  is handled as a calm warning, never a crash.
- **Inverted sign convention** — SimpleFIN amounts are positive for inflow (opposite
  of the other provider); a sign error would flip income and spending, so the
  normalization is explicitly tested.
- **Multi-currency accounts** — accounts may report a non-USD currency; per the
  repo's USD-cents launch decision, non-USD amounts are handled per the documented
  currency assumption (see Assumptions) rather than silently mis-stored.
- **Transaction id reused across accounts** — SimpleFIN ids are unique only within an
  account, so dedupe keyed on id alone would wrongly merge; dedupe must key on
  (account, id).
- **Non-integer decimal string amounts** (e.g. `"-33.4"`, `"100"`) → parsed to exact
  integer cents without floating-point drift.

## Requirements *(mandatory)*

### Functional Requirements

**Connect (Story 1)**

- **FR-001**: The system MUST let a household member connect a bank by pasting a
  SimpleFIN setup token, with a plain-language, privacy-forward disclosure shown
  before connecting.
- **FR-002**: The system MUST claim the setup token server-side (never in any
  client) and MUST store the resulting access credential such that it is never
  exposed to any client or embedded in any client-readable record.
- **FR-003**: On a successful claim, the system MUST record the linked institution
  and each of its accounts (display name, account type, currency, last-4 mask) and
  show them in Linked banks without requiring a manual refresh.
- **FR-004**: Claiming MUST be idempotent and safe to retry: a lost response or a
  re-submitted claim MUST NOT create a duplicate institution, and a failed claim
  MUST leave no partial institution.
- **FR-005**: A setup token is single-use; the system MUST handle an
  invalid/expired/already-claimed token with a calm, actionable message and no
  recorded state.

**Sync (Story 2)**

- **FR-006**: The system MUST sync transactions for each active connection on a
  recurring (at least daily) schedule and via a manual member-initiated refresh.
- **FR-007**: The manual refresh MUST be rate-limited per connection so repeated
  taps do not exceed the provider's intended request budget.
- **FR-008**: The system MUST convert each provider amount (a signed decimal string)
  into the repo's integer USD-cents representation exactly, with no floating-point
  drift, and MUST apply the provider's sign convention (positive = inflow) so income
  and spending are never flipped.
- **FR-009**: The system MUST de-duplicate transactions idempotently on the
  combination of account and provider transaction id, so overlapping sync windows
  never create duplicate ledger entries.
- **FR-010**: The system MUST reconcile a pending transaction to its posted form when
  a later sync returns the posted version, rather than retaining both.
- **FR-011**: Every synced transaction written to the ledger MUST have a valid
  per-person split whose shares sum to the transaction total (the household's
  existing splitting invariant), using a sensible default assignment.
- **FR-012**: A failed or partial sync MUST NOT corrupt the ledger; it MUST leave the
  ledger in a consistent state and surface a calm warning.

**Disconnect (Story 3)**

- **FR-013**: A household member MUST be able to disconnect a SimpleFIN institution;
  disconnecting MUST delete the stored access credential, mark the institution
  disconnected, and stop future syncs.
- **FR-014**: Disconnect MUST be idempotent (disconnecting an already-disconnected
  institution is a calm no-op) and MUST leave already-imported transactions in the
  ledger.

**Provider seam & Plaid containment (Story 4)**

- **FR-015**: SimpleFIN MUST be added as a new value of the existing provider seam
  and MUST reuse the existing linked-institution / linked-account / secret-storage
  structures without reshaping them for other providers.
- **FR-016**: The existing Plaid integration MUST remain fully functional and
  test-green after being relocated into clearly-marked deprecated namespaces; it MUST
  NOT be removed and MUST remain a viable rollback path.
- **FR-017**: In Linked banks, SimpleFIN MUST be presented as the primary/recommended
  connection method, with Plaid available but de-emphasized.

**Access & privacy**

- **FR-018**: Bank access MUST be read-only.
- **FR-019**: Only members of the owning household may view a connection, and any
  member of that household may disconnect it.

**Testing & verification (project constitution)**

- **FR-020**: All new money/date logic (amount→cents conversion, sign handling,
  dedupe keys, pending→posted reconciliation) MUST be developed test-first and
  locked by deterministic tests; the feature MUST NOT depend on any live provider
  account in CI (mocked responses only).

### Key Entities *(include if feature involves data)*

- **Linked institution**: a standing connection to a bank for a household, attributed
  to a provider (now `plaid` or `simplefin`), with a stable per-provider identity and
  a status (active/disconnected). Reuses the existing structure.
- **Linked account**: a display-only account under an institution (name, type,
  currency, mask). Reuses the existing structure.
- **Access credential**: the SimpleFIN Access URL (with embedded Basic-Auth), a
  secret stored server-side only (in the existing secret vault), never client-visible.
- **Sync cursor / watermark**: per-connection state tracking how far transactions have
  been synced, so each sync fetches only the needed window and dedupe stays cheap.
- **Ledger transaction**: an existing household transaction (integer USD cents, with a
  per-person split), now also created by SimpleFIN sync, tagged with its provider
  origin and the provider account + transaction id for dedupe.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can go from "no linked bank" to "institution + accounts
  visible" by pasting a setup token in under 2 minutes, with no manual refresh.
- **SC-002**: After a sync, 100% of returned transactions appear in the ledger with
  correct sign (money-in vs money-out) and date; a re-sync of overlapping data
  creates 0 duplicate ledger entries.
- **SC-003**: 100% of pending transactions that later post are reconciled to a single
  posted ledger entry (0 pending/posted duplicates).
- **SC-004**: Every synced transaction has a per-person split whose shares sum exactly
  to the total (0 split-sum violations).
- **SC-005**: All pre-existing Plaid tests remain green and the app still builds after
  Plaid is contained — 0 regressions in the deprecated path.
- **SC-006**: The full verification bar passes with no live provider account: unit
  tests (mocked provider), typecheck, `npm test`, edge-function checks, production
  build, and the aggregation drift-lock.

## Assumptions

- **Provider & tier**: SimpleFIN Bridge is the SimpleFIN server; the household holds
  its own Bridge subscription and provides a setup token. Ortho stores no Bridge
  credentials; each connection is authenticated only by its claimed Access URL.
- **Connect UX**: SimpleFIN has no embedded OAuth widget; the member obtains the setup
  token on the Bridge and pastes it into Ortho. This intentionally replaces the
  Link-widget / OAuth-handback machinery the other provider needed — there is no
  in-app bank sign-in, so the flow is identical on web and the iOS shell.
- **Currency**: consistent with the repo's USD-cents launch decision, connected
  accounts are assumed USD; a non-USD account amount is handled per a single
  documented rule (recorded as USD-cents on the assumption of a USD account, with the
  reported currency retained on the account for display), not silently corrupted. A
  full multi-currency ledger is out of scope for this feature.
- **Default split**: synced transactions receive a default per-person split (assigned
  to the connecting member, or the household's existing default split rule) so the
  shares-sum-equals-total invariant holds; members can re-split later via existing
  editing.
- **History window**: the initial backfill is a bounded recent window (≤ 90 days per
  the provider's per-request limit); deep historical backfill beyond that window is
  out of scope for v1.
- **Scheduling**: a daily sync cadence plus manual refresh satisfies "keep the ledger
  current"; near-real-time sync is not a goal (the provider refreshes ~1–4×/day
  upstream, and there are no provider webhooks).
- **Testing**: all provider interactions are exercised against mocked responses using
  the existing fetch-injection pattern; no live Bridge account exists in CI.
- **Reuse**: the existing linked-institution/account tables, the secret vault, and the
  atomic transaction-write path are reused as-is; this feature adds a provider module,
  sync state, and a sync/claim/disconnect server surface, not a new data model for the
  ledger.

## Dependencies

- The existing provider seam and linked-bank data model (spec 024, Plaid Connect).
- The existing atomic transaction write path enforcing the per-person split-sum
  invariant.
- The existing secret-vault wrapper for storing/retrieving/deleting per-institution
  secrets.
- The research grounding in `docs/research/competetive-analysis/simplefin-developer-analysis.md`.
