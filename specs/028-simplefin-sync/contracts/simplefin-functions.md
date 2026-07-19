# Contract: SimpleFIN Edge Functions (spec 028)

Three new authed Supabase edge functions, mirroring the Plaid trio's auth + error
shape. All calls require a Supabase session JWT; the caller must belong to a household.
Errors use the same `{ error: <code> }` envelope and code vocabulary as spec 024 where
they overlap.

## Shared error codes

`unauthenticated` · `invalid_request` · `not_configured` · `not_household_member` ·
`provider_unreachable` · `provider_error` · `institution_not_found` ·
`rate_limited` · `sync_failed` · `claim_failed`

## POST `/functions/v1/simplefin-claim`

Claim a setup token and establish the connection.

**Body**: `{ setupToken: string }`

**Behavior**:
1. Auth → resolve user + household (`not_household_member` if none).
2. Base64-decode `setupToken` → claim URL. Malformed → `invalid_request`.
3. `POST` the claim URL (no body) → expect an **Access URL** (string). Network/5xx →
   `provider_unreachable`; non-2xx/invalid → `claim_failed` (token likely already used
   or expired).
4. Derive `provider_item_id = 'sfin_' || sha256(accessUrl)[:32]`.
5. Best-effort `GET {accessUrl}/accounts?balances-only=1` to read account display
   metadata + a friendly institution name (tolerate failure — accounts also populate on
   first sync).
6. `complete_simplefin_link(...)` RPC — atomic institution upsert + Vault secret +
   accounts.
7. **Response `200`**: `{ institutionId, institutionName, accounts: [{ name, accountType, currency, mask }] }`.

**Idempotency**: re-claim of the same Access URL reactivates the same institution
(`UNIQUE(provider, provider_item_id)`); a consumed token that failed to record leaves the
connection already present (client re-reads Linked banks).

## POST `/functions/v1/simplefin-sync`

Pull transactions for one connection and write them to the ledger.

**Body**: `{ institutionId: string, manual?: boolean }`

**Behavior**:
1. Auth → membership check on the institution's household (`institution_not_found` /
   `not_household_member`).
2. If `manual === true` and `last_manual_refresh_at` is within the cooldown (1h) →
   `rate_limited` (calm "just updated" message).
3. Read Access URL via `get_institution_secret`.
4. Compute window: `start = last_synced_at ? (last_synced_at - 3d) : (now - 90d)`,
   `end = now` (clamp span ≤ 90d).
5. `GET {accessUrl}/accounts?start-date=<epoch>&end-date=<epoch>&pending=1`.
   Network/5xx → `provider_unreachable`. Parse defensively (D3). Surface any in-band
   errors as `warnings` in the response (not a hard failure).
6. For each transaction: normalize (D4) → build `upsert_transaction` payload with
   deterministic id + default split (D7) → call `upsert_transaction`. Dedupe/idempotent
   by construction (D6).
7. `mark_simplefin_synced(institutionId, end)`; if manual, set `last_manual_refresh_at`.
8. **Response `200`**: `{ institutionId, imported: <int>, updated: <int>, warnings: string[] }`.

**Failure**: a mid-sync error leaves already-written rows committed (each
`upsert_transaction` is atomic per txn) and returns `sync_failed` with a count of what
succeeded; the ledger is never left inconsistent (no partial transaction/share writes).

## POST `/functions/v1/simplefin-disconnect`

**Body**: `{ institutionId: string }`

**Behavior** (mirrors `plaid-disconnect`, minus a provider revoke call — SimpleFIN is
disabled from the Bridge side by the user; Ortho simply drops the credential):
1. Auth + membership (`institution_not_found` / `not_household_member`).
2. Idempotent: already `disconnected` → calm success.
3. `delete_institution_secret(institutionId)`; set `status = 'disconnected'`,
   `disconnected_at = now()`. Future syncs skip disconnected institutions.
4. **Response `200`**: `{ institutionId, status: 'disconnected' }`.

Already-imported transactions remain in the ledger (FR-014).

## Environment

- `SIMPLEFIN_ENABLED` (or presence of no special key — SimpleFIN needs no Ortho-side API
  key; each connection self-authenticates via its Access URL). A `not_configured` code
  exists for parity but SimpleFIN is effectively always "configured".
- Reuses `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## Client surface (`web/lib/aggregation.ts`)

- `claimSimpleFinToken(setupToken)` → `AggregationResult<{ institutionId, institutionName, accounts }>`
- `syncInstitution(institutionId, { manual })` → `AggregationResult<{ imported, updated, warnings }>`
- `disconnectInstitution(institutionId)` → **reused/extended** to route by provider.
