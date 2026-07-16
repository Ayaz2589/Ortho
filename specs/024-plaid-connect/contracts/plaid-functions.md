# Contract: Plaid Edge Functions (spec 024)

Three Deno edge functions under `supabase/functions/`. All are **authed**
(`verify_jwt = true`, the default — no `config.toml` overrides): the caller's
Supabase JWT arrives in `Authorization`, the function resolves the user with an
anon-key client bound to that header (never trusting ids in the body), and
performs privileged work with a separate service-role client — the
`billing-checkout` pattern. CORS + shared error envelope come from
`_shared/http.ts`:

```json
{ "error": { "code": "<machine_code>", "message": "<debug text>" } }
```

Clients localize by `code` and never render `message`. All requests are `POST`
with a JSON body; `OPTIONS` returns the CORS preflight.

**Shared error codes** (any function): `unauthenticated` (401 — the house
code from `_shared/http.ts`), `not_configured` (503 —
`PLAID_CLIENT_ID`/`PLAID_SECRET`/`PLAID_ENV` missing or invalid; FR-012),
`not_household_member` (403), `invalid_request` (400 — malformed body, wrong
method, or a missing embedded `publicToken`), `provider_unreachable` (502 —
network/5xx from Plaid), `provider_error` (502 — Plaid returned a structured
error we don't map more specifically; Plaid's `error_code` is logged
server-side, never forwarded).

Plaid REST specifics (base URL by `PLAID_ENV`, `Plaid-Version: 2020-09-14`,
credentials in the JSON body) live in `services/aggregation` — see
`research.md` D4.

---

## POST `/functions/v1/plaid-link-token`

Starts a connection attempt: creates the `plaid_link_sessions` row and a Plaid
link token.

**Request**
```json
{ "mode": "embedded" | "hosted" | "probe", "language": "en" }
```
- `mode` — `embedded` (web page runs Link), `hosted` (iOS shell; external
  browser), or `probe` (the FR-012 configured-check: after the config, auth,
  and membership checks pass, responds `200 { "configured": true }` WITHOUT
  creating a Plaid session or a DB row — lets the Linked banks page go calmly
  dark instead of showing a broken button). Required.
- `language` — optional; passed to Plaid only when in Plaid's supported set,
  else `en`.

**Behavior**
1. Resolve caller → their household (`household_members`); no household →
   `not_household_member`.
2. `/link/token/create` with: `client_name: "Ortho"`, `user.client_user_id` =
   caller UUID, `products: ["auth"]`,
   `additional_consented_products: ["transactions"]`,
   `country_codes: ["US"]`, `language`;
   - `embedded`: + `redirect_uri: APP_BASE_URL + "/plaid-oauth"`;
   - `hosted`: + `hosted_link: { completion_redirect_uri:
     "ortho://plaid-done", is_mobile_app: true }`.
3. Insert `plaid_link_sessions` (`pending`, `expires_at` = Plaid's
   `expiration`).

**Response 200**
```json
{
  "sessionId": "<uuid>",
  "linkToken": "link-sandbox-...",
  "expiresAt": "2026-07-16T18:30:00Z",
  "hostedLinkUrl": "https://secure.plaid.com/hl/..."   // hosted mode only
}
```

---

## POST `/functions/v1/plaid-exchange`

Completes a connection attempt. **Idempotent**: completing a `completed`
session returns its existing result.

**Request**
```json
{ "sessionId": "<uuid>", "publicToken": "public-sandbox-..." }
```
- `publicToken` — required for `embedded` sessions (from Link `onSuccess`);
  omitted for `hosted` sessions (server resolves it via `/link/token/get`).

**Behavior**
1. Load session (service role). Not found → `session_not_found` (404). Owned
   by another user → `session_not_owned` (403).
2. `status = 'completed'` → **200 with the existing institution + accounts**
   (double hand-back safety, FR-004).
3. `expires_at < now()` → `session_expired` (410); client clears its pending
   state and starts over.
4. Resolve the public token: embedded → from body (`invalid_request`, 400,
   if absent); hosted → `/link/token/get` →
   `link_sessions[].results.item_add_results[].public_token`; none yet →
   `session_incomplete` (409) — the caller treats this as "user hasn't
   finished", not an error state.
5. `/item/public_token/exchange` → `access_token`, `item_id`.
6. Insert `linked_institutions` (`on conflict (provider, provider_item_id)`
   → reuse existing row); `/institutions/get_by_id` (best-effort) for
   `institution_name`; `store_institution_secret(...)`; `/accounts/get` →
   insert `linked_accounts`; mark session `completed`.
7. **Compensation**: any failure after step 5 → best-effort `/item/remove`,
   delete secret/rows created in step 6, session stays `pending`, respond
   `exchange_failed` (502). No orphaned provider access, no partial household
   records (SC-005).

**Response 200**
```json
{
  "institution": {
    "id": "<uuid>", "provider": "plaid", "institutionName": "First Platypus Bank",
    "status": "active", "createdBy": "<uuid>", "createdAt": "..."
  },
  "accounts": [
    { "id": "<uuid>", "name": "Plaid Checking", "officialName": "Plaid Gold Standard 0% Interest Checking",
      "mask": "0000", "accountType": "depository", "accountSubtype": "checking" }
  ]
}
```

**Additional error codes**: `session_not_found` (404), `session_not_owned`
(403), `session_expired` (410), `session_incomplete` (409),
`exchange_failed` (502).

---

## POST `/functions/v1/plaid-disconnect`

Revokes provider access, then marks the institution disconnected (FR-009:
provider first — no silent zombies).

**Request**
```json
{ "institutionId": "<uuid>" }
```

**Behavior**
1. Load institution; not found → `institution_not_found` (404); caller not a
   member of its household → `not_household_member` (403).
2. Already `disconnected` → **200 (idempotent)**.
3. `get_institution_secret` → `/item/remove`. Plaid `ITEM_NOT_FOUND` (or a
   missing secret) counts as success — access is already gone. Network/5xx →
   `provider_unreachable` (502) and **nothing changes locally**; the member
   retries.
4. `delete_institution_secret`; set `status = 'disconnected'`,
   `disconnected_at = now()`. Account rows are kept (history) but the UI
   shows no accounts for disconnected institutions.

**Response 200**
```json
{ "institutionId": "<uuid>", "status": "disconnected" }
```

**Additional error codes**: `institution_not_found` (404),
`disconnect_failed` (502 — Plaid accepted nothing / unexpected state).

---

## Client wrapper contract (`web/lib/aggregation.ts`)

Mirrors `web/lib/billing.ts`: `supabase.functions.invoke(name, { body })`,
returning a discriminated `{ ok: true, ... } | { ok: false, code }` result —
never throwing raw provider text into the UI; every `code` above has a
localized string (FR-013).
