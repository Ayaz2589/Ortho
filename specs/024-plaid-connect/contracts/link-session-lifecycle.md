# Contract: Link Session Lifecycle (spec 024)

The cross-surface rules that make connecting safe, idempotent, and
resumable. Server truth lives in `plaid_link_sessions` (zero-policy table —
see `data-model.md`); the client holds a small pending-session record locally.

## States

```
            ┌────────────────────────────────────────────┐
 start ──► pending ──(plaid-exchange succeeds)──► completed
            │  │
            │  └─(post-consumption failure — server)──► abandoned
            └─(expires_at < now())──► "expired" (derived, still stored 'pending')
```

- `completed` is terminal and idempotent: re-exchanging returns the stored
  institution + accounts, never a second institution (FR-004).
- Expiry is **derived at read time**, never flipped by a cron — but for
  HOSTED sessions the server resolves `/link/token/get` BEFORE any expiry
  verdict: Plaid keeps a finished hosted session's results retrievable ~6h
  after the link token expires, and that window must work (review 024). An
  embedded session past `expires_at` answers `session_expired` (410).
- `abandoned` is TERMINAL, set by the **server** when a failure happens after
  the single-use public token was consumed (exchange succeeded but persist
  failed, or Plaid rejected a consumed token): no retry of this session can
  ever succeed. Exchanging an abandoned session answers `session_expired` so
  clients reset calmly and start a fresh flow.
- Persistence is **atomic** (`complete_plaid_link` RPC): institution + Vault
  secret + accounts + the session flip land in one transaction — a crash can
  never leave a member-visible half-link. Compensation therefore only handles
  the provider side: a brand-new Item is best-effort `/item/remove`d on
  failure; a pre-existing institution's live access is never revoked by a
  failed re-link attempt.

## Client pending record (`web/lib/plaidLinkSession.ts`)

While a session is pending, the client persists exactly:

```json
{ "sessionId": "<uuid>", "linkToken": "link-...", "mode": "embedded" | "hosted", "expiresAt": "<iso>" }
```

in `localStorage` under a single fixed key.

- Written when `plaid-link-token` succeeds; cleared on: successful exchange,
  any TERMINAL code (`session_expired`, `session_not_found`,
  `session_not_owned`, `exchange_failed`), explicit user cancel, sign-out
  (a record must never survive into another member's session on the device),
  or the local expiry check — where HOSTED records get the +6h results grace
  and embedded records die with the token (review 024). Kept on
  `session_incomplete` (still in the browser) and transient failures.
- The `linkToken` is stored because the **web OAuth return** must re-init
  Link with the *same* token (+ `receivedRedirectUri`) — Plaid's documented
  SPA pattern. It is short-lived (~30 min) and session-scoped.
- Never stored: `public_token`, `access_token`, or anything from exchange
  responses beyond display data (SC-002).

## Surface flows

**Web (embedded)**
1. `plaid-link-token { mode: "embedded" }` → persist pending record → open
   Link with `linkToken`.
2. `onSuccess(publicToken)` → `plaid-exchange { sessionId, publicToken }` →
   clear pending record → refresh linked banks.
3. `onExit` without success → report abandon, clear pending record. No
   partial UI state (spec US1-3).
4. **OAuth detour**: bank redirects to `APP_BASE_URL/plaid-oauth?oauth_state_id=…`
   → the route reads the pending record, re-inits Link with the same
   `linkToken` + `receivedRedirectUri: window.location.href` → continue at
   step 2. Arriving with no pending record → calm notice + link back to
   Linked banks.

**iOS shell (hosted)**
1. `plaid-link-token { mode: "hosted" }` → persist pending record → navigate
   top-level to `hostedLinkUrl` (Capacitor opens it in the system browser).
2. Plaid redirects the browser to `ortho://plaid-done` → `appUrlOpen`
   listener routes to Linked banks → `plaid-exchange { sessionId }`.
3. **Lost hand-back fallback**: on `appStateChange` → foreground, if a
   non-expired pending record exists → `plaid-exchange { sessionId }`:
   - `200` → connected (clear record, refresh);
   - `409 session_incomplete` → user hasn't finished; keep waiting silently;
   - `410 session_expired` / `404` → clear record, calm reset.
4. Both step 2 and step 3 may fire for one session — the server's
   idempotency makes the double completion harmless (exactly one
   institution; FR-004, edge case "hand-back arrives twice").

## Exchange compensation invariant (server)

A session reaches `completed` **only** with all three present: institution
row, Vault secret, account rows. Any failure after
`/item/public_token/exchange` triggers, in order: best-effort `/item/remove`
(kill the orphaned provider access — on Trial an orphan burns one of 10
permanent slots), `delete_institution_secret`, delete the institution/account
rows created by this attempt (skip rows that pre-existed via the
`(provider, provider_item_id)` conflict-reuse path), leave the session
`pending`, return `exchange_failed`. The member sees one calm retry message
(spec US1-5); the household never sees a partial record (SC-005).

## Signed-out mid-flow

All three functions require a valid JWT. A signed-out return/foreground poll
fails `unauthorized`; the pending record survives, and the next authenticated
visit within `expiresAt` completes the session (spec edge case). After
expiry, the record is cleared and the member starts over — nothing partial
remains on either side.
