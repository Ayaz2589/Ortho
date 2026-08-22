# Ortho — Documentation Index

**Read this when:** starting any session in this repo. This is the map: what Ortho is, how the
pieces fit, which deep-dive doc to open next, and the invariants that cut across all of them.

## 1. What Ortho is

Ortho is a calm, money-first **household budgeting app** for two people sharing one household:
transactions with per-person splits, tags, and notes; budgets with rollover bucket types
(`fixed` / `flex` / `non_monthly`); savings and debt-payoff goals with pacing; member
settle-up balances; insights (8 rules + a goal off-track rule); housing (mortgage / lease / multifamily rental);
receipt/statement scan; connect-only Plaid bank linking; Stripe subscriptions behind a paywall;
user-configurable deposit accounts (spec 033, replacing the old hardcoded `INCOME_SOURCES`) and
PDF household data export/import under Settings → Data (`web/lib/dataFile/`);
6 languages and 7 display currencies over an integer-**USD-cents** ledger. It ships as a Next.js
static-export web app — the **single canonical implementation** — over a shared Supabase
(Postgres) backend, delivered on two targets: responsive web (Vercel) and, wrapped via
**Capacitor**, the iOS app (`web/ios/App/`). A deterministic terminal CLI (root `Makefile` →
`web/scripts/import/`) handles bank-statement import and transaction CRUD. Four destinations on
every canvas: **Dashboard, Transactions, Housing, Settings**. The Dashboard is a single-view
toggleable widget board (spec 034: registry `web/lib/widgets/registry.tsx`) sharing one month/range
scope across widgets (spec 035: `web/lib/useDashboardRange.ts`); the old savings-rate view is now
the `savings-trends` widget. Budgets/Goals live under Settings → Planning, not extra destinations.

> The earlier native SwiftUI app (`iOS/Ortho-iOS/`) is **frozen** since spec 021 (2026-07-09):
> rollback path + historical reference only, no new work. See [./ios.md](./ios.md).

## 2. The big picture

```
                    ┌─────────────────────────────────────┐
                    │ supabase/ (ref brujhxmtzfgowimprueo) │
                    │ 19 migrations · 26 tables · 11 enums │
                    │ RLS everywhere · 13 RPCs · 10 edge fns│
                    └───────▲────────────────────▲─────────┘
          8-digit email OTP │                    │ OTP, or service role (ADMIN=1)
        ┌───────────────────┴────────┐   ┌───────┴──────────────────┐
        │ web/  (Next.js 16, React 19)│   │ CLI (web/scripts/import/,│
        │ THE canonical implementation│   │ driven by root Makefile) │
        │ ├─ responsive web (Vercel)  │   └──────────────────────────┘
        │ └─ Capacitor iOS shell      │
        └───────────────┬─────────────┘
                        │ npm run gen:vectors / npm test
                        ▼
        shared/test-vectors/  13 JSON regression vectors
        (single-implementation pinning, asserted by 13 Vitest parity suites)
```

- **web is the sole canonical implementation**; the Capacitor shell and responsive web are the
  same build, composed per canvas — never a second implementation. Pure finance logic lives in
  `web/lib/*` (+ `web/components/dashboard/range.ts`, `web/components/housing/lease.ts`), pinned
  by regression vectors regenerated with `cd web && npm run gen:vectors`.
- **`PARITY.md` (repo root) is the audited web-vs-CLI contract**: a capability → TS file → vector
  matrix, known CLI divergences, enforcement. Reconcile it on any change to money, splits,
  balances, filters, month scoping, or status colors. Pre-021 web-vs-iOS history is archived at
  `docs/archive/PARITY-2026-07-08.md`.
- **Server-side code** exists only as edge functions: `supabase/functions/` holds 4 billing
  (spec 018) + 3 Plaid (spec 024) + 3 SimpleFIN (spec 028) Deno functions, thin adapters over the
  runtime-agnostic cores `services/billing/` and `services/aggregation/` (the latter's Plaid
  modules now under `deprecated/`), byte-copied into `functions/_shared/` by
  `npm run sync:functions` and locked by a drift test in web CI. Never edit the copies.

## 3. Directory of docs

| Doc | Read this when… |
|---|---|
| [./web.md](./web.md) | …working anywhere in `web/`: route tree, the `lib/store.tsx` data layer (incl. the atomic `upsert_transaction` write path), Supabase clients/auth gate, shell composition, design tokens, hooks, i18n, scan pipeline, Plaid client surface, the Capacitor iOS shell + `capacitor-ios-ci.yml`, bundle discipline, corpus/seed harness, Vitest suite, Vercel deploy. |
| [./finance.md](./finance.md) | …touching pure money/date logic (`web/lib/finance/*`, `splits.ts`, `balances.ts`, `transactionFilters.ts`, `reports/*`, dashboard range, lease): every engine per-file, the USD-cents invariant, rounding/date regimes, all insight thresholds, the engine→vector map. |
| [./supabase.md](./supabase.md) | …changing schema, migrations, RLS, RPCs, Vault, or edge functions; the local stack, `config.toml`, and the `supabase-migrations.yml` CI lane. |
| [./simplefin.md](./simplefin.md) | …working on bank connections / transaction sync: the SimpleFIN provider (spec 028) — token-claim flow, the read-only `/accounts` sync loop, money normalization (sign→kind, cents, dedupe, deterministic ledger id), the aggregation core layout, and how Plaid is contained under `deprecated/`. |
| [./shared.md](./shared.md) | …regenerating or adding regression vectors: the gen→assert loop, the web-ci vector-drift gate, determinism conventions, regeneration discipline (vector diffs ARE the behavior review). |
| [./household-system.md](./household-system.md) | …working on household identity/membership/people, transaction ownership, or the member-balance / settle-up subsystem: the 4-table data model, how everything scopes to a household (not a user), and the balance derivation. |
| [./makefile.md](./makefile.md) | …running `make ingest` / `tx-*` / `repair-dates`: all 7 targets, ingest internals, CLI auth (`IMPORT_EMAIL` OTP vs `ADMIN=1`), the CLI-vs-web write-path split, plus the spec-kit and `.claude/` maps. |
| [./ios.md](./ios.md) | …doing archaeology on the frozen SwiftUI app, porting its Swift scan source, or **shipping to TestFlight** (`ios-deploy.yml` — warning: it archives the FROZEN app onto the live listing's bundle id). Not how iOS ships today — that's [./web.md](./web.md). |
| [./environments.md](./environments.md) | …touching the **deploy pipeline or environments**: the local/stage/prod model + the `appEnv()` discriminator, the deploy model (merge `main` → **auto** staging via `web-deploy-staging.yml`; **manual** prod promotion via `web-deploy.yml`; `vercel.json` disables Vercel's own main auto-deploy), both Supabase projects (prod `brujhxmtzfgowimprueo` / stage `oozwqzsfbtkzywsxrzdq`), the GH Actions secrets/vars matrix, auto-login, and the "Sensitive vars break the build" gotcha. |
| [../README.md](../README.md) | …first contact: product framing, repo layout, getting-started commands per surface. |
| [../PARITY.md](../PARITY.md) | …changing any shared capability: the audited web-vs-CLI matrix and divergences. |
| [./research/product-fit-analysis.md](./research/product-fit-analysis.md) | …asking **what is this app, who is it for, and is there a business** — the fit investigation. The job statement ("a household that isn't one wallet"); the central finding that **the mission customer and the paying customer are different people** (free tier = mission at ~$0 marginal cost; $48/yr household tier as a measurement instrument; a conditional $180/yr owner-occupier SKU); §3 on where the planning engines still model a merged wallet; the verified/assumed/unknown split; and the H1–H7 hypotheses with the tests that would falsify each. **Not a roadmap** — no build commitments. |
| [./plan/csv-import.md](./plan/csv-import.md) | …implementing a specific planned feature. `docs/plan/` holds feature-level plans; the strategy above them lives in the fit analysis. |
| [./dashboard-widget-research.md](./dashboard-widget-research.md) | …evolving the Dashboard widget board (specs 034/035): the competitor deep-research pass (Copilot/Rocket/Monarch), widget design principles, and the implementation roadmap the current toggleable board grew from. |
| [./future_tasks/index.md](./future_tasks/index.md) | …browsing the backlog: the idea pool (one file per §N.M item) + the §9 commercial-readiness track with statuses. |
| [./archive/PARITY-2026-07-08.md](./archive/PARITY-2026-07-08.md) | …needing pre-021 web-vs-iOS parity history. |
| [./research/finance-habits-budgeting-apps.md](./research/finance-habits-budgeting-apps.md) | …making seed/corpus data realistic: sourced numbers on real household money behavior. |
| [./research/competetive-analysis/plaid-integration-competitive-analysis.md](./research/competetive-analysis/plaid-integration-competitive-analysis.md) | …planning how to evolve Plaid from connect-only (spec 024) to transaction sync: `/transactions/sync` + webhooks + billing models + re-auth, competitor stances, CFPB 1033. |
| [./research/competetive-analysis/simplefin-developer-analysis.md](./research/competetive-analysis/simplefin-developer-analysis.md) | …evaluating SimpleFIN (Bridge) as a cheap/privacy-forward second bank-sync provider behind the `linked_provider` seam: token flow, the read-only `/accounts` API, decimal-string amounts, pull-only dedupe, and how it compares to Plaid. |
| [./research/market-analysis/nyc-market-language-analysis.md](./research/market-analysis/nyc-market-language-analysis.md) | …planning the NYC launch: verified LEP/immigrant market sizing, language demand by borough vs Ortho's 6 shipped languages (Russian is the top gap), unbanked/trust data driving the two-track go-to-market, rent-burden/remittance findings, and the ranked product recommendations (P0: translate the 38 missing strings; verify SimpleFIN coverage of NYC community banks). |
| [./sandbox/sandbox-history.md](./sandbox/sandbox-history.md) | …managing `sbx` Docker Sandboxes (host-local registry; see the `docker-sandbox` / `kill-sandbox` skills). |

## 4. The golden path (fresh sandbox)

1. **Read root `README.md`, then `PARITY.md`, then root `CLAUDE.md`** (the latter points at the
   active plan and `.claude/context-summaries/latest.md` session handoff, if present).
2. **Skim `.specify/memory/constitution.md` (v2.0.0)** — the governance every plan gates on: web
   is the single canonical implementation, tokens-only design, loss never red, test-first with
   regression vectors.
3. **Know the platform limit**: a Linux sandbox runs everything JS (dev server, Vitest, vector
   generation, Make targets, `next build` static export) but **cannot build iOS** — the Capacitor
   shell and the frozen app both need macOS/Xcode. iOS feedback is CI:
   `capacitor-ios-ci.yml` build-verifies `web/ios/App/` on pushes/PRs touching `web/**`;
   `web-ci.yml` runs the services cores' tests, `tsc --noEmit`, `npm test`, the vector-drift
   check, and a Deno edge-function job; `supabase-migrations.yml` validates migrations and
   auto-applies to the hosted project (skips until the `SUPABASE_PROJECT_REF` repo Variable is
   set; `workflow_dispatch` allowed). Watch runs with
   `GH_TOKEN=placeholder gh run watch --exit-status`.
4. **Set up web**: `cd web && npm install && npm test` (Node 22 per `.nvmrc`; on Linux ARM you may
   need `@rolldown/binding-linux-arm64-gnu`). Run `npx tsc --noEmit` too — it is a CI gate.
   Note `npm run test:tz` is local-only (no workflow runs it).
5. **Check env**: gitignored `web/.env.local` needs `NEXT_PUBLIC_SUPABASE_URL` +
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`; `IMPORT_EMAIL` for CLI OTP; `SUPABASE_SERVICE_ROLE_KEY` only
   for `ADMIN=1`. The backend is **live shared data** — prefer `DRY_RUN=1` for CLI writes.
   `NEXT_PUBLIC_SITE_URL` (spec 045) is **optional and currently unset everywhere** — it is the
   marketing origin for canonical/hreflang links and the sitemap. Without it `lib/siteUrl.ts`
   falls back to the Vercel deployment host, then `http://localhost:3000`; both work, but the
   wrong domain would be indexed. Setting it in Vercel production is an operator task before the
   landing pages are submitted for indexing.
6. **If changing pure finance logic**: edit the TS, `npm run gen:vectors`, `npm test`, review the
   vector diff as a behavior change, reconcile `PARITY.md`.
7. **If adding a feature**: Spec Kit flow (`specify → plan → tasks → implement`) into a new
   `specs/NNN-…/` dir (42 exist, incl. seven shipped 027s). Then open the subsystem doc (§3).

## 5. Cross-cutting invariants

- **One live backend.** All surfaces read/write the hosted Supabase project
  (`brujhxmtzfgowimprueo`). 26 tables: identity (`users`, `households`, `household_members`,
  `household_people`, `pending_invites`, `platform_locks`), ledger (`transactions`,
  `transaction_shares`, `tags`, `transaction_tags`, `cards`, `deposit_accounts`, `budgets`),
  housing (`properties`, `mortgage_info`, `lease_info`, `units`, `rental_payments`), billing
  (`entitlements`, `billing_events`), Plaid (`linked_institutions`, `linked_accounts`,
  `linked_institution_secrets`, `plaid_link_sessions`), goals (`goals`, `goal_contributions`).
  `deposit_accounts` (spec 033) is household-scoped and mirrors `cards` — it drives the income
  "Deposit to" dropdown; `transactions.source` still stores the chosen name.
  Schema lives only in `supabase/migrations/` (19 files); client types must match it exactly.
- **USD-cents invariant.** Every stored amount is integer cents (`bigint`, `>= 0`) in USD; display
  currency is render-time only (spec 027 decision: US/USD-only launch). Per-person
  `transaction_shares` must sum to the transaction total — since migration `20260718120002`
  enforced **in SQL** by the atomic `upsert_transaction` RPC, used by both the web store and the
  CLI ingest path (`tx-add`/`tx-edit` still use the pre-027 two-step write — see `PARITY.md`).
- **Derived, never stored.** Budget rollover carry, goal progress/pacing, and member balances are
  computed from the ledger at render time — no denormalized columns to drift.
- **Enums.** 11 live Postgres enums (3 `transaction_kind` values, 40 `transaction_category` values
  = 39 pickable via `PICKABLE_CATEGORIES` + the non-pickable `transfer`) hand-mirrored in
  `web/lib/types.ts` + `web/lib/supabase/rows.ts` — an enum change is a migration **plus** both TS
  edits. The two-level display taxonomy (29 expense + 10 income subcategories, spec 031) lives in
  `web/lib/categories.ts`.
- **Regression vectors.** `shared/test-vectors/*.json` (13 files) are generated, never
  hand-edited. `web-ci.yml` re-runs `gen:vectors` and fails on git diff — but regenerating after
  an unintended change launders the bug in; review the vector diff before committing.
- **Auth contract.** Supabase email OTP, **8-digit** codes; concurrent sessions allowed; 30-day
  session timebox (`720h` in `supabase/config.toml`, mirrored manually on the hosted project).
  The Capacitor build persists its session in the iOS Keychain
  (`web/lib/auth/keychainStorage.ts`); web uses cookies.
- **Entitlements.** Per-user `entitlements` table, service-role-write-only; `ensure_entitlement()`
  creates the 31-day trial exactly once. The client gate fact
  (`admin | trialing | active | grace | lapsed`) comes from `web/lib/entitlements.ts`, a
  hand-mirror of `services/billing/src/derive.ts` locked by identical literal vectors —
  deliberately not a golden vector. Checkout/portal are hosted Stripe; the iOS shell opens them in
  the external browser. Operator runbook: `specs/018-subscription-system/quickstart.md`.
- **Design tokens.** `web/app/globals.css` CSS vars are the single source of truth: self-hosted
  Lato, size-driven weights with **no bold**, **loss/cost never red**, hairlines over borders.
  Governed by the constitution and the `ortho-web` skill.
- **Tooling boundaries.** Root `Makefile` is CLI-only (7 targets, no iOS targets); no root
  `package.json`; Node pinned 22. `.specify/feature.json` names the last active feature
  (`035-dashboard-scope-foundation`); nothing is currently in-flight.
- **Trust order.** Source code and `PARITY.md` outrank docs; this doc set was reconciled against
  the code on **2026-08-03**. `iOS/ARCHITECTURE.md` is self-marked archived — do not trust its
  data-layer/feature-status sections. When any doc disagrees with the code, the code wins — and
  fix the doc.
