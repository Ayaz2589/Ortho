# Data Model: Plaid Connect (spec 024)

One migration: `supabase/migrations/20260717120000_plaid_connect.sql`
(sorts after main's `20260716130000_subscription_entitlements.sql`).
Ordering inside the file follows the 018 pattern: enums → tables → indexes →
RLS enable → policies → functions/RPCs. Money never appears in this feature —
no cents columns, no vectors.

## Enums

- `linked_provider`: `plaid` — the provider seam (FR-010). Future providers
  are `ALTER TYPE ... ADD VALUE` in their own isolated migration (repo gotcha:
  enum value additions must not be referenced in the same migration).
- `linked_institution_status`: `active | disconnected`. (`error`/repair states
  arrive with the transactions feature; adding enum values later is the
  established cheap path.)
- `link_session_status`: `pending | completed | abandoned`. (Expiry is derived
  from `expires_at`, not stored — avoids a cron just to flip a label.)

## Tables

### `linked_institutions` — client-visible household facts (FR-007/008)

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK, `default gen_random_uuid()` |
| `household_id` | `uuid` | NOT NULL → `households(id)` on delete cascade |
| `provider` | `linked_provider` | NOT NULL, `default 'plaid'` |
| `provider_item_id` | `text` | NOT NULL — Plaid `item_id` |
| `provider_institution_id` | `text` | NULL — Plaid `ins_*` id (nullable per Plaid) |
| `institution_name` | `text` | NOT NULL `default ''` |
| `status` | `linked_institution_status` | NOT NULL `default 'active'` |
| `created_by` | `uuid` | NOT NULL → `users(id)` — who connected (US4) |
| `created_at` / `updated_at` | `timestamptz` | NOT NULL `default now()`; `touch_updated_at()` trigger |
| `disconnected_at` | `timestamptz` | NULL until disconnected |

- `unique (provider, provider_item_id)` — the idempotency anchor (D7): a
  re-exchange of the same Item reuses the row instead of duplicating.
- Index `linked_institutions_household_id_idx`.
- **RLS**: `for select using (is_household_member(household_id))` only. No
  client insert/update/delete — writes are service-role (edge functions), the
  018 `entitlements` posture.

### `linked_accounts` — display metadata only (FR-007)

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK, `default gen_random_uuid()` |
| `institution_id` | `uuid` | NOT NULL → `linked_institutions(id)` on delete cascade |
| `provider_account_id` | `text` | NOT NULL — Plaid `account_id` |
| `name` | `text` | NOT NULL `default ''` |
| `official_name` | `text` | NULL |
| `mask` | `text` | NULL — last-4 (Plaid may omit) |
| `account_type` | `text` | NOT NULL `default ''` — Plaid `type` (e.g. `depository`) |
| `account_subtype` | `text` | NULL — Plaid `subtype` (e.g. `checking`) |
| `created_at` | `timestamptz` | NOT NULL `default now()` |

- `unique (institution_id, provider_account_id)`.
- **RLS**: select piggybacks on the parent (the `transaction_shares` pattern):
  `exists (select 1 from linked_institutions li where li.id = institution_id
  and is_household_member(li.household_id))`. No client writes.
- Types stay `text`, not enums — Plaid's account type/subtype vocabulary is
  theirs to grow; we render, never branch on it (scope guard FR-011).

### `linked_institution_secrets` — zero-policy secret mapping (FR-006, D5)

| Column | Type | Constraints |
|---|---|---|
| `institution_id` | `uuid` | PK → `linked_institutions(id)` on delete cascade |
| `vault_secret_id` | `uuid` | NOT NULL — id in `vault.secrets` |
| `created_at` | `timestamptz` | NOT NULL `default now()` |

- **RLS enabled, zero policies** (the `billing_events` posture) — invisible to
  every client role; only service-role + the wrapper RPCs touch it.
- The Plaid `access_token` itself lives in Vault, never in this table.

### `plaid_link_sessions` — transient connection attempts (D7, FR-004)

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK, `default gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL → `users(id)` — who started it |
| `household_id` | `uuid` | NOT NULL → `households(id)` on delete cascade |
| `mode` | `text` | NOT NULL, `check (mode in ('embedded','hosted'))` |
| `link_token` | `text` | NOT NULL — needed server-side for `/link/token/get` |
| `status` | `link_session_status` | NOT NULL `default 'pending'` |
| `institution_id` | `uuid` | NULL → `linked_institutions(id)` — set on completion |
| `created_at` | `timestamptz` | NOT NULL `default now()` |
| `expires_at` | `timestamptz` | NOT NULL — from Plaid's link token expiration |
| `completed_at` | `timestamptz` | NULL |

- **RLS enabled, zero policies** — all reads/writes via edge functions
  (service role). The client keeps `{sessionId, linkToken, mode}` in
  `localStorage` while pending; the server row is the source of truth for
  completion (idempotency) and the iOS poll path.
- Index `plaid_link_sessions_user_id_idx`.
- `link_token` is semi-sensitive (short-lived, single-session): zero-policy
  keeps it out of client reach after issuance.

## Vault wrapper RPCs (service-role only — D5)

The `vault` schema is not exposed over PostgREST, so functions in `public`
bridge it. All three: `security definer`, `set search_path = public`,
`revoke execute from public, anon, authenticated`, `grant execute to
service_role`. None are callable by any client.

- `store_institution_secret(p_institution_id uuid, p_secret text) returns uuid`
  — `vault.create_secret(p_secret, 'linked_institution:' || p_institution_id)`
  + upsert the mapping row; returns `vault_secret_id`. Re-linking an existing
  institution replaces the secret (delete old vault row first).
- `get_institution_secret(p_institution_id uuid) returns text` — join mapping
  → `vault.decrypted_secrets.decrypted_secret`; NULL when absent.
- `delete_institution_secret(p_institution_id uuid) returns void` — delete
  from `vault.secrets` + the mapping row; idempotent (no-op when absent).

Migration prerequisite: `create extension if not exists supabase_vault
cascade;` (hosted projects ship it; local stack includes it — first use in
this repo).

## Session state machine (contract detail in contracts/link-session-lifecycle.md)

```
pending ──(exchange succeeds)──────────────► completed(institution_id)
pending ──(user abandons; client reports)──► abandoned
pending ──(expires_at passes)──────────────► still 'pending' but treated
                                             as expired by every reader
completed ──(re-exchange)──────────────────► completed (idempotent return)
```

- No cron: expiry is `expires_at < now()` evaluated at read time.
- `abandoned` is best-effort hygiene (client signal), never load-bearing.
- Compensation invariant (D7): a session may only reach `completed` with the
  institution row, its secret, and its accounts all present; any later step
  failing rolls the earlier ones back (best-effort `/item/remove` + deletes)
  and leaves the session `pending`.

## Entity relationships

```
households 1 ──── * linked_institutions 1 ──── * linked_accounts
                        │ 1                         (display metadata)
                        │
                        1 linked_institution_secrets ──► vault.secrets (access_token)
users 1 ──── * plaid_link_sessions * ────► linked_institutions (on completion)
```

## Non-changes (scope guard)

- No columns on `transactions`/`transaction_shares`; no staging tables; no
  `owner_person_id` on `linked_accounts` (explicitly deferred with owner
  assignment); no webhook/audit-log tables (arrive with transactions sync).
- `web/lib/types.ts` gains `LinkedInstitution` / `LinkedAccount` row types
  mirroring the two client-visible tables exactly (hand-written, repo
  convention). Secrets/session tables get **no** client types beyond what
  `web/lib/aggregation.ts` needs for function responses.
