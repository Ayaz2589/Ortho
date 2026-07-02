# Supabase Backend (`supabase/`)

## 1. Purpose

`supabase/` is the single shared backend for all three Ortho surfaces — the iOS app (`iOS/`), the Next.js web app (`web/`), and the bank-statement/transaction CLI (`web/scripts/import/`). It is **not** a server application: there is no custom backend tier and no edge functions. It consists of:

- a versioned **Postgres schema** (SQL migrations) for households, people, transactions + per-person cent splits, cards, properties/mortgage/lease/units, rental payments, and budgets;
- **Row-Level Security (RLS)** policies that are the real authorization layer (clients hold only publishable/anon keys);
- a handful of **Postgres functions/RPCs** (invite redemption + dashboard aggregates) callable via PostgREST `rpc`;
- the **Supabase CLI config** (`supabase/config.toml`) for running a local stack and pushing migrations to the linked hosted project.

Every money value in the schema is an integer of **USD cents** (`bigint`); display-currency conversion is purely a client concern. Business logic that both apps need identically (splits, mortgage math, insights) lives in client code pinned by golden vectors in `shared/test-vectors/` — the database only stores data and does simple household-scoped aggregation.

## 2. Stack & key dependencies

- **Postgres 17** (`major_version = 17` in `supabase/config.toml`; the linked project reports `17.6.1.121` in `supabase/.temp/postgres-version`).
- **Supabase platform**: PostgREST API (port 54321 locally), GoTrue auth (email OTP, no OAuth providers enabled), Realtime, Storage (enabled but no buckets defined), Studio (54323), Inbucket email-testing UI (54324), analytics (54327).
- **pgcrypto** extension — required by the `accept_invite` RPC for `digest(..., 'sha256')` (enabled in the initial migration).
- **Supabase CLI** — the only tool needed to operate this directory (`supabase start`, `supabase db push`, `supabase db reset`, `supabase migration new`).
- Hosted project: ref `brujhxmtzfgowimprueo`, name "Ortho" (recorded in gitignored `supabase/.temp/linked-project.json`). URL: `https://brujhxmtzfgowimprueo.supabase.co`.

No `package.json`, no Deno edge functions, no generated TypeScript types — clients hand-write their row types (`web/lib/types.ts`, iOS `Models/`).

## 3. Directory map

```
supabase/
├── config.toml                  # Supabase CLI config: ports, auth, session timebox, seed paths
├── .gitignore                   # ignores .branches/, .temp/, dotenvx env files
├── .branches/_current_branch    # local CLI state ("main") — gitignored
├── .temp/                       # linked-project metadata (project ref, service versions) — gitignored
├── snippets/                    # empty (Studio SQL snippets placeholder)
└── migrations/                  # the entire schema, in timestamp order
    ├── 20260521120000_initial_schema.sql                    # enums, 12 tables, indexes, RLS, accept_invite RPC
    ├── 20260521150000_budgets.sql                           # budgets table + RLS
    ├── 20260522170000_add_entertainment_category.sql        # + 'entertainment' enum value
    ├── 20260610000000_platform_locks.sql                    # platform_locks table (feature since retired in clients)
    ├── 20260611120000_aggregates.sql                        # 4 dashboard aggregate RPCs
    ├── 20260616120000_household_people_and_value_splits.sql # household_people; shares -> cents; drops scope
    └── 20260618120000_member_reimbursement.sql              # 'transfer' kind/category + transactions.paid_by
```

## 4. Architecture

### 4.1 Current schema (net effect of all 7 migrations)

**Enums**
- `role`: `owner | member` (`admin` intentionally deferred — see initial migration header)
- `transaction_kind`: `expense | income | transfer` (`transfer` = member-to-member reimbursement, feature 012)
- `transaction_category`: `coffee, groceries, dining, subs, fuel, rent, health, income, transit, utilities, entertainment, transfer`
- `property_kind`: `primary_home | multifamily | rental`
- `transaction_scope` was created in the initial schema and **dropped** by the 20260616 migration (scope model collapsed into one household ledger).

**Identity & membership**
- `users` — profile row mirroring `auth.users` (`id` = `auth.uid()`; `name`, `initial`, `color_key`). Clients upsert it on sign-in.
- `households` — `owner_id` → `users`.
- `household_members` — `(household_id, user_id)` PK + `role`. Auth-level membership.
- `household_people` — the *display* roster (feature 007): name-only people with `initial`, `color_key`, optional `linked_user_id` → `users`, `sort_order`, and soft-remove via `removed_at`. Splits and balances reference **people**, not users.
- `pending_invites` — invite rows keyed by `token_hash` (sha256 of the raw token), with `expires_at`/`redeemed_at`; redeemed via the `accept_invite` RPC.
- `platform_locks` — `(user_id, platform in ('web','ios'))`. Built for a single-active-platform lock that was **removed in feature 010** (see `web/proxy.ts` comment and `PARITY.md`); the table remains in migrations but no client writes it anymore.

**Money**
- `transactions` — `household_id` (NOT NULL since 20260616), `merchant`, `category`, `kind`, `amount_cents bigint` (≥ 0 check), `source` (free text, default `''`), `date timestamptz`, `created_by` → `users`, `paid_by` → `household_people` (feature 012: who fronted an expense / the sender of a transfer), `created_at`/`updated_at` (touched by trigger).
- `transaction_shares` — `(transaction_id, person_id)` PK + `amount_cents`. Authoritative **cents per person**, materialized on every save and summing to the transaction amount (the sum invariant is enforced client-side, not in SQL — noted in the initial migration). Originally `(transaction_id, user_id, percent)`; migrated to cents/person in 20260616 with a rounding-reconciliation step that assigns leftover cents to the lowest-`sort_order` person.
- `budgets` — one row per `(household_id, category)` (UNIQUE), `monthly_limit_cents`.
- `cards` — named payment sources per household.

**Housing**
- `properties` (`kind`, `address`, `nickname`) with 1:1 sub-tables `mortgage_info` (primary_home/multifamily: purchase price, original loan, rate `numeric(7,4)`, term, closing date) and `lease_info` (rental: rent, lease dates with `lease_end >= lease_start` check, deposit), N:1 `units` (multifamily), and `rental_payments`. Kind ↔ sub-table shape is enforced by app logic, not SQL.

### 4.2 RLS model

RLS is enabled on **every** table. The pattern:

- Three `SECURITY DEFINER` helper functions break the self-referencing RLS recursion on `household_members`: `is_household_member(uuid)`, `is_household_owner(uuid)`, `is_property_household_member(uuid)` (all `stable`, `set search_path = public`).
- `users`: self read/insert/update, plus read of household peers (so activity lists can render names/avatars).
- `households`: member select; insert requires `owner_id = auth.uid()`; owner-only update/delete.
- `household_members`: member select; insert by owner *or* self-insert of one's own `owner` row (household creation); owner delete + self delete (leave).
- `pending_invites`: owner-only select/insert/delete.
- `transactions` (post-20260616): select = any household member; insert = `created_by = auth.uid()` AND member; update/delete = creator OR household owner.
- `transaction_shares`: piggyback on the parent transaction's visibility/writability via `EXISTS` subqueries.
- `household_people`, `cards`, `budgets`, `properties` + housing sub-tables: plain member read/write (properties are owned collectively by the household).
- `platform_locks`: strict self-only CRUD.

### 4.3 RPCs (PostgREST `rpc`)

All are `SECURITY DEFINER`, revoke-from-public + grant-to-`authenticated`, and re-check authorization internally:

- `accept_invite(p_token text) → uuid` (initial migration) — hashes the raw token, locks the matching unredeemed/unexpired invite `FOR UPDATE`, idempotently inserts the membership, marks the invite redeemed, returns the household id. Raises on invalid/expired token or unauthenticated caller.
- `household_owner_spend(p_household_id, p_start, p_end) → (person_id, cents)` — per-person split-weighted expense. **Redefined** in 20260616 (was `(user_id, cents)` with percent weighting; now a plain sum of materialized `transaction_shares.amount_cents` — the old function is dropped first because the return type changed).
- `household_category_totals(...) → (category, cents)` — full-amount expense per category.
- `household_month_summary(...) → (income, expense, net)`.
- `household_daily_expense(...) → (day, cents)` — one row per day with expense.

Date ranges are **half-open** (`date >= p_start AND date < p_end`), matching the client `monthBounds`/`inRange` convention (see `PARITY.md`). All four aggregates operate on a household's transactions only and return USD cents; the web app calls them from `web/lib/api/aggregates.ts`.

### 4.4 Migration history as feature history

| Migration | Feature | What it did |
|---|---|---|
| `20260521120000_initial_schema.sql` | v1 | Enums, 12 tables, indexes, `touch_updated_at` trigger, RLS everywhere, `accept_invite`, pgcrypto |
| `20260521150000_budgets.sql` | budgets | `budgets` table, unique per (household, category), member RLS |
| `20260522170000_add_entertainment_category.sql` | — | `ALTER TYPE transaction_category ADD VALUE 'entertainment'` |
| `20260610000000_platform_locks.sql` | web port | `platform_locks` single-device lock (clients later dropped the feature in 010) |
| `20260611120000_aggregates.sql` | 002-logic-dedup | 4 aggregate RPCs so Swift + TS stop duplicating rollups |
| `20260616120000_household_people_and_value_splits.sql` | 007-household-splits | `household_people`; `transaction_shares` percent→cents/person with backfill + rounding reconcile; drop `scope`; `household_id` NOT NULL; RLS rewrite; `household_owner_spend` redefined |
| `20260618120000_member_reimbursement.sql` | 012-household-reimbursement | `transfer` kind + category enum values; `transactions.paid_by` + backfill from `created_by` |

The 20260616 migration is **forward-only and destructive** (drops columns/constraints/policies with data backfill in between) — read it before writing any migration that touches `transactions` or `transaction_shares`.

## 5. Key files

1. `supabase/migrations/20260521120000_initial_schema.sql` — the foundation: enums, all core tables, indexes, RLS helper functions, most policies, `accept_invite`. Read first.
2. `supabase/migrations/20260616120000_household_people_and_value_splits.sql` — the biggest schema rewrite; defines the *current* shape of `transactions`/`transaction_shares` and their RLS.
3. `supabase/migrations/20260618120000_member_reimbursement.sql` — latest migration: `paid_by` + `transfer`.
4. `supabase/migrations/20260611120000_aggregates.sql` — the aggregate RPC contract both apps rely on (note `household_owner_spend` is superseded by 20260616).
5. `supabase/migrations/20260521150000_budgets.sql` — budgets table + RLS.
6. `supabase/migrations/20260610000000_platform_locks.sql` — retired-feature table; context for why `platform_locks` exists.
7. `supabase/migrations/20260522170000_add_entertainment_category.sql` — the enum-value-addition pattern (see Gotchas).
8. `supabase/config.toml` — ports, Postgres 17, auth settings (email OTP, 30-day session `timebox = "720h"`), seed config.
9. `supabase/.gitignore` — `.branches/`, `.temp/`, dotenvx env files.
10. `web/lib/supabase/client.ts` + `web/lib/supabase/server.ts` — how web constructs clients from `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
11. `web/lib/api/aggregates.ts` — the only web call sites of the four aggregate RPCs.
12. `web/proxy.ts` — auth-gating proxy/middleware; documents the removal of the platform lock and the session-timebox behavior.
13. `iOS/Ortho-iOS/App/SupabaseConfig.swift.template` — committed placeholder for the gitignored `SupabaseConfig.swift` (project URL + publishable key).
14. `web/scripts/import/db/client.ts` — CLI client: OTP sign-in mode vs `--admin` service-role mode; loads `web/.env.local`.
15. `PARITY.md` — the cross-surface contract the schema serves (USD-cents invariant, half-open month ranges, `paid_by`/`transfer`).

## 6. How to build / run / test

There is no build or test suite in `supabase/` itself — the schema's behavior is exercised by the web (`cd web && npm test`) and iOS test suites. The Supabase CLI is everything:

```bash
# Local stack (Docker required; works on Linux — no macOS dependency)
supabase start                 # API :54321, DB :54322, Studio :54323, Inbucket :54324
supabase db reset              # recreate local DB, replay all migrations (seed step is a no-op — see Gotchas)
supabase stop

# New schema change
supabase migration new <name>  # creates supabase/migrations/<ts>_<name>.sql

# Hosted project (needs access token + DB password; project ref brujhxmtzfgowimprueo)
supabase link --project-ref brujhxmtzfgowimprueo
supabase db push               # apply pending migrations to the linked project
```

To point the **web app** at the local stack, set in `web/.env.local` (gitignored): `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` and `NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key from supabase start output>`. OTP sign-in emails land in Inbucket at `http://127.0.0.1:54324` locally. The **iOS app** reads `iOS/Ortho-iOS/App/SupabaseConfig.swift` (gitignored; copy from the committed `.template`) — but building iOS requires Xcode/macOS, so in a Linux sandbox only the web app and CLI can exercise the backend.

Environment variables / keys the clients need:

| Consumer | Variable / file | Notes |
|---|---|---|
| web app | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `web/.env.local` | used by `web/lib/supabase/{client,server}.ts` and `web/proxy.ts` |
| import/tx CLI | same two, plus `IMPORT_EMAIL` (OTP sign-in) or `SUPABASE_SERVICE_ROLE_KEY` (`ADMIN=1`) | loaded from `web/.env.local` by `web/scripts/import/db/client.ts`; see root `Makefile` `ingest-help` |
| iOS app | `SupabaseConfig.projectURL`, `SupabaseConfig.publishableKey` in `iOS/Ortho-iOS/App/SupabaseConfig.swift` | gitignored; publishable key is client-safe because RLS is the enforcement layer |

The service-role key bypasses RLS — it is only for the CLI's `--admin` mode and must never ship in a client.

## 7. Conventions & patterns

- **Money = `bigint` USD cents**, always with a `>= 0` CHECK. Currency display is client-side; never store display currency server-side.
- **Migrations are heavily commented** — each file opens with a header naming the feature (`specs/NNN-*`), the design intent, and any invariants deliberately left to the client (e.g. shares-sum-to-amount). Follow that style.
- **RLS on every table, no exceptions**; authorization questions about membership always go through the `SECURITY DEFINER` helpers (never inline a `household_members` subquery in a `household_members` policy — infinite recursion).
- **RPCs**: `SECURITY DEFINER` + `set search_path = public` + internal `is_household_member`/`auth.uid()` re-check + `revoke ... from public; grant execute ... to authenticated`.
- `updated_at` maintained by the shared `touch_updated_at()` trigger (`transactions`, `properties`, `budgets`).
- Timestamps are `timestamptz` for transactions, plain `date` for housing dates/rental payments. Aggregate ranges are half-open `[start, end)`.
- `snake_case` SQL everywhere; enum types are unprefixed (`role`, `transaction_kind`, ...); indexes named `<table>_<cols>_idx`.
- Soft-delete pattern: `household_people.removed_at` (hidden from pickers, history preserved) rather than row deletion.

## 8. Gotchas

- **New enum values must be an isolated, "not referenced in the same migration" change.** `ALTER TYPE ... ADD VALUE` can't run in an explicit transaction, and a value added in a migration can't be *used* by later statements in that same migration. Both `20260522170000` and `20260618120000` document this pattern (the 012 backfill deliberately only uses pre-existing values).
- **`config.toml` declares `seed.sql` but no seed file exists.** `[db.seed]` lists `./seed.sql`, but there is no `supabase/seed.sql` in the repo — `supabase db reset` gives you migrations only, with **no data**. Local sign-ins start from an empty database.
- **The live DB may be ahead of / behind the migrations dir.** A prior session found `platform_locks` had *not* been pushed to the hosted project (REST 404) even though the migration exists; conversely the auth session timebox (`timebox = "720h"`, feature 010's 30-day cap) must also be enabled on the hosted project (Dashboard → Auth → Sessions, or `supabase config push`) — the config.toml comment at the `[auth.sessions]` section calls this out explicitly. Don't assume config.toml == production.
- **`household_owner_spend` was redefined with a different return type** (`user_id` → `person_id`). Any consumer or doc referencing the 20260611 signature is stale; 20260616 is authoritative.
- **Shares-sum invariant lives in the clients.** Nothing in SQL forces `sum(transaction_shares.amount_cents) = transactions.amount_cents`. Writes that bypass the apps' atomic parent+shares logic (e.g. raw SQL, the CLI's non-compensating path noted in `PARITY.md`) can silently break dashboards.
- **`transactions_insert` RLS pins `created_by = auth.uid()`** — the CLI's `--admin` (service-role) mode exists precisely because cross-account attribution is impossible under RLS.
- **`.temp/` and `.branches/` are gitignored CLI state.** They contain the linked project ref and service versions; they are informative but must not be committed, and a fresh clone won't have them until `supabase link`.
- **`platform_locks` is a zombie table**: still in migrations, self-only RLS, but the single-active-platform feature was removed in feature 010 (`web/proxy.ts` comment; only a web test comment still references it). Don't build on it without reading that history.
- Local ports are fixed in `config.toml` (54321 API / 54322 DB / 54323 Studio / 54324 Inbucket / 54327 analytics) — collisions with another local Supabase project will fail `supabase start`.

## 9. Cross-links

- **Web** (`./web.md`): clients in `web/lib/supabase/{client,server}.ts` (via `@supabase/ssr`), auth gating in `web/proxy.ts`, RPC calls in `web/lib/api/aggregates.ts`, hand-written row types in `web/lib/types.ts` mirroring these tables/enums.
- **iOS** (`./ios.md`): `iOS/Ortho-iOS/App/SupabaseConfig.swift` (+ committed `.template`), `Services/*API.swift` talk to the same tables via the Supabase Swift SDK; `Models/` mirror the enums (a Swift enum member must be added whenever a Postgres enum value is added — the `entertainment` migration documents this coupling).
- **Shared** (`./shared.md`): golden vectors in `shared/test-vectors/` pin the client-side math (splits, money, balances) that produces the rows stored here; the DB stores the results, it doesn't compute them.
- **Makefile / CLI** (`./makefile.md`): `make ingest` / `make tx-*` drive `web/scripts/import/{cli,tx}.ts`, which write to these tables using the same env vars, with an RLS-bypassing `--admin` service-role mode.
- **Specs**: `specs/002-logic-dedup` (aggregates), `specs/007-household-splits` (people + cent splits), `specs/010-*` (session cap / lock removal), `specs/012-household-reimbursement` (paid_by + transfer) explain the *why* behind each migration.
