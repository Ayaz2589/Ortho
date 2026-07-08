# Ortho — Documentation Index

Start here. This is the map of the Ortho monorepo at the repo root
(`/Users/ayazuddin/Development/personal/Ortho`); each subsystem has its own deep-dive doc in this
directory. Read this page first, then jump to the doc for whatever you're touching.

## 1. What Ortho is

Ortho is a calm, money-first **household budgeting app** for two people sharing one household:
shared and personal money, transaction splits between household members (including device-only
"local users"), member reimbursement / settle-up balances, budgets, insights, and housing
(mortgage / lease / rental) tracking. It ships as a SwiftUI iOS app and a Next.js web app over a
single shared Supabase (Postgres) backend, plus a deterministic terminal CLI for bank-statement
import and transaction CRUD. All money is stored as **integer USD cents** and converted to the
user's display currency only at render time. The four destinations on every canvas: **Dashboard,
Transactions, Housing, Settings**.

## 2. The big picture

Three surfaces, one backend:

```
                         ┌───────────────────────────────┐
                         │  supabase/  (Postgres schema) │
                         │  hosted ref: brujhxmtzfgowim… │
                         │  RLS on every table; enums;   │
                         │  aggregate RPCs; USD cents    │
                         └────────▲───────▲───────▲──────┘
                                  │       │       │
             email-OTP (8-digit)  │       │       │  OTP or service-role (ADMIN=1)
                 ┌────────────────┘       │       └───────────────────┐
                 │                        │                           │
        ┌────────┴────────┐      ┌────────┴────────┐       ┌──────────┴──────────┐
        │  iOS/  (Swift,  │      │  web/  (Next.js │       │  CLI  (web/scripts/ │
        │  SwiftUI) — the │      │  16 + React 19  │       │  import/, driven by │
        │  CANONICAL app  │◄────►│  + TS + Tailwind│       │  the root Makefile) │
        └────────┬────────┘parity└────────┬────────┘       └─────────────────────┘
                 │  asserts               │  generates (npm run gen:vectors)
                 │      ┌─────────────────▼──────────────┐
                 └─────►│ shared/test-vectors/*.json     │
                        │ golden vectors: the cross-     │
                        │ language finance-logic lock    │
                        └────────────────────────────────┘
```

**iOS is the canonical expression of the product; web is the same product on a
desktop/responsive canvas — never a redesign.** Because the pure finance logic (money/currency,
splits, balances, filters, insights, mortgage, dashboard month scope) is implemented twice — once
in TypeScript (`web/lib/*`, `web/components/dashboard/range.ts`) and once in Swift (mirrored files
in `iOS/Ortho-iOS/`) — eleven **golden test vectors** in `shared/test-vectors/` pin both sides:
web *generates* them from the TS engines, and both the web Vitest parity suites and the iOS XCTest
parity suites *assert* the same JSON files, so neither language can silently drift.

**`PARITY.md` (repo root) is the audited cross-surface contract.** It holds the
capability → TS file → Swift file → vector file matrix, the known divergences (mostly CLI), and
the enforcement procedure. Any change touching money, splits, balances, filters, month scoping, or
status colors must be reconciled against it. The CLI writes to the same tables and reuses some
shared TS functions but is deliberately **outside** the golden-vector harness.

## 3. Directory of docs

| Doc | Read this when… |
|---|---|
| [./ios.md](./ios.md) | …working on the SwiftUI app: AppState, tab shell, Services/ API structs, design tokens, XCTest parity suites, `SupabaseConfig.swift` setup. |
| [./web.md](./web.md) | …working on the Next.js app: `lib/store.tsx`, responsive/desktop compositions, `globals.css` tokens, Vitest suite, `proxy.ts` auth gate, the import CLI internals. |
| [./supabase.md](./supabase.md) | …changing the schema, enums, RLS policies, or RPCs; understanding migrations, `config.toml`, or the local stack. |
| [./shared.md](./shared.md) | …touching any mirrored finance logic: how golden vectors are generated, asserted on both platforms, and their determinism conventions. |
| [./makefile.md](./makefile.md) | …importing bank statements or doing terminal transaction CRUD (`make ingest`, `tx-*`), or navigating the spec-kit / `.claude` tooling at the root. |
| [./deploy.md](./deploy.md) | …shipping the iOS app to TestFlight: the manual-trigger deploy workflow, the Apple/Supabase secrets it preflights, and the owner setup steps. |

## 4. The golden path (fresh sandbox)

1. **Read the root `README.md`** — product framing, core ideas, getting-started commands.
2. **Read `PARITY.md`** — the parity matrix and divergences; you will need it before touching any
   shared logic.
3. **Read the root `CLAUDE.md`** — it points at the active feature plan (currently
   `specs/020-drift-reconciliation/plan.md`) and session-continuity notes
   (`.claude/context-summaries/latest.md` if it exists).
4. **Skim `.specify/memory/constitution.md`** — the design/testing constitution every plan gates
   on (tokens-only design, calm-over-dense, loss never red, test-first with golden vectors).
5. **Know your platform limits**: a Linux sandbox can run everything JS (web dev server, Vitest,
   vector generation, the Make targets) but **cannot build or test iOS locally** — that requires
   macOS/Xcode (`cd iOS && xcodebuild test -scheme Ortho-iOS`). The sandbox feedback loop is CI:
   `.github/workflows/ios-ci.yml` compiles, runs the parity suites, and uploads simulator
   screenshots on every push touching `iOS/**` or `shared/test-vectors/**` (see `docs/ios.md` §6).
   Web has a parallel `.github/workflows/web-ci.yml` (Linux) that runs `tsc`, the Vitest suite, and
   a golden-vector-drift check on any `web/**` or `shared/test-vectors/**` change.
6. **Set up web**: `cd web && npm install && npm test` (Node 22 per root `.nvmrc`; on Linux ARM
   you may need `@rolldown/binding-linux-arm64-gnu` since macOS-installed `node_modules` lacks
   Linux bindings). Expect the full suite green (809 tests as of 2026-07-07). Run `npx tsc --noEmit`
   too — it is part of the web CI gate.
7. **Check env/credentials**: `web/.env.local` (gitignored) needs `NEXT_PUBLIC_SUPABASE_URL` +
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`; iOS needs the gitignored
   `iOS/Ortho-iOS/App/SupabaseConfig.swift` (create from the committed `.template`). This backend
   is **live shared data** — prefer `DRY_RUN=1` for any CLI write and be deliberate with mutations.
8. **If changing pure finance logic**: edit the TS side, `cd web && npm run gen:vectors`, mirror
   the change in Swift, run both test suites, and reconcile `PARITY.md`.
9. **If adding a feature**: follow the Spec Kit flow (`specify → plan → tasks → implement`) into a
   new numbered `specs/NNN-…/` directory; existing specs `001`–`015` show the shape.
10. **Then** open the subsystem doc (Section 3) for the area you're working in.

## 5. Cross-cutting concerns

- **One live backend.** All three surfaces read/write the same hosted Supabase project
  (`brujhxmtzfgowimprueo`): `users`, `households`, `household_members`, `household_people`,
  `transactions` + `transaction_shares`, `cards`, `budgets`, `properties` (+ `mortgage_info` /
  `lease_info` / `units`), `rental_payments`. Schema lives only in `supabase/migrations/`; iOS DTO
  `CodingKeys` and web/CLI types must match its columns exactly.
- **USD-cents invariant.** `amount_cents` is `bigint` integer cents everywhere; per-owner
  `transaction_shares` must sum to the total — an invariant enforced by *clients*, not SQL. Both
  apps compensate (rollback) on the two-step parent+shares write; the CLI does not (see PARITY.md).
- **Enums in triplicate.** Postgres `transaction_category` / `transaction_kind` are mirrored as
  Swift enums and TS unions. Adding a value requires a migration **plus** both client changes; iOS
  survives unknown values via a Lenient decoder.
- **Golden vectors.** `shared/test-vectors/*.json` are generated, never hand-edited
  (`cd web && npm run gen:vectors`). Both parity suites assert them; a **new** vector file also
  needs an iOS pbxproj (Copy Bundle Resources) edit. Regenerating after an unintended TS change
  launders the bug into the vectors — only the macOS iOS run would then catch it.
- **Auth contract.** Supabase email OTP with **8-digit** codes on all surfaces; concurrent
  iOS + web sessions allowed (the platform lock was removed in feature 010); 30-day session cap
  via the Supabase session timebox (`720h` in `supabase/config.toml`, mirrored manually on the
  hosted project).
- **Env vars / keys.** Web + CLI: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `IMPORT_EMAIL` (CLI OTP sign-in), `SUPABASE_SERVICE_ROLE_KEY` (CLI `ADMIN=1` only, bypasses
  RLS) — all in gitignored `web/.env.local`. iOS: gitignored `App/SupabaseConfig.swift`.
- **Design tokens are duplicated, not shared.** iOS `AppTheme` and web `app/globals.css` CSS vars
  implement the same muted system: self-hosted Lato (identical font files on both), size-driven
  weights with **no bold**, **loss/cost is never red**, hairlines over borders. Governed by the
  constitution and the `ortho-web` skill.
- **Spec-kit workflow.** Features flow `specify → plan → tasks → implement` into `specs/NNN-…/`;
  every plan gates on `.specify/memory/constitution.md`; `.specify/feature.json` + root
  `CLAUDE.md` point at the active feature; completed specs add rows to `PARITY.md`.
- **Tooling boundaries.** The root `Makefile` is CLI-only (`ingest`, `ingest-help`, `tx-list`,
  `tx-add`, `tx-edit`, `tx-rm`, `repair-dates` — thin `cd web && npx tsx scripts/import/…` wrappers); there are
  **no iOS Make targets**. Node is pinned to 22 (`.nvmrc`). Everything JS runs on Linux;
  iOS build/test is macOS/Xcode-only.
- **Trust order for docs.** Source code and `PARITY.md` outrank older docs: `iOS/ARCHITECTURE.md`
  is pre-Supabase and outdated, and `shared/test-vectors/README.md` is stale for the three newest
  vector files.
