# Feature Specification: Holistic Seed System + Env-Gated Auth for Local/Stage

**Feature Branch**: `feat/030-holistic-seed-auth`

**Created**: 2026-07-22

**Status**: Draft

**Input**: User description: "There is dummy data in the system I input by hand. Remove it. Then
build a holistic seed system so we can fully test every aspect of the app against it and use it to
build new features. Also disable auth for local and stage environments." Decisions taken with the
founder: auth-disable = **auto-login a known seed user against a REAL seeded backend** (not the
in-memory stub) so RLS / RPCs / edge functions all run for real; introduce a **first-class staging
environment** via `NEXT_PUBLIC_APP_ENV = local | stage | prod`; this is a **full implementation**
(not doc-only); documented as a spec-kit feature.

## Overview

Today Ortho has three disconnected pieces of "not-real-user" data and no first-class way to run the
app without signing in:

1. **A hand-authored in-app sample** — `web/lib/testdata/seed.ts`: ~16 transactions for one
   Ava/Ben household, served in-memory by `web/lib/testdata/memory-client.ts`, reachable only
   behind spec-015's `isTestBuild()`-gated "Use test data" / "Bypass auth" flags. This is the
   "dummy data I input by hand" — small, happy-path, and it never touches a backend (the memory
   client swallows all writes). It omits goals, tags/notes, linked banks, and entitlement states,
   so those screens are empty in test-data mode.
2. **The spec-026 coverage corpus** — `web/test/corpus/`: a shipped, deterministic, snapshot-locked
   generator of 232 edge-case households across 27 coverage dimensions, reusing the real split
   math. It is excellent but **coverage-over-volume** (edge branches, not realism), it is **not**
   reachable from the app bundle, and its DB seeder (`npm run seed:corpus`) writes only **13 of the
   ~19 tables the store loads** — it omits `goals`, `goal_contributions`, `tags`,
   `transaction_tags`, transaction `notes`, `linked_institutions`, `linked_accounts`, and
   `entitlements`.
3. **`supabase/seed.sql`** — intentionally empty; devs sign into the **shared hosted production
   project** for local development (there is no local or staging backend wired up).

The result: there is no single dataset that populates **every** screen, and every developer either
signs into production or toggles a per-browser flag that shows a tidy 16-row world. Building a new
feature means hand-entering data against the live backend.

This feature delivers **one holistic seed system** and **environment-gated auth** so a developer
(or an automated test, or a demo) can, in a **local or staging** environment, open the app, be
**auto-signed-in as a known seed user**, and see a **fully populated, realistic household** backed
by a **real Supabase** (real RLS, real RPCs, real edge functions) — never production. The same
generator powers the automated test suite, the in-app "Use test data" mode, and the real-DB seeder,
so the three pieces above converge on a single source of truth.

Concretely it (a) **extends the spec-026 corpus** to the 7 missing tables plus a realism layer
(spec-026 §9.2, previously out of scope), (b) **extends the seeder** to populate a real
local/staging Supabase end-to-end including `auth.users` and `entitlements`, (c) introduces a
**first-class `NEXT_PUBLIC_APP_ENV`** environment signal and an **auto-login** seam that skips the
sign-in screen for a real seed session in local/stage while leaving **production fully locked**, and
(d) **removes the hand-authored dummy data** by sourcing the in-app "Use test data" mode from the
corpus.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Auto-signed-in, fully populated app in local/stage (Priority: P1)

A developer runs the app locally (or opens the staging deploy). The app detects a non-production
environment, **auto-authenticates a known seed user against the real (local/staging) Supabase**, and
lands on a Dashboard already populated with the seed user's household: months of transactions with
splits/tags/notes, budgets in every band, goals on/off pace, a mortgaged home and a rental, linked
banks, and an active subscription — no sign-in screen, no OTP, no manual data entry.

**Why this priority**: This is the payoff the founder asked for — "fully test every aspect of this
app" and "use it to build new features" without hand-entering data or touching production.

**Independent Test**: With `NEXT_PUBLIC_APP_ENV=local` and auto-login configured against a seeded
local Supabase, load the app cold and confirm (a) no redirect to `/sign-in`, (b) a real session
exists (`auth.getUser()` returns the seed user), and (c) every major destination (Dashboard,
Transactions, Housing, Settings→Planning/Goals/Budgets, Settings→Linked banks, Subscription) renders
seed data rather than an empty state.

**Acceptance Scenarios**:

1. **Given** `NEXT_PUBLIC_APP_ENV` is `local` or `stage` and auto-login is configured, **When** the
   app boots with no existing session, **Then** it signs in the seed user against the real backend
   and renders the seed household without showing the sign-in screen.
2. **Given** the seed user is signed in, **When** they create/edit/delete a transaction, **Then** it
   persists through the real `upsert_transaction` RPC under real RLS (unlike the in-memory stub,
   which drops writes).
3. **Given** `NEXT_PUBLIC_APP_ENV` is `prod` (or unset/unknown), **When** the app boots, **Then**
   auto-login is impossible and the normal OTP sign-in gate is enforced.

---

### User Story 2 — Holistic seed populates every screen from one deterministic source (Priority: P1)

A developer runs the seeder against a local (or staging) Supabase. It populates **every** table the
store reads — including goals, tags/notes, linked banks, and entitlements — from the **same
deterministic corpus** used by the test suite, idempotently (re-running yields the same rows).

**Why this priority**: A seed that leaves Goals, Tags/Notes, Linked-banks, and Subscription screens
empty cannot "test every aspect." One generator (not a divergent hand list) keeps the seed a
faithful mirror of production behavior and reproducible.

**Independent Test**: Seed a fresh local Supabase; confirm each of the 19 store-loaded tables is
non-empty for the demo household and that a coverage check maps every feature dimension to ≥1 seeded
row. Re-run and confirm no duplicate rows.

**Acceptance Scenarios**:

1. **Given** the corpus, **When** enumerated, **Then** it contains ≥1 labelled scenario for each new
   coverage dimension (goals on/off-pace/reached/past-due/undated/debt; every entitlement gate
   state; `flex`/`non_monthly` budgets with rollover history; tags+notes; active/disconnected/Plaid
   vs SimpleFIN institutions) in addition to the 27 existing dimensions.
2. **Given** a fresh local Supabase, **When** `npm run seed:corpus` runs, **Then** all 19
   store-loaded tables are populated and `auth.users` + `entitlements` exist for the seed users.
3. **Given** a Supabase already seeded from the corpus, **When** the seeder runs again, **Then** the
   row set is identical (idempotent, stable ids).
4. **Given** a target that is not a clearly local/staging database, **When** seeding is attempted,
   **Then** the seeder refuses to write (production is never seeded).

---

### User Story 3 — The in-app "Use test data" mode shows the holistic seed, not hand rows (Priority: P2)

A developer on any non-production build toggles "Use test data" (or it is auto-on in local/stage) and
the app runs on a **curated subset of the corpus** — not the 16 hand-authored rows. The hand-authored
`seed.ts` data is removed; the sample it served now derives from the single generator.

**Why this priority**: Removes the "dummy data I input by hand" as asked, and makes the offline
in-memory mode consistent with the real seed. P2 because P1 (real backend) is the primary path;
this keeps the zero-backend mode useful and honest.

**Independent Test**: With test-data mode on and no backend, confirm the app renders a corpus-derived
household (with goals/tags/banks present) and that `web/lib/testdata/seed.ts`'s hand-authored arrays
no longer exist.

**Acceptance Scenarios**:

1. **Given** a non-production build with test-data mode on, **When** the app boots with no backend,
   **Then** it renders a corpus-derived household including goals, tags, and linked banks.
2. **Given** the codebase, **When** searched, **Then** no hand-authored fake-transaction arrays
   remain in `web/lib/` (the sample is generated).

---

### User Story 4 — Staging is a real, isolated environment distinct from production (Priority: P2)

An operator promotes a build to **staging** (a dedicated Vercel environment reading a dedicated
staging Supabase project). Staging behaves like production (real backend, real edge functions) but
is auto-signed-in on the seed data and never reads or writes production data.

**Why this priority**: "Disable auth for local **and stage**" presupposes a stage that exists and is
safely separable from prod. P2 because the code seam (the `NEXT_PUBLIC_APP_ENV` gate) ships in this
feature; provisioning the cloud resources is an operator step (see Assumptions / Operator Runbook).

**Acceptance Scenarios**:

1. **Given** the staging Vercel environment with `NEXT_PUBLIC_APP_ENV=stage` and staging Supabase
   credentials, **When** the app loads, **Then** it auto-signs-in the seed user against the staging
   backend and never contacts the production project.
2. **Given** production (`NEXT_PUBLIC_APP_ENV=prod`), **When** the app is built, **Then** the
   auto-login and test-data code paths dead-code-eliminate (as the spec-015 flags already do).

---

### Edge Cases

- **Production safety is absolute.** Auto-login and test-data must be *provably impossible* in
  production. Gating requires an explicit non-prod `NEXT_PUBLIC_APP_ENV` **and** an explicit
  auto-login opt-in var; an unknown/unset environment resolves to `prod` (deny by default).
- **Relative-to-now thresholds.** Entitlement gate states, goal pacing, budget "under" (needs ≥70%
  of month elapsed), and insight windows are all relative to *now*. A seed pinned to a fixed epoch
  may not trip them when viewed on an arbitrary real date. The seeder MUST anchor time-relative rows
  to an injectable "now" (default: today) so thresholds fire when the seed is viewed.
- **`entitlements` is user-scoped, not household-scoped.** The corpus is household-scoped; the seed
  must define a user→entitlement mapping and, for gate-state coverage, mint distinct users with
  distinct statuses.
- **`auth.users` must exist for RLS.** `public.users.id` FK-references `auth.users(id)` and RLS keys
  off `auth.uid()`. The seeder must create `auth.users` rows (via the Admin API) with a known
  password so auto-login (`signInWithPassword`) works — OTP-only is not scriptable.
- **Linked-bank write policies.** `linked_institutions` / `linked_accounts` are edge-function-write
  only (client SELECT). A service-role seeder bypasses RLS and may insert display rows directly;
  it must NOT fabricate Vault secrets — seeded institutions are display-only (no real provider
  connection), which is acceptable for connect-scope UI (no balances/transactions synced).
- **Snapshot churn.** Extending the corpus shape changes the committed manifest snapshot; the
  `CORPUS_VERSION` bump + regenerated snapshot is the intended review artifact (the diff *is* the
  behavior review), not a failure.
- **Bundle size.** The in-app test-data path ships in the bundle; the corpus subset it uses must be
  lazily/lightly constructed so realism additions do not inflate the customer bundle (the corpus
  proper stays bundle-excluded via `no-bundle-import.test.ts`).

## Requirements *(mandatory)*

### Functional Requirements

**Environment & auth**

- **FR-001**: Introduce a single environment signal `appEnv(): 'local' | 'stage' | 'prod'` sourced
  from `NEXT_PUBLIC_APP_ENV`, falling back to `NEXT_PUBLIC_VERCEL_ENV` (`production→prod`,
  `preview→stage`, `development→local`) then `NODE_ENV`, and defaulting to **`prod` when uncertain**.
- **FR-002**: `isTestBuild()` MUST be redefined as `appEnv() !== 'prod'` (preserving its current
  truth table: production→false; local/preview/dev/test→true) so all existing spec-015 gating keeps
  working unchanged.
- **FR-003**: Provide an **auto-login** path that, only when `appEnv() !== 'prod'` **and** an
  explicit `NEXT_PUBLIC_DEV_AUTOLOGIN` opt-in is set **and** seed credentials are configured, signs
  in a known seed user against the **real** Supabase (`signInWithPassword`) instead of showing the
  sign-in screen. All three conditions are required (defense in depth).
- **FR-004**: In production, auto-login and test-data paths MUST be unreachable and MUST
  dead-code-eliminate from the bundle (as spec-015 flags already do). No persisted value or hand-set
  flag can enable them when `appEnv() === 'prod'`.
- **FR-005**: Auto-login MUST use the **real** Supabase client (real session, RLS, RPCs, edge
  functions), NOT the in-memory `memory-client`. The existing `bypassAuth` (in-memory) path MUST
  remain available but MUST be decoupled from auto-login so the two modes are distinct and
  independently selectable.

**Holistic seed generator**

- **FR-006**: Extend the spec-026 corpus generator to also emit rows for the currently-missing
  tables: `goals`, `goal_contributions`, `tags`, `transaction_tags`, transaction `notes`,
  `linked_institutions`, `linked_accounts`, and `entitlements` — reusing existing `lib/types` row
  shapes and existing domain logic (no forked math), preserving determinism and byte-stable
  serialization.
- **FR-007**: Add coverage dimensions (extending the 27-entry matrix) so the completeness test forces
  ≥1 scenario for: goals on-pace / off-track / past-due-unreached / reached / undated / debt_payoff;
  a goal with `linked_category` and one with `linked_account_id`; `flex` and `non_monthly` budgets
  with multi-month rollover history (positive carry, forgiven overspend, capped flex); transactions
  carrying tags **and** notes; each billing **gate state** (admin, trialing, active, grace/past_due,
  lapsed); and an active / a disconnected / a Plaid vs SimpleFIN institution.
- **FR-008**: Add scenarios that provably trip the currently-unguaranteed insight rules
  (month-over-month category delta, savings-rate ≥ 20%, outlier ≥ 2× median & ≥ $500, 30-day spend
  trend ≥ 20%, mortgage affordability bands) so a seeded household lights up every Insights rule.
- **FR-009**: Introduce a **realism layer** (spec-026 §9.2 / FR-011 seam) supplying believable
  distributions (category mix, amount ranges, cadence, subscription creep, over-budget hazard,
  split-structure) sourced from `docs/research/finance-habits-budgeting-apps.md`, wired as pluggable
  distribution **inputs** to the generator so realism is separable from edge coverage and either can
  be toggled. Designate one **primary demo household** that is realistic (not an edge case) as the
  auto-login user's household.
- **FR-010**: Time-relative rows (entitlement expiry, goal pacing, budget-month elapsed, insight
  windows) MUST anchor to an injectable "now" (default: the current date) so the seed trips
  thresholds when viewed, while the pure test corpus remains pinned to its fixed epoch for
  byte-stability. The realism/demo layer and the edge corpus MAY use different clocks.

**Real-DB seeder**

- **FR-011**: Extend the seeder (`web/scripts/seed-corpus.ts`) to write the new tables in
  foreign-key order, remap readable ids → stable UUIDs, and remain idempotent (stable-id UPSERTs).
- **FR-012**: The seeder MUST create `auth.users` rows via the Supabase Admin API (email + known
  password, email pre-confirmed) for the seed users so auto-login works, and MUST insert
  `entitlements` rows directly as service-role (since `ensure_entitlement()` requires `auth.uid()`
  and cannot be called by a service-role connection).
- **FR-013**: Seed `transactions` + `transaction_shares` through a path that enforces the
  shares-sum-to-total invariant (the `upsert_transaction` RPC, or a raw UPSERT only when the corpus
  already guarantees the sum, as today) — never emit a transaction whose shares do not reconcile.
- **FR-014**: The seeder MUST retain the safe-target guard (`checkSeedTarget`) so it refuses any
  non-local/non-staging target unless the loud double opt-in is set; **production is never seeded**.
- **FR-015**: The seeder MUST NOT write derived/runtime data: budget carry/rollover, goal
  progress/pacing, member balances (all client-derived), nor `platform_locks`, `billing_events`,
  `plaid_link_sessions`, or Vault `linked_institution_secrets`.

**Dummy-data removal**

- **FR-016**: Remove the hand-authored sample in `web/lib/testdata/seed.ts` and source the in-app
  "Use test data" dataset from the corpus (a curated, bundle-safe subset) instead, keeping the
  spec-015 flag feature, its tests, and its i18n keys consistent and the suite green.
- **FR-017**: Remove untracked scratch (`temp/`) from the working tree where present; leave
  generated test infrastructure (spec-026 corpus, `shared/test-vectors`, golden fixtures,
  `supabase/tests/*.sql`, the empty `supabase/seed.sql`) untouched — deleting it would break CI.

### Key Entities *(include if feature involves data)*

- **App environment** — `local | stage | prod`; the single runtime discriminator; drives auth-disable
  and dead-code elimination.
- **Seed user** — a known `auth.users` + `public.users` identity with a scriptable password, owner of
  the primary demo household; the target of auto-login; carries an `entitlements` row.
- **Primary demo household** — one realistic (non-edge) scenario populating every screen; what the
  auto-login user sees.
- **Coverage scenario (extended)** — a spec-026 household scenario now also carrying goals +
  contributions, tags + transaction_tags, notes, linked institutions + accounts, and per-user
  entitlements.
- **Realism distribution inputs** — pluggable parameters (category mix, amounts, cadence, split
  structure, subscription creep) layered over the generation engine.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a `local`/`stage` build with auto-login configured, loading the app cold results in
  a real authenticated session with zero sign-in interaction; in a `prod` build the sign-in gate is
  always enforced (verified by automated tests of the gate + a prod dead-code check).
- **SC-002**: A fresh local Supabase seeded by `npm run seed:corpus` has all **19** store-loaded
  tables non-empty for the demo household, including `auth.users` and `entitlements`; re-running
  produces no duplicate rows.
- **SC-003**: Every new coverage dimension (FR-007) maps to ≥1 labelled scenario (completeness test),
  and every transaction's shares still reconcile exactly to its amount (100%).
- **SC-004**: No hand-authored fake-transaction arrays remain under `web/lib/`; the in-app test-data
  mode renders a corpus-derived household with goals/tags/banks present.
- **SC-005**: `cd web && npm test` and `npx tsc --noEmit` are green; the corpus snapshot regenerates
  deterministically and the vector-drift CI gate passes.
- **SC-006**: Production build contains no auto-login/test-data code (dead-code-eliminated), verified
  the same way spec-015 verifies flag elimination.

## Assumptions

- **Cloud provisioning is an operator step.** Creating the dedicated **staging Supabase project**,
  running migrations against it, and setting Vercel environment variables
  (`NEXT_PUBLIC_APP_ENV`, staging `NEXT_PUBLIC_SUPABASE_*`, auto-login opt-in + seed credentials per
  environment) cannot be done from a Linux sandbox and are documented in the Operator Runbook
  (`quickstart.md`). The code seam ships here and is exercised by the local path.
- **Local backend uses the Supabase local Docker stack** (`supabase start`, `config.toml`), the same
  target the spec-026 seeder already supports and the safe-target guard already allows.
- **The realism layer builds ON the spec-026 engine** (FR-011 seam) rather than editing the pure
  builders; edge coverage and realism coexist.
- **Seeded linked banks are display-only** (no Vault secret, no real provider) — sufficient for
  connect-scope UI, which never syncs balances/transactions.
- **US/USD-cents ledger is unchanged** (spec 027); display currency stays a render-time lens. This
  feature does not touch the §9.5 native-currency decision.

## Out of Scope

- Provisioning the staging Supabase project / Vercel environment (operator runbook, not code).
- A native-currency accounting ledger (spec-026 §9.5) — seed carries USD cents + display lens only.
- Fixing the A2/A4 defects the corpus pins (separate §9.4 track); this feature preserves those locks.
- Any production auth change — production sign-in (8-digit OTP) is untouched and fully enforced.
- Syncing real bank balances/transactions for seeded institutions (connect-scope only).
- An end-user UI to browse or manage the seed/corpus.
