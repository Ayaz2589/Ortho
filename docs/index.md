# Ortho — Documentation Index

Start here. This is the map of the Ortho monorepo at the repo root
(`/Users/ayazuddin/Development/personal/Ortho`); each subsystem has its own deep-dive doc in this
directory. Read this page first, then jump to the doc for whatever you're touching.

## 1. What Ortho is

Ortho is a calm, money-first **household budgeting app** for two people sharing one household:
shared and personal money, transaction splits between household members (including device-only
"local users"), member reimbursement / settle-up balances, budgets, insights, and housing
(mortgage / lease / rental) tracking. It ships as a Next.js web app — the **single canonical
implementation** — over a shared Supabase (Postgres) backend, delivered on two targets: an
ordinary responsive web app, and, wrapped natively via **Capacitor**, the iOS app. A deterministic
terminal CLI handles bank-statement import and transaction CRUD. All money is stored as **integer
USD cents** and converted to the user's display currency only at render time. The four
destinations on every canvas: **Dashboard, Transactions, Housing, Settings**.

> **spec 021 (2026-07-09):** Ortho used to ship a *second*, independently-built native SwiftUI
> app (`iOS/Ortho-iOS/`) as the canonical client, kept in lockstep with web via golden test
> vectors. That app is now **frozen** — an unmaintained historical reference and rollback path,
> receiving no new work (see `./ios.md`). iOS ships going forward from the same web codebase.

## 2. The big picture

Two live surfaces, one backend:

```
                         ┌───────────────────────────────┐
                         │  supabase/  (Postgres schema) │
                         │  hosted ref: brujhxmtzfgowim… │
                         │  RLS on every table; enums;   │
                         │  aggregate RPCs; USD cents    │
                         └────────▲──────────────▲───────┘
                                  │              │
             email-OTP (8-digit)  │              │  OTP or service-role (ADMIN=1)
                 ┌────────────────┘              └───────────────────┐
                 │                                                   │
        ┌────────┴─────────────────────────┐             ┌──────────┴──────────┐
        │  web/  (Next.js 16 + React 19 +   │             │  CLI  (web/scripts/ │
        │  TS + Tailwind) — the SOLE         │             │  import/, driven by │
        │  canonical implementation          │             │  the root Makefile) │
        │  ┌───────────────┬───────────────┐ │             └─────────────────────┘
        │  │ responsive web │ Capacitor iOS │ │
        │  │ (browser)      │ (web/ios/App) │ │
        │  └───────────────┴───────────────┘ │
        └────────────────┬────────────────────┘
                          │  generates + asserts (npm run gen:vectors / npm test)
                          ▼
              ┌──────────────────────────┐
              │ shared/test-vectors/*.json │
              │ regression fixtures — one │
              │ implementation, pinned    │
              │ against its own output    │
              └──────────────────────────┘

  iOS/Ortho-iOS/ (frozen, historical reference — not part of the live picture above)
```

**web is the single canonical implementation; the Capacitor iOS shell and the responsive web app
are that same implementation, delivered per canvas — never a redesign, never a second
implementation.** The finance logic (money/currency, splits, balances, filters, insights,
mortgage, dashboard month scope, and — since spec 021 — the on-device scan parser) is pure
TypeScript in `web/lib/*` (+ `web/components/dashboard/range.ts`), pinned by **regression
vectors** in `shared/test-vectors/`: `npm run gen:vectors` generates them from the TS engines, and
the web Vitest suite asserts them, catching accidental behavior changes before they ship — no
second language to keep honest against anymore.

**`PARITY.md` (repo root) is the audited web-vs-CLI contract.** It holds the capability → TS file
→ vector file matrix, the known CLI divergences, and the enforcement procedure. Any change
touching money, splits, balances, filters, month scoping, or status colors must be reconciled
against it. The CLI writes to the same tables and reuses some shared TS functions but is
deliberately **outside** the vector harness. (The pre-021 web-vs-iOS audit history is archived at
`docs/archive/PARITY-2026-07-08.md`.)

**Spec 018 added Ortho's first server-side code.** `supabase/functions/` holds four billing edge
functions (`stripe-webhook`, `billing-checkout`, `billing-portal`, `billing-plans` — Deno, thin
adapters), and the root `services/billing/` package is the extraction-ready billing core behind
them: pure runtime-agnostic TypeScript with its own Vitest suite, byte-copied into
`supabase/functions/_shared/billing/` by `npm run sync:functions` and locked byte-identical by a
drift test that runs in web CI. Never edit the copy — edit `services/billing` and re-sync. See
`docs/supabase.md` §4.5. **Spec 024 repeated the pattern for bank linking**: three `plaid-*`
functions behind the `services/aggregation/` core (same sync script + drift lock), household
`linked_institutions`/`linked_accounts` tables, and the repo's first Supabase Vault use for the
Plaid access token — connect-only (no transaction sync yet). See `docs/supabase.md` §4.6 and
`docs/web.md` "Linked banks".

## 3. Directory of docs

| Doc | Read this when… |
|---|---|
| [./web.md](./web.md) | …working on the Next.js app (the canonical implementation, both delivery targets): `lib/store.tsx`, responsive/desktop compositions, `globals.css` tokens, Vitest suite, the client-side auth gate, the Capacitor iOS shell (`web/ios/App/`, native plugins, the Scan plugin), the import CLI internals, the deterministic coverage-corpus generator + dev seeder (`web/test/corpus/`, spec 026). |
| [./ios.md](./ios.md) | …doing archaeology on the **frozen** native SwiftUI app (emergency rollback, or porting its original scan-pipeline Swift source into the Capacitor plugin). Not how iOS ships today. |
| [./supabase.md](./supabase.md) | …changing the schema, enums, RLS policies, RPCs, or the billing/Plaid edge functions (`supabase/functions/`); understanding migrations, `config.toml`, or the local stack. |
| [./shared.md](./shared.md) | …touching any regression-vectored finance logic: how the vectors are generated, asserted, and their determinism conventions. |
| [./finance.md](./finance.md) | …working in the pure financial models themselves (`web/lib/finance/*`, `splits.ts`, `balances.ts`, `transactionFilters.ts`, dashboard range, lease): the USD-cents invariant, every calculation engine, rounding/timezone conventions, and how they're pinned. |
| [./makefile.md](./makefile.md) | …importing bank statements or doing terminal transaction CRUD (`make ingest`, `tx-*`), or navigating the spec-kit / `.claude` tooling at the root. |
| [./deploy.md](./deploy.md) | …shipping to TestFlight: the manual-trigger deploy workflow, the Apple/Supabase secrets it preflights, and the owner setup steps. (Currently documents the frozen app's deploy path; the Capacitor build's release pipeline is `web/capacitor.config.ts`'s `ios.buildOptions` + `npx cap build ios` — see `./web.md`.) |

## 4. The golden path (fresh sandbox)

1. **Read the root `README.md`** — product framing, core ideas, getting-started commands.
2. **Read `PARITY.md`** — the web-vs-CLI matrix and divergences; you will need it before touching
   any shared logic. (The archived pre-021 web-vs-iOS history is at
   `docs/archive/PARITY-2026-07-08.md` if you need that context.)
3. **Read the root `CLAUDE.md`** — it points at the active feature plan and session-continuity
   notes (`.claude/context-summaries/latest.md` if it exists).
4. **Skim `.specify/memory/constitution.md`** (v2.0.0) — the design/testing constitution every
   plan gates on: web is the single canonical implementation, tokens-only design, calm-over-dense,
   loss never red, test-first with regression vectors.
5. **Know your platform limits**: a Linux sandbox can run everything JS (web dev server, Vitest,
   vector generation, the Make targets, `next build`'s static export) but **cannot build or run the
   Capacitor iOS shell, or the frozen native app, locally** — both need macOS/Xcode. The sandbox
   feedback loop is CI: `.github/workflows/capacitor-ios-ci.yml` build-verifies the Capacitor iOS
   project on every push touching `web/**` (see `docs/web.md` §4/§6); `.github/workflows/web-ci.yml`
   (Linux) runs `tsc`, the Vitest suite, and a regression-vector-drift check on any `web/**`,
   `services/**`, `supabase/functions/**`, or `shared/test-vectors/**` change — since spec 018 it
   also typechecks and tests `services/billing` (including the `_shared/` byte-copy drift lock). The frozen app's `.github/workflows/ios-ci.yml` is
   manual-trigger-only now (see `docs/ios.md`).
6. **Set up web**: `cd web && npm install && npm test` (Node 22 per root `.nvmrc`; on Linux ARM
   you may need `@rolldown/binding-linux-arm64-gnu` since macOS-installed `node_modules` lacks
   Linux bindings). Expect the full suite green. Run `npx tsc --noEmit` too — it is part of the web
   CI gate.
7. **Check env/credentials**: `web/.env.local` (gitignored) needs `NEXT_PUBLIC_SUPABASE_URL` +
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` (used by the CLI, the browser build, and inlined into the
   Capacitor build at `next build` time). This backend is **live shared data** — prefer
   `DRY_RUN=1` for any CLI write and be deliberate with mutations.
8. **If changing pure finance logic**: edit the TS side, `cd web && npm run gen:vectors`, run
   `npm test`, and reconcile `PARITY.md` if the change touches a documented capability. There is no
   second implementation to mirror anymore.
9. **If adding a feature**: follow the Spec Kit flow (`specify → plan → tasks → implement`) into a
   new numbered `specs/NNN-…/` directory; existing specs `001`–`024` show the shape.
10. **Then** open the subsystem doc (Section 3) for the area you're working in.

## 5. Cross-cutting concerns

- **One live backend.** Both live surfaces (web + the Capacitor iOS shell, since they're the same
  build) and the CLI read/write the same hosted Supabase project (`brujhxmtzfgowimprueo`): `users`,
  `households`, `household_members`, `household_people`, `transactions` + `transaction_shares`,
  `cards`, `budgets`, `properties` (+ `mortgage_info` / `lease_info` / `units`), `rental_payments`,
  plus the newer `entitlements` (spec 018) and `linked_institutions` / `linked_accounts`
  (+ secret-holding `linked_institution_secrets` / `plaid_link_sessions`, spec 024) tables.
  Schema lives only in `supabase/migrations/`; web/CLI types must match its columns exactly. (The
  frozen native app's DTO `CodingKeys` also matched this schema as of when it was retired, but is
  no longer kept in sync.)
- **USD-cents invariant.** `amount_cents` is `bigint` integer cents everywhere; per-owner
  `transaction_shares` must sum to the total — an invariant enforced by *clients*, not SQL. web
  compensates (rollback) on the two-step parent+shares write; the CLI does not (see PARITY.md).
- **Enums.** Postgres `transaction_category` / `transaction_kind` are mirrored as a TS union
  (`lib/types.ts`). Adding a value requires a migration **plus** the TS change.
- **Regression vectors.** `shared/test-vectors/*.json` are generated, never hand-edited
  (`cd web && npm run gen:vectors`). The web Vitest parity suites assert them as an ordinary
  regression/snapshot check — no second language to keep honest against, no pbxproj wiring for new
  vector files. Regenerating after an unintended TS change still launders the bug into the
  vectors — review the diff before committing it, same discipline as before.
- **Auth contract.** Supabase email OTP with **8-digit** codes; concurrent sessions across the
  Capacitor iOS shell and desktop/mobile web are allowed (the platform lock was removed in feature
  010); 30-day session cap via the Supabase session timebox (`720h` in `supabase/config.toml`,
  mirrored manually on the hosted project). The Capacitor build persists its session in the iOS
  Keychain (`web/lib/auth/keychainStorage.ts`, spec 021) instead of the desktop/mobile-web cookie
  path.
- **Subscriptions / entitlements (spec 018).** The per-user `entitlements` table is the single
  source of truth — service-role-write-only (clients may only `select` their own row; the
  `ensure_entitlement()` RPC creates the 31-day trial exactly once). The client derives one gate
  fact (`admin | trialing | active | grace | lapsed`) via `web/lib/entitlements.ts`, a
  hand-mirrored copy of the canonical `services/billing/src/derive.ts` locked by identical literal
  vectors (V01–V19 + digest) — deliberately **not** a golden vector (no money/date engine).
  Subscribing = Stripe Checkout; managing = Stripe Customer Portal; the Capacitor iOS shell opens
  the same hosted checkout/portal in the **external browser** (US-storefront rules). Admin bypass =
  `status = 'admin'`, operator-granted by runbook SQL. All live deploy/Stripe steps are the
  operator runbook in `specs/018-subscription-system/quickstart.md`.
- **Env vars / keys.** Web + CLI + the Capacitor build (same `next build`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `IMPORT_EMAIL` (CLI OTP sign-in), `SUPABASE_SERVICE_ROLE_KEY` (CLI `ADMIN=1` only, bypasses
  RLS) — all in gitignored `web/.env.local`.
- **Design tokens live in one place now.** `web/app/globals.css` CSS vars are the single source of
  truth: self-hosted Lato, size-driven weights with **no bold**, **loss/cost is never red**,
  hairlines over borders — rendered on both delivery targets since they're the same bundle. (The
  frozen native app's `AppTheme` implemented the same system independently, historically.)
  Governed by the constitution and the `ortho-web` skill.
- **Spec-kit workflow.** Features flow `specify → plan → tasks → implement` into `specs/NNN-…/`;
  every plan gates on `.specify/memory/constitution.md`; `.specify/feature.json` + root
  `CLAUDE.md` point at the active feature; completed specs add rows to `PARITY.md`.
- **Tooling boundaries.** The root `Makefile` is CLI-only (`ingest`, `ingest-help`, `tx-list`,
  `tx-add`, `tx-edit`, `tx-rm`, `repair-dates` — thin `cd web && npx tsx scripts/import/…` wrappers);
  there are **no iOS Make targets**. Node is pinned to 22 (`.nvmrc`). Everything JS runs on Linux;
  the Capacitor iOS build/the frozen app are macOS/Xcode-only.
- **Trust order for docs.** Source code and `PARITY.md` outrank older docs: `iOS/ARCHITECTURE.md`
  and (as of spec 021) all of `docs/ios.md` describe a frozen, no-longer-current state;
  `shared/test-vectors/README.md` may be stale for the newest vector files.
