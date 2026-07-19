# Phase 0 Research: SimpleFIN Bank-Sync (spec 028)

Grounded in `docs/research/competetive-analysis/simplefin-developer-analysis.md`
(SimpleFIN protocol + Bridge), the spec-024 Plaid patterns, and the current ledger
schema. SimpleFIN's field names are **version-dependent** (see D3) — the parser is
built defensively and pinned against fixtures, not against a single asserted schema.

## D1 — One claimed Access URL = one `linked_institutions` row

- **Decision**: model a single claimed SimpleFIN **Access URL** as **one**
  `linked_institutions` row (a "SimpleFIN connection"), even though `/accounts` can
  return accounts spanning multiple orgs/banks. Each returned account becomes a
  `linked_accounts` row; the bank/org name is stored per account (in `official_name`).
- **Rationale**: `linked_institution_secrets` is PK'd 1:1 on `institution_id`, and the
  Access URL is the single secret for the whole claimed connection. One-row-per-Access-URL
  keeps the existing 1:1 secret mapping and reuses every table unchanged.
- **Stable identity**: `provider_item_id = 'sfin_' || substr(sha256(access_url), 1, 32)`
  — deterministic, non-secret, unique per connection; satisfies the existing
  `UNIQUE(provider, provider_item_id)` idempotency anchor. The real Access URL lives
  **only** in Vault.
- **Alternatives**: one row per org (rejected — breaks 1:1 secret mapping, needs a
  secret-sharing table); a new `simplefin_connections` table (rejected — reshapes the
  provider model the seam was built to avoid).

## D2 — Synchronous claim; no link-session table

- **Decision**: the claim is synchronous inside `simplefin-claim`: base64-decode the
  setup token → POST the decoded claim URL → receive the Access URL → **immediately**
  persist it via an atomic `complete_simplefin_link` RPC (Vault secret + institution
  row) → then best-effort fetch `/accounts` to populate `linked_accounts`. No
  `plaid_link_sessions` analogue is needed (there is no async hosted flow, no
  public-token exchange step).
- **Reliability (FR-004)**: the token is **single-use** — the POST consumes it and the
  Access URL is returned exactly once. Therefore persisting the Access URL to Vault is
  the **first durable action** after the POST succeeds. If the client loses the
  response, the connection already exists server-side and appears on the next Linked
  banks load; the consumed token cannot (and need not) be re-claimed. Account
  population is idempotent and also runs on first sync, so a failure between
  secret-store and account-fetch self-heals.
- **Idempotency**: `complete_simplefin_link` upserts on `(provider, provider_item_id)`;
  re-running with the same Access URL reactivates rather than duplicates.
- **Alternatives**: a pending-session row (rejected — no async step to anchor; adds a
  zero-policy table for nothing); fetch accounts before storing the secret (rejected —
  risks consuming the token and losing the only credential).

## D3 — `/accounts` pull: windowed, defensive parsing

- **Decision**: `GET {ACCESS_URL}/accounts?start-date=<epoch>&end-date=<epoch>&pending=1`,
  windowed to ≤ 90 days per request. Parse defensively: accept both observed schema
  variants (v1 nested `org` + `errors`; v2 `connections` + `errlist`) by reading
  `accounts[].transactions[]` with tolerant field access. Required fields per txn:
  `id`, `amount` (signed decimal string), `posted` (unix epoch), `description`;
  optional: `pending`, `transacted_at`, `payee`, `memo`, `extra`.
- **Rationale**: the developer analysis found the published schema differs across
  protocol versions and our source fetches disagreed on key names (`errors` vs
  `errlist`, nested `org` vs top-level `connections`). Defensive parsing + fixture
  pinning is safer than asserting one shape. Version is pinned via `?version=...` and
  types are generated from a captured fixture (documented in quickstart as a live
  follow-up).
- **In-band errors**: SimpleFIN returns errors alongside data — surface them as a
  connection warning; still process the accounts/transactions that are present.
- **Alternatives**: assume one schema (rejected — brittle); require a live response
  before coding (rejected — no live account in CI; fixtures suffice for TDD).

## D4 — Amount normalization: signed decimal string → (abs cents, kind)

- **Decision**: `normalize.ts` converts SimpleFIN's signed decimal-string `amount` into
  the ledger's **non-negative** `amount_cents` plus a `transaction_kind`:
  - Parse sign and integer/fraction **without floating point** (string split on `.`,
    pad/truncate fraction to 2 digits, combine to integer cents).
  - **Sign mapping**: SimpleFIN `+` = inflow → `kind = 'income'`; `-` = outflow →
    `kind = 'expense'`. `amount_cents` is always the **absolute** value.
- **Rationale**: the ledger enforces `amount_cents >= 0` and carries direction in
  `kind` (`expense | income | transfer`), so there is **no negative to store** — the
  "inverted sign vs Plaid" hazard collapses into a correct sign→kind mapping, which is
  the single most important thing to test (a flip would swap income and spending).
  `transfer` is not inferred from SimpleFIN data in v1 (no reliable signal); everything
  is income or expense.
- **Edge cases pinned by fixtures**: `"-33.45"`→(3345,expense); `"100"`→(10000,income);
  `"-33.4"`→(3340,expense); `"0.00"`/`"0"`→(0, income by convention, flagged);
  values with extra fraction digits truncate deterministically; thousands separators are
  rejected (SimpleFIN does not use them).
- **Alternatives**: store signed cents (rejected — violates the `>= 0` check);
  `parseFloat` (rejected — float drift, e.g. `0.1+0.2`).

## D5 — Sync cadence, watermark, and manual-refresh rate limit

- **Decision**: per-connection sync state on `linked_institutions`:
  `last_synced_at timestamptz`, `last_manual_refresh_at timestamptz`,
  `sync_cursor text null` (reserved for a future delta cursor; SimpleFIN has no cursor
  today, so v1 uses the date window). First sync window =
  `[now - 90 days, now]`; subsequent windows = `[last_synced_at - 3 days, now]` (the
  3-day overlap re-catches late-posting/pending→posted, deduped by D6). Manual refresh
  is rate-limited to **1 per hour** per connection (`last_manual_refresh_at`), keeping
  well under SimpleFIN's ~24 req/day budget.
- **Scheduling**: the daily run is an **operator/deploy concern**, not CI code — a
  scheduled trigger (Supabase scheduled function / `pg_cron` / external cron) invokes
  `simplefin-sync` for each active connection. Documented in quickstart; not exercised
  in CI (no live account).
- **Alternatives**: webhooks (rejected — SimpleFIN has none); real cursor (rejected —
  not in the protocol; column reserved for the future).

## D6 — Dedupe & pending→posted reconciliation

- **Decision**: dedupe key is **`(provider_account_id, provider_txn_id)`** because
  SimpleFIN ids are unique only within an account. Store the origin on each ledger row
  (via `source = 'simplefin:' || provider_account_id || ':' || provider_txn_id`, or a
  dedicated column — see data-model D-schema) so a re-sync upserts the same ledger row
  instead of inserting a duplicate. Pending→posted: a pending txn is written with a
  deterministic id derived from the dedupe key; when the posted version arrives (same
  `id` in SimpleFIN, `pending` now false/absent) it **upserts the same ledger row**,
  flipping it from pending to posted. If the provider changes the id on posting, the
  overlap window + a `(account, amount, date±)` fallback match supersedes the pending
  row (documented, fixture-pinned).
- **Rationale**: keying the ledger row's identity to the provider dedupe key makes
  `upsert_transaction` naturally idempotent across overlapping windows.
- **Alternatives**: dedupe on `id` alone (rejected — cross-account collision); dedupe on
  amount+date (rejected — false merges of legitimately identical charges).

## D7 — Default split for synced transactions

- **Decision**: each synced transaction gets **one** share row = the whole amount to a
  single `household_people` person: the person whose `linked_user_id` = the connection's
  `created_by`, falling back to the household's lowest `sort_order` non-removed person.
  This satisfies `upsert_transaction`'s invariant (shares' `amount_cents` sum = total).
  Members re-split later with the existing editing UI.
- **Category/kind/merchant**: `category` = a default enum value (`other` if present,
  else the first safe existing value — confirmed against the enum at implementation);
  `kind` from D4; `merchant` = SimpleFIN `payee` ?? `description`; `source` carries the
  provider dedupe key; `notes` may carry `memo`.
- **Rationale**: minimal, correct, reversible; reuses the atomic write path exactly.
- **Alternatives**: even split across all people (rejected — guesses intent, harder to
  make sum exactly with rounding); no shares (rejected — `upsert_transaction` rejects
  share-less rows).

## D8 — Plaid containment mechanics (kept wired)

- **Decision**:
  - **Aggregation core**: move `src/plaid.ts` + `src/plaidClient.ts` →
    `src/deprecated/`, add `@deprecated` JSDoc banners, and **re-export them from
    `src/index.ts`** so edge functions importing the barrel are unaffected. Repoint the
    existing Plaid test imports to `deprecated/`.
  - **Sync-to-functions script**: the current `sync-to-functions.mjs` copies only
    **top-level** `.ts` files, so nested `deprecated/` files would be missed →
    **make it recurse** (walk subdirectories, preserve structure). The
    `shared-sync.test.ts` drift-lock is updated to compare the tree recursively.
  - **Edge functions**: `plaid-link-token` / `plaid-exchange` / `plaid-disconnect`
    **stay in place** (moving a function dir renames its deployed URL and breaks the
    live app) — add a deprecation banner comment only.
  - **Web**: move `components/settings/EmbeddedPlaidLink.tsx` →
    `components/settings/deprecated/`, add `@deprecated`, repoint imports. `PlaidHandBack`
    and the `plaid-oauth` route **stay in place** (routes) with banners. In
    `LinkedBanks.tsx`, SimpleFIN becomes the primary connect path; Plaid is a
    de-emphasized secondary option.
- **Rationale**: keeps every deploy URL and import path working (zero regression,
  rollback preserved) while making the deprecation legible in the tree. The CI drift
  lock stays green because the copy + test both go recursive together.
- **Alternatives**: delete Plaid (rejected — user chose contain-not-remove); move edge
  function dirs (rejected — breaks deployed function names/URLs).

## D9 — Testing strategy (Constitution VI)

- **Decision**: TDD with the existing `FetchLike` injection + `fakeFetch` helper. New
  Vitest suites: `normalize.test.ts` (money — heaviest), `simplefin-claim.test.ts`
  (token decode + request build + parse + idempotency-shape), `simplefin-accounts.test.ts`
  (windowed request, defensive parse, in-band errors, dedupe key, pending→posted).
  Edge-function pure logic (dedupe/reconcile decision, rate-limit gate) tested as pure
  functions in the core, imported by the Deno edge function (mirroring
  `plaid-exchange/completion.ts`). Regenerate `_shared` copy and keep the drift-lock green.
- **No network in tests**; no live Bridge account. Verification bar: `tsc --noEmit`,
  `npm test` (aggregation + web), Deno `deno check`/tests, `next build`, drift-lock.
