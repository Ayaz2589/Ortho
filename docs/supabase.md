# Supabase Backend (`supabase/`)

Read this when working on the database schema, migrations, RLS, RPCs, edge functions, Vault
secrets, or the migrations CI lane. Companion docs: [web.md](./web.md) (clients),
[finance.md](./finance.md) (client-side money math), [ios.md](./ios.md) (Capacitor shell + deploy).

`supabase/` is the single shared backend for all surfaces: versioned Postgres migrations, RLS as
the real authorization layer (clients hold only the anon key), 11 RPCs, 7 Deno edge functions, and
the CLI config. All money is integer **USD cents** (`bigint`, `>= 0` checks); display currency is
client-only. The DB stores and aggregates; shared business math lives in `web/lib/finance/` pinned
by `shared/test-vectors/`.

Hosted project: ref `brujhxmtzfgowimprueo` (`https://brujhxmtzfgowimprueo.supabase.co`). The ref is
a public value (it appears in the client URL) — in CI it is a repo **Variable**, not a Secret.

## 1. Directory map

```
supabase/
├── config.toml        # ports, auth, session timebox, [functions.stripe-webhook] verify_jwt=false
├── seed.sql           # intentionally EMPTY (db reset = migrations only, no data)
├── migrations/        # 15 files — the entire schema in timestamp order (§3)
├── functions/         # 7 Deno edge functions + _shared/ (§7)
└── tests/upsert_transaction_authz.sql   # SQL authz regression test for the money-write RPC (§9)
```

## 2. Local stack & `config.toml`

Postgres 17. Ports: API `54321`, DB `54322` (shadow `54320`), Studio `54323`, Inbucket `54324`,
analytics `54327`. OTP sign-in emails land in Inbucket locally.

```bash
supabase start | stop | db reset          # reset replays all migrations; seed.sql is a no-op
supabase migration new <name>             # creates migrations/<ts>_<name>.sql
supabase link --project-ref brujhxmtzfgowimprueo && supabase db push   # hosted apply (see §8 CI)
```

Key auth settings: email OTP with `otp_length = 8`, `otp_expiry = 3600`; `jwt_expiry = 3600`;
signups on, confirmations off, min password 6; refresh-token rotation on; rate limit
`email_sent = 2`/hr (local mailer = Inbucket; prod SMTP block commented out).

**`[auth.sessions] timebox = "720h"`** — absolute 30-day session cap (feature 010; no inactivity
timeout). config.toml only governs the **local** stack: the hosted project must be mirrored
manually (Dashboard → Auth → Sessions → time-box = 720h, or `supabase config push`). Never assume
config.toml == production.

`[functions.stripe-webhook] verify_jwt = false` is the **only** JWT-off function — the Stripe
signature is its auth. All 6 others keep `verify_jwt = true`.

## 3. Migrations — 15 files

| File | Effect |
|---|---|
| `20260521120000_initial_schema.sql` | 5 enums, 12 tables, indexes, `touch_updated_at()`, RLS helpers + policies, `accept_invite()`, pgcrypto |
| `20260521150000_budgets.sql` | `budgets`, UNIQUE `(household_id, category)`, member RLS |
| `20260522170000_add_entertainment_category.sql` | `ALTER TYPE transaction_category ADD VALUE 'entertainment'` — the enum-addition pattern (§10) |
| `20260610000000_platform_locks.sql` | `platform_locks` — feature retired in clients (010); zombie table |
| `20260611120000_aggregates.sql` | 4 household aggregate RPCs (half-open date ranges) |
| `20260616120000_household_people_and_value_splits.sql` | **Forward-only, destructive**: `household_people`; `transaction_shares` percent/user → cents/person; drops `transactions.scope` + `transaction_scope` type; `household_id` NOT NULL; RLS rewrite; `household_owner_spend` re-created returning `person_id` |
| `20260618120000_member_reimbursement.sql` | `'transfer'` added to `transaction_kind` AND `transaction_category`; `transactions.paid_by → household_people` + backfill |
| `20260707120000_unit_occupied.sql` | `units.occupied boolean not null default true` |
| `20260716130000_subscription_entitlements.sql` | `entitlement_status`/`billing_plan` enums; `entitlements` + `billing_events`; `ensure_entitlement()` |
| `20260717120000_plaid_connect.sql` | 3 enums, 4 tables, **first Vault use**, 4 service-role-only RPCs, **first explicit table grants** |
| `20260717160000_fix_household_members_insert_policy.sql` | **Security fix**: closes privilege-escalation hole in `household_members` INSERT; adds `is_household_record_owner()` |
| `20260718120000_savings_goals.sql` | `goal_kind` enum; `goals` + `goal_contributions` (member RLS, grants) |
| `20260718120001_transaction_tags.sql` | `transactions.notes`; `tags` + `transaction_tags`; member RLS; grants |
| `20260718120002_upsert_transaction_atomic.sql` | `upsert_transaction(jsonb, jsonb)` — atomic tx+shares write, SQL-enforced shares-sum invariant |
| `20260719120000_budget_rollover.sql` | `budget_type` enum; `budgets.budget_type` (default `'fixed'`) + nullable `rollover_cap_cents` |

**Conventions**: heavily-commented headers naming the spec; `snake_case`; unprefixed enum types;
indexes `<table>_<cols>_idx`; `timestamptz` for transactions, plain `date` for housing/goals dates.

**Version-collision lesson (2026-07-18)**: three spec-027 migrations initially collided on version
`20260718120000` — the 14-digit prefix is the primary key in `supabase_migrations.schema_migrations`,
so duplicates silently fight. They were renamed to `...0000`/`...0001`/`...0002`, the
`transactions.notes` add was made idempotent (`ADD COLUMN IF NOT EXISTS`), and the CI `validate`
job (§8) now rejects duplicate prefixes and malformed filenames on every PR.

## 4. Current schema

### Enums (11 live + 1 dropped)

- `role`: `owner | member` (`admin` deliberately deferred)
- `transaction_kind`: `expense | income | transfer`
- `transaction_category` (12): `coffee groceries dining subs fuel rent health income transit
  utilities entertainment transfer`
- `property_kind`: `primary_home | multifamily | rental`
- `entitlement_status`: `trialing | active | past_due | paused | unpaid | canceled | admin`
- `billing_plan`: `monthly | yearly`
- `linked_provider`: `plaid` · `linked_institution_status`: `active | disconnected` ·
  `link_session_status`: `pending | completed | abandoned` (no `expired` — derived from
  `expires_at` at read time)
- `goal_kind`: `savings | debt_payoff` · `budget_type`: `fixed | flex | non_monthly`
- **Dropped**: `transaction_scope` (migration 20260616)

Clients hand-mirror these: `web/lib/types.ts` (domain) + `web/lib/supabase/rows.ts` (row seam) —
no generated types. Add a Postgres enum value ⇒ update both.

### Tables (25)

**Identity / household**
- `users` — `id` PK = `auth.uid()` (FK `auth.users` cascade), `name`, `initial`, `color_key`;
  clients upsert on sign-in.
- `households` — `owner_id → users` (restrict), `name`.
- `household_members` — PK `(household_id, user_id)`, `role`.
- `household_people` — display roster (splits/balances reference **people**, not users):
  `name/initial/color_key`, optional `linked_user_id → users` (set null), `sort_order`,
  `removed_at` soft-remove; UNIQUE `(household_id, linked_user_id)`.
- `pending_invites` — `token_hash` (sha256 of raw token) UNIQUE, `expires_at`, `redeemed_at`.
- `platform_locks` — user_id PK, `platform in ('web','ios')`; retired feature, no client writes.

**Ledger**
- `transactions` — `household_id` NOT NULL, `merchant`, `category`, `kind`, `amount_cents` ≥0,
  `source` (the card/account that paid, default `''`), `date timestamptz`, `created_by → users`,
  `paid_by → household_people` (nullable), `notes` (nullable free-form — distinct from `source`),
  `updated_at` trigger. Indexes `(household_id, date desc)`, `(created_by)`.
- `transaction_shares` — PK `(transaction_id, person_id)`, `amount_cents` ≥0. Authoritative
  cents-per-person; **must sum to the tx amount** — enforced in SQL by `upsert_transaction` (§5)
  since 20260718120002 (previously client-side only).
- `tags` — `name` 1–50 trimmed chars; unique index on `(household_id, lower(btrim(name)))` —
  case/whitespace-insensitive dedup per household (the DB is the identity backstop).
- `transaction_tags` — PK `(transaction_id, tag_id)`; a set, no sum invariant; tag write failure
  never rolls back the parent tx.
- `cards` — household-scoped payment-source names.
- `budgets` — UNIQUE `(household_id, category)`, `monthly_limit_cents` ≥0, `budget_type` (default
  `'fixed'`), `rollover_cap_cents` nullable ≥0 (flex-only). Rollover **carry is never stored** —
  derived from ledger history in `web/lib/finance/budgets.ts` at render time.

**Housing** — kind ↔ sub-table shape enforced by app logic, not SQL.
- `properties` — `kind`, `address`, `nickname`; `updated_at` trigger.
- `mortgage_info` (1:1, PK = property_id) — `purchase_price_cents`, `original_loan_cents`,
  `annual_interest_rate_percent numeric(7,4)`, `loan_term_years > 0`, `closing_date`,
  `auto_pay_source`.
- `lease_info` (1:1) — `monthly_rent_cents`, `lease_start/end` (`lease_end >= lease_start`),
  optional `security_deposit_cents`, `paid_with_source`.
- `units` (N:1) — `monthly_rent_cents`, `tenant_name/email`, `sort_order`, `occupied`.
- `rental_payments` — `amount_cents`, `date`, `note`; index `(property_id, date desc)`.

**Billing (spec 018)**
- `entitlements` — user_id PK; `status` default `'trialing'`; `access_expires_at` (NULL = never,
  admin only; trial = created_at + 31d; paid = **raw** provider period end — leeway lives only in
  client derivation, `services/billing/src/derive.ts`); `plan`; `source in ('trial','stripe',
  'operator')`; `stripe_customer_id` UNIQUE; `stripe_subscription_id`; `last_event_at`
  (out-of-order event shield).
- `billing_events` — append-only; `event_id` UNIQUE = webhook idempotency key; `outcome`;
  raw `payload jsonb`.

**Plaid (spec 024 — connect-only; no balances/transactions ever stored)**
- `linked_institutions` — UNIQUE `(provider, provider_item_id)` (idempotency anchor), `status`,
  `disconnected_at`.
- `linked_accounts` — UNIQUE `(institution_id, provider_account_id)`; display metadata only
  (name, mask, type/subtype as text — never branched on).
- `linked_institution_secrets` — institution_id PK → `vault_secret_id` (row in `vault.secrets`).
- `plaid_link_sessions` — `mode in ('embedded','hosted')`, `link_token` (server-side only),
  `status`, `expires_at` (~30 min).

**Goals (spec 027)**
- `goals` — non-blank `name`, `kind`, `target_cents > 0`, optional `target_date`, context-only
  `linked_account_id → linked_accounts` XOR `linked_category` (check `goals_single_association`).
  Progress = client-computed sum of contributions (`web/lib/finance/goals.ts`).
- `goal_contributions` — `amount_cents > 0` (removal = row delete, never negative), `date`, `note`.

## 5. RPCs (11, all `SECURITY DEFINER` + `set search_path = public`)

**Client-callable** (EXECUTE revoked from public, granted to `authenticated`; each re-checks auth
internally):

- `accept_invite(p_token text) → uuid` — sha256-hash, `FOR UPDATE` lock, idempotent membership
  insert, marks redeemed.
- `ensure_entitlement() → entitlements` — insert-if-absent 31-day trial; idempotent (re-sign-in
  can never reset a trial); the **only** non-service-role entitlement write path.
- 4 aggregates (membership guard inside the WHERE — non-members get **empty results, not errors**;
  half-open `date >= p_start AND date < p_end`; USD cents; called from `web/lib/api/aggregates.ts`):
  `household_owner_spend → (person_id, cents)` (plain SUM of materialized shares),
  `household_category_totals → (category, cents)`, `household_month_summary → (income, expense,
  net)`, `household_daily_expense → (day, cents)`.
- `upsert_transaction(p_tx jsonb, p_shares jsonb) → void` (`authenticated` + `service_role`) —
  atomic tx upsert + delete-and-reinsert of shares. Rejects: missing/empty shares (`NO_SHARES`),
  sum ≠ amount (`SHARES_MISMATCH`), non-member (`UNAUTHORIZED`), spoofed `created_by`,
  `household_id` change, non-creator/non-owner edit — the guard mirrors transactions RLS exactly,
  evaluated against the existing row. Immutables excluded from `ON CONFLICT DO UPDATE`: `id`,
  `household_id`, `created_by`, `created_at`. NULL `auth.uid()` is trusted as service-role **only
  because anon EXECUTE is revoked** — that revoke is load-bearing security. SECURITY DEFINER (not
  invoker) because `authenticated` has no base-table DML on `transactions`/`transaction_shares`.

**service_role-only Vault bridges** (§6): `store_institution_secret(uuid, text) → uuid`
(replace-not-duplicate), `get_institution_secret(uuid) → text`, `delete_institution_secret(uuid)`,
plus `complete_plaid_link(session_id, item_id, institution_id, name, access_token, accounts jsonb)
→ uuid` — institution upsert (reactivates a disconnected item) + secret replacement + account
upserts + session flip, in ONE transaction (the Plaid public token is single-use; a mid-persist
crash would otherwise strand an unhealable half-linked institution).

**RLS helpers** (SECURITY DEFINER to break `household_members` self-referencing recursion — never
inline a `household_members` subquery in its own policy): `is_household_member`,
`is_household_owner`, `is_property_household_member`, `is_household_record_owner`. Plus
`touch_updated_at()` trigger fn (transactions, properties, budgets, entitlements, goals,
linked_institutions).

## 6. RLS model & Vault

RLS is enabled on **every** table. Four postures:

| Posture | Tables |
|---|---|
| Self-only | `users` (own row + peers-in-shared-household SELECT), `platform_locks` |
| Member read/write | `households` (owner-only update/delete), `cards`, `budgets`, `properties` + housing sub-tables (via `is_property_household_member`), `household_people`, `tags`, `goals` |
| Parent-piggyback `EXISTS` | `transaction_shares`, `transaction_tags`, `goal_contributions`, `linked_accounts` (select-only) |
| Service-role-only | `entitlements` (single `entitlements_select_own` policy, **no client write** — "a client that can write its own entitlement is a paywall that doesn't exist"), `billing_events` (RLS on, **zero policies**), `linked_institutions`/`linked_accounts` (member SELECT only), `linked_institution_secrets` + `plaid_link_sessions` (zero policies AND no `authenticated` grant at all) |

`transactions`: member SELECT; INSERT requires member AND `created_by = auth.uid()` (the CLI's
`--admin` service-role mode exists because cross-account attribution is impossible under RLS);
UPDATE/DELETE = creator OR household owner.

`household_members` INSERT (post-fix, 20260717160000): `is_household_owner(household_id)` OR
(`user_id = auth.uid()` AND `role = 'owner'` AND `is_household_record_owner(household_id)`). The
pre-fix policy let any authenticated user who learned a household UUID self-insert as owner. The
ownership check must be a SECURITY DEFINER helper — an inline subquery runs under the caller's RLS
and breaks the household-creation bootstrap.

**Vault**: the Plaid `access_token` lives only in `vault.secrets` (extension enabled in the
plaid_connect migration); `linked_institution_secrets` maps institution → vault row. PostgREST does
not expose the `vault` schema, and the 3 wrapper RPCs grant EXECUTE to `service_role` alone — a
leaked anon key cannot reach a bank credential.

**Explicit table grants (regime shift)**: newer Supabase/PG17 stacks no longer auto-grant DML on
new public tables to anon/authenticated/service_role (older hosted projects are permissive).
Migrations 20260717120000 / 20260718120000 / 20260718120001 grant explicitly. **Every new table
migration must include explicit grants** or it can pass locally-as-postgres and fail for real
clients.

## 7. Edge functions (`supabase/functions/`, Deno)

Shared auth pattern (all except `stripe-webhook`): platform `verify_jwt = true`, then the function
resolves the caller via `getUser()` on an anon-key client with the forwarded Authorization header —
identity never comes from the request body. Writes use a separate service-role client. CORS +
contract error envelope `{ error: { code, message } }` from `_shared/http.ts` (hand-written; codes
include `unauthenticated, invalid_request, not_configured, no_billing_account, provider_error,
not_household_member, provider_unreachable, session_not_found, session_not_owned`).

- `billing-checkout` — POST `{plan}` → Stripe Checkout URL. Calls `ensure_entitlement` before
  creating Stripe objects; get-or-create customer with guarded mapping update (never clobber on
  race; DB read error → `provider_error`, not a second orphaned customer).
- `billing-portal` — POST → Customer Portal session; `no_billing_account` only when the mapping
  read succeeded and is truly absent; returns to `${APP_BASE_URL}/settings`.
- `billing-plans` — GET/POST; live Stripe price lookup (prices exist **only** in Stripe); 60s
  in-function cache.
- `stripe-webhook` — `verify_jwt = false`; verifies the Stripe signature on the raw body with the
  **async** provider (`Stripe.createSubtleCryptoProvider()` — sync `constructEvent()` throws under
  Deno). Pipeline: verify → `translateStripeEvent` → `applyBillingEvent` state machine → guarded
  entitlement write; idempotency via `billing_events.event_id` unique insert
  (`stripe-webhook/idempotency.ts` + co-located test). Must 200 unrecognized shapes.
- `plaid-link-token` — POST `{mode: embedded|hosted|probe, language}` → `plaid_link_sessions` row +
  Plaid link token (`probe` answers without touching Plaid). Household resolved server-side.
- `plaid-exchange` — POST → completes a link idempotently via `complete_plaid_link`. Any failure
  after `/item/public_token/exchange` is terminal (token single-use): best-effort `/item/remove`
  of the orphan (an orphan burns one of the Plaid Trial plan's 10 slots), session → `abandoned`,
  answer `exchange_failed`. Helper `completion.ts` + co-located test.
- `plaid-disconnect` — POST `{institutionId}` → revoke at Plaid FIRST, then mark disconnected
  locally; idempotent; unreachable provider changes nothing (no zombie connections).

Stripe API version pinned `'2026-06-24.dahlia'` in checkout/portal/plans/webhook, in lockstep with the
webhook endpoint config and `services/billing/test` fixtures. SDKs: `npm:stripe@22`,
`jsr:@supabase/supabase-js@2`. Plaid is raw `fetch` — no SDK.

**Secrets** (`supabase secrets set`, never committed): billing — `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`, `APP_BASE_URL`; plaid —
`PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` (exactly `sandbox` or `production` — Plaid
Development was decommissioned 2024); plus platform-injected `SUPABASE_URL` / `SUPABASE_ANON_KEY` /
`SUPABASE_SERVICE_ROLE_KEY`.

**Deploy** (operator-only; sandbox cannot reach Stripe/Plaid/hosted):

```bash
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy billing-checkout billing-portal billing-plans
supabase functions deploy plaid-link-token plaid-exchange plaid-disconnect
```

### `_shared/` sync + services cores

```
supabase/functions/_shared/
├── http.ts        # HAND-WRITTEN (CORS, json, errorResponse, requiredEnv)
├── billing/       # GENERATED byte-copy of services/billing/src — never edit
└── aggregation/   # GENERATED byte-copy of services/aggregation/src — never edit
```

- `services/billing` (`@ortho/billing-core`, pure zero-dep TS): `states.ts` (vocabularies +
  `LEEWAY_HOURS`/`DUNNING_GRACE_DAYS`), `normalize.ts` (provider-adapter seam — a future
  Apple/StoreKit adapter emits the same `NormalizedBillingEvent`), `machine.ts`
  (`applyBillingEvent` pure state machine; event dedup is the host's job), `derive.ts` (client
  gate-state with leeway — the ONE place leeway lives), `stripe.ts` (payload → normalized, never
  throws; worst case `'unrecognized'`).
- `services/aggregation` (`@ortho/aggregation-core`): `types.ts` (mirrors the Postgres enums),
  `plaid.ts` (request builders + null-returning parsers), `plaidClient.ts` (fetch-injected REST
  client, no globals).
- **Sync**: `npm run sync:functions` in each service dir (rm-and-recopy of `src/*.ts` into
  `_shared/<name>/`). Supabase's deploy bundler only reliably follows imports inside
  `supabase/functions/`; source of truth is always `services/*/src`.
- **Drift lock**: `services/{billing,aggregation}/test/shared-sync.test.ts` assert exact file-set +
  per-file byte identity; run via `npm test` in each service dir (own package.json, vitest). A hand
  edit of the copies fails CI and is overwritten by the next sync.

## 8. CI — `.github/workflows/supabase-migrations.yml`

Added after the 2026-07-19 prod outage ("column transactions.notes does not exist"): Vercel shipped
`main` while the prod DB sat 8 hand-applied-and-forgotten migrations behind.

- **Triggers**: push to `main` + `pull_request` (path-filtered to `supabase/migrations/**` and the
  workflow file) + `workflow_dispatch` for on-demand apply. Concurrency group per-ref with
  `cancel-in-progress: false` — never cancel a mid-flight prod migration.
- **`validate` job** (every PR/push): rejects filenames not matching `^[0-9]{14}_.+\.sql$` and
  duplicate 14-digit version prefixes (see §3 collision lesson).
- **`migrate` job** (`needs: validate`): runs on `(push to main OR workflow_dispatch) AND repo ==
  Ayaz2589/Ortho AND vars.SUPABASE_PROJECT_REF != ''` — **skips cleanly (not red) until the
  `SUPABASE_PROJECT_REF` repo Variable is set** (`vars` work in job `if:`; `secrets` don't). Steps:
  `supabase/setup-cli@v1` pinned `2.109.1` → `link` → `migration list` → `db push` →
  `migration list`. Required secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`. Until the
  variable is set, keep applying by hand (`supabase db push`).
- Deliberately **no `environment:` key** — it would collide with Vercel's "Production" environment;
  an approval gate would need a dedicated env (e.g. `supabase-migrations`).
- **Accepted residual race**: Vercel deploys `main` in parallel, so a brief new-code/old-schema
  window remains.

## 9. Testing

No JS test suite in `supabase/` itself — schema behavior is exercised by `cd web && npm test` and
the two `services/*` suites (which also drift-lock the `_shared` copies). One SQL test exists:
`supabase/tests/upsert_transaction_authz.sql` — authorization/validation regression for
`upsert_transaction` against the live local stack (the layer mocked vitest suites can't reach; a
prior revision shipped anon-executable). Run instructions in its header (`docker exec … psql` into
the local `supabase_db_*` container).

Client env for the local stack: `web/.env.local` (gitignored) with
`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` + `NEXT_PUBLIC_SUPABASE_ANON_KEY=<from supabase
start>`. The import/tx CLI (`web/scripts/import/db/client.ts`, driven by the root `Makefile`) adds
`IMPORT_EMAIL` (OTP mode) or `SUPABASE_SERVICE_ROLE_KEY` (`--admin` mode — bypasses RLS, never
ships in a client).

## 10. Gotchas

- **`ALTER TYPE ... ADD VALUE` may never be referenced in the same migration** — the value must
  commit before use (migrations 20260522170000 and 20260618120000 follow this). A brand-new
  `CREATE TYPE` used in the same file IS fine.
- **Migration 20260616 is forward-only and destructive** — read it before touching
  `transactions`/`transaction_shares`. Its rounding reconcile assigns leftover cents to the
  lowest-`sort_order` person.
- **Share-less transactions can no longer be created** (`NO_SHARES`, even for amount 0), but
  historical share-less rows were NOT healed by 20260718120002 — it only NOTICEs the count.
- **Removing `upsert_transaction`'s anon EXECUTE revoke reopens an unauthenticated RLS-bypassing
  write path** (the NULL-uid = service-role assumption depends on it).
- **pgcrypto** is enabled at the END of the initial migration, after `accept_invite` (fine —
  function creation doesn't execute the body).
- Fixed local ports (§2) — collisions with another local Supabase project fail `supabase start`.

## 11. Cross-links

- [web.md](./web.md): client construction in `web/lib/supabase/client.ts` (Keychain-storage
  singleton on Capacitor iOS), typed row seam `web/lib/supabase/rows.ts`, domain types
  `web/lib/types.ts`, RPC call sites `web/lib/api/aggregates.ts`.
- [ios.md](./ios.md): the Capacitor shell ships the web bundle; the frozen SwiftUI app's
  `iOS/Ortho-iOS/App/SupabaseConfig.swift.template` documents the gitignored config.
- [finance.md](./finance.md) + [shared.md](./shared.md): the client-side money math and golden
  vectors that produce the rows stored here — the DB stores, clients compute.
- [makefile.md](./makefile.md): `make ingest` / `make tx-*` write to these tables via the CLI.
