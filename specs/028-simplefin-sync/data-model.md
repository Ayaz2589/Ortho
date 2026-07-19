# Data Model: SimpleFIN Bank-Sync (spec 028)

One migration: `supabase/migrations/2026XXXXXXXXXX_simplefin_sync.sql`. **Additive
and reuse-first** — no new ledger tables, no reshaped provider tables. Ordering
follows the repo pattern: enum change → column adds → RPCs → grants.

## Enum change

- `linked_provider`: add value **`'simplefin'`** (`alter type public.linked_provider
  add value if not exists 'simplefin'`). Mirror in `web/lib/types.ts`
  (`LinkedProvider = 'plaid' | 'simplefin'`) and `web/lib/supabase/rows.ts`.
  > Postgres requires `ADD VALUE` to run outside a txn block for older versions — place
  > it first / in its own statement per repo migration conventions.

## Reused tables (no schema change)

- **`linked_institutions`** — one row per claimed **Access URL** (D1).
  `provider = 'simplefin'`; `provider_item_id = 'sfin_' || substr(sha256(access_url),1,32)`;
  `provider_institution_id` = null (or primary org id if available);
  `institution_name` = a friendly label (primary org name, else "SimpleFIN").
- **`linked_accounts`** — one row per account under the connection. `provider_account_id`
  = SimpleFIN account `id`; `name` = account name; `official_name` = org/bank name;
  `account_type` = SimpleFIN account kind if present (else ''); `mask` = last 4 if present.
- **`linked_institution_secrets`** → Vault: stores the **Access URL** (the only secret),
  1:1 on `institution_id`.
- **`transactions` / `transaction_shares`** — synced rows written via
  `upsert_transaction` (see below). No column adds required for correctness; provider
  origin is carried in `source` (D6) — see "Sync-origin encoding".

## New columns on `linked_institutions` (sync state, D5)

| Column | Type | Notes |
|---|---|---|
| `last_synced_at` | `timestamptz null` | end of the last successful sync window; drives the next `start-date` |
| `last_manual_refresh_at` | `timestamptz null` | manual-refresh rate-limit clock (≤ 1/hour) |
| `sync_cursor` | `text null` | reserved for a future delta cursor (SimpleFIN has none today) |

All nullable, back-compatible with existing Plaid rows (which simply never sync).

## Sync-origin encoding (dedupe, D6)

Each synced ledger transaction records its provider origin so re-syncs upsert the same
row rather than duplicating:

- **`transactions.source`** = `'simplefin:' || provider_account_id || ':' || provider_txn_id`.
  This string is the **dedupe key** and is unique per (account, provider txn id).
- The **ledger row id** (`transactions.id`) for a synced txn is a **deterministic UUIDv5**
  of the dedupe string (namespaced), so `upsert_transaction`'s `on conflict (id)` makes
  re-syncs idempotent and pending→posted an in-place update.
  > Rationale: avoids a schema change while giving each provider transaction a stable,
  > collision-free ledger identity. Documented so a future migration could promote this
  > to dedicated columns if needed.

## `upsert_transaction` payload for a synced transaction

`p_tx` (jsonb):
- `id`: deterministic UUIDv5(dedupe string)
- `household_id`: the connection's household
- `merchant`: SimpleFIN `payee` ?? `description`
- `category`: default `transaction_category` (e.g. `other` — exact value confirmed
  against the live enum during implementation)
- `kind`: `income` if SimpleFIN amount ≥ 0 else `expense` (D4)
- `amount_cents`: **absolute** integer cents (D4)
- `source`: the dedupe string above
- `date`: `to_timestamp(posted)` (or `transacted_at` when present)
- `created_by`: the connection's `created_by` user
- `paid_by`: null (unassigned; user can set later)
- `notes`: SimpleFIN `memo` if present, else null

`p_shares` (jsonb array) — **default split (D7)**:
- `[{ person_id: <default person>, amount_cents: <full amount_cents> }]`
- default person = `household_people` where `linked_user_id = created_by`, else lowest
  `sort_order` non-removed person in the household. Guarantees `sum(shares.amount_cents)
  = amount_cents`.

## New RPCs (service-role only, mirroring the Plaid ones)

| RPC | Purpose |
|---|---|
| `store_simplefin_secret(p_institution_id, p_access_url) → uuid` | create/replace the Access URL in Vault; return `vault_secret_id`. (May reuse the existing generic `store_institution_secret` if provider-agnostic — confirm at implementation.) |
| `get_institution_secret(p_institution_id) → text` | **reused** — already provider-agnostic; returns the Access URL for sync/disconnect. |
| `delete_institution_secret(p_institution_id) → void` | **reused** — disconnect path. |
| `complete_simplefin_link(p_household_id, p_provider_item_id, p_institution_name, p_access_url, p_created_by, p_accounts) → uuid` | **atomic**: upsert institution (reactivate on re-link) + store secret + insert/replace accounts. Mirrors `complete_plaid_link`. |
| `mark_simplefin_synced(p_institution_id, p_synced_at)` | set `last_synced_at` after a successful sync window. |

> The generic secret RPCs (`get_/delete_institution_secret`, and possibly
> `store_institution_secret`) are already provider-agnostic (keyed on `institution_id`),
> so SimpleFIN reuses them; only the **link-completion** and **sync-state** RPCs are new.

## Client type mirrors (`web/lib/types.ts`, `web/lib/supabase/rows.ts`)

- `LinkedProvider = 'plaid' | 'simplefin'`.
- `LinkedInstitution` gains `last_synced_at: string | null`,
  `last_manual_refresh_at: string | null`, `sync_cursor: string | null` (mirroring the
  new columns). Existing fields unchanged.
- `LinkedAccount` unchanged (currency already representable; if a `currency` column does
  not yet exist on `linked_accounts`, it is added here — confirm against the 024 schema
  at implementation and add only if missing).

## Entity relationships (unchanged shape)

```
households 1 ── * linked_institutions(provider='simplefin') 1 ── * linked_accounts
                       1 linked_institution_secrets ──► vault.secrets (Access URL)
                       │
                       └─ sync ──► transactions (source='simplefin:acct:txn')
                                      1 ── * transaction_shares (default: 1 person, full amount)
```

## Non-changes (scope guard)

- No new ledger tables; no reshape of `transactions`/`transaction_shares`.
- No `owner_person_id` on `linked_accounts` (owner assignment remains out of scope).
- No webhook/session tables (claim is synchronous; SimpleFIN has no webhooks).
- Plaid tables/columns untouched.
