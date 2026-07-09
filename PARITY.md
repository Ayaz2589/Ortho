# Ortho cross-surface parity

> Subsystem deep-dives (architecture, key files, commands, gotchas) live in
> [`docs/`](docs/index.md) — this file is the audited parity *contract* between surfaces.
>
> **Enforcement in CI:** [`web-ci.yml`](.github/workflows/web-ci.yml) runs the Vitest regression
> suite (`web/test/*.parity.test.ts`) and a golden-vector-drift check on every push/PR touching
> `web/**`; [`capacitor-ios-ci.yml`](.github/workflows/capacitor-ios-ci.yml) build-verifies the
> Capacitor iOS shell of the same codebase. The frozen native app's
> [`ios-ci.yml`](.github/workflows/ios-ci.yml) is manual-trigger-only (see below).

> **Last reconciled: 2026-07-09, spec 021 (Capacitor iOS consolidation)** — the native SwiftUI app
> (`iOS/Ortho-iOS/`) is retired: frozen in the repository as an unmaintained historical reference,
> no new feature work. iOS ships going forward from the **same** web/TypeScript codebase, wrapped
> natively via Capacitor (`web/ios/App/`). There is one canonical implementation, not two — the
> premise this document audited for years ("kept in lockstep by golden vectors between two
> languages") no longer applies. The golden-vector harness (`shared/test-vectors/` +
> `gen-vectors.ts` + the Vitest `*.parity.test.ts` suites) is **kept**, reframed from a
> cross-language parity lock into an ordinary single-implementation regression/pinning suite — it
> still catches accidental behavior changes in the pure finance logic it covers. The pre-021
> version of this document (the full iOS↔web audit history, matrix, and known-divergence record) is
> preserved verbatim at [`docs/archive/PARITY-2026-07-08.md`](docs/archive/PARITY-2026-07-08.md) —
> read it for the "how did we get here" history; this file describes the **current** state only.
>
> Earlier history (spec 020 drift reconciliation, spec 013 post-audit closeout, the 2026-06-22 and
> 2026-07-02 full audits, feature 010's session-lock removal, etc.) lives in that archive, not
> repeated here.

Ortho is one product on **two live surfaces over one Supabase backend** (all money is USD cents):

| Surface | What it is | Location |
|---|---|---|
| **web** | The canonical implementation — Next.js + React + TypeScript. Ships as a responsive desktop/mobile web app *and*, wrapped natively via Capacitor, as the iOS app. | `web/` (+ `web/ios/App/` for the Capacitor shell) |
| **CLI** | A deterministic Node tool: bank-statement import + transaction CRUD (no LLM). | `web/scripts/import/` (`cli.ts`, `tx.ts`) |

There is exactly one implementation of the product's finance logic now (`web/lib/*`), pinned by
**regression vectors** in `shared/test-vectors/*.json` that the Vitest suite asserts, so a change to
`mortgage.ts`/`insights.ts`/`splits.ts`/`money.ts`/`transactionFilters.ts`/`balances.ts`/`range.ts`/
`housing.ts`/`lease.ts` can't silently drift from what's already shipped without the drift-check
step in CI catching it. The **CLI** writes to the same tables and reuses the shared TypeScript
finance functions where it can, but it is **not** part of the vector harness and has a few
intentional and a few unvectored divergences (below) — unaffected by the 021 migration.

## The frozen native app

`iOS/Ortho-iOS/` (SwiftUI) is preserved in the repository, unmodified, as a historical reference
and an emergency rollback path (rebuild-and-resubmit only — see spec 021's rollout plan). It:

- receives no new feature work, ever again;
- keeps its own XCTest parity suites (`iOS/Ortho-iOSTests/*ParityTests.swift`) in place, unedited,
  but they are **no longer exercised by required CI** — `ios-ci.yml` triggers are
  `workflow_dispatch`-only and the job is build-only (no `xcodebuild test`), since nobody updates
  the Swift mirrors anymore and running the parity suites against a stale implementation would
  produce permanent, misleading red on unrelated web changes;
- is governed by neither the current design system nor the current testing discipline
  (`.specify/memory/constitution.md` v2.0.0 explicitly excludes it).

Full historical detail on what was in parity between the native app and web, and every divergence
ever tracked between them, is in
[`docs/archive/PARITY-2026-07-08.md`](docs/archive/PARITY-2026-07-08.md).

## Parity matrix

| Capability | web (incl. Capacitor iOS shell) | CLI | Shared source of truth |
|---|:--:|:--:|---|
| Money / USD-cents invariant | ✅ | ✅ | `lib/finance/money.ts` + `currency.ts` → `currency.json` (+ display names/symbols) |
| Currency conversion (display) | ✅ | — (USD-only) | same as above |
| Splits & owner shares | ✅ | ✅ | `lib/splits.ts` → `transaction-splits.json` |
| Canonical leftover-cent order | ✅ | ✅ | `orderedOwnerIds` |
| Transaction + shares data contract | ✅ | ✅ | columns mirrored (incl. `paid_by`) |
| Member reimbursement / settle-up balance | ✅ | — | `lib/balances.ts` → `member-balance.json` (+ `paid_by`, `transfer` kind) |
| Atomic parent+shares write | ✅ (rollback) | ✅ (rollback) | client-side compensation on both (an RPC would make it truly atomic — still tracked, out of scope) |
| Category / kind / source taxonomy | ✅ | ✅ | Postgres `transaction_category`/`transaction_kind` enums (+ `transfer`) / `lib/types.ts` |
| Date storage & timezone | ✅ | ✅ | noon-UTC transaction timestamps; date-only columns = local calendar day |
| Full-UI localization (6 languages) | ✅ | — (English) | `web/lib/i18n/*` |
| Transaction filtering / listing | ✅ | ✅ | `lib/transactionFilters.ts` → `transaction-filters.json` (CLI runs the same function in-process) |
| Dashboard month selection | ✅ | — | `components/dashboard/range.ts` → `dashboard-month-scope.json` / `transaction-filters.json` |
| Insights engine | ✅ | — | `insights.json` (8/8 rules) |
| Mortgage / housing math | ✅ | — | `lib/finance/mortgage.ts` → `mortgage.json`; net rental `lib/finance/housing.ts` → `housing-net-rental.json`; lease date math → `lease.json` |
| On-device receipt/statement scanning | ✅ (native Capacitor plugin) | — | `web/lib/scan/*` (parsing/heuristics, TS) + `web/ios/App/App/Plugins/Scan/` (capture/OCR/PDF, Swift) — see "Surface-specific" below |
| Auth (email-OTP, 8-digit) | ✅ | ⚠️ | each calls the Supabase SDK; the CLI's OTP sign-in path differs by necessity (headless) |
| Session persistence | ✅ (Keychain on the Capacitor build, cookies on desktop/mobile web) | — | `web/lib/auth/keychainStorage.ts` (native only, spec 021) |
| Max session length (30-day cap) | ✅ | ✅ | Supabase session timebox (720h) — clients sign out → sign-in on expiry |
| Regression-vector coverage | ✅ (generator + asserter, single implementation) | — | `shared/test-vectors/` + `gen-vectors.ts` |

## The regression core (shared & pinned)

Reframed from "the parity core" (pre-021: locked across two languages) to what it actually is now —
pure business logic in `web/lib/*`, pinned by fixtures so an unintended behavior change gets caught
in CI before it ships, not a cross-language honesty check:

- **USD-cents storage invariant** — `transactions.amount_cents` is integer cents; per-owner
  `transaction_shares` (`person_id` + `amount_cents`) sum to the total.
- **Split math** — `computeShares` / `validateSplit` / `seedSplit` (`lib/splits.ts`); the CLI
  imports and reuses it, canonicalizing owner order through `orderedOwnerIds` first.
- **Currency** — `toUSDCents` / `toDisplayAmount` / `formatMoney`, round-half-away-from-zero
  (`lib/finance/money.ts`), vectored across all 7 currencies. The CLI reuses `formatMoney`.
- **Category / kind / source taxonomy** — `lib/types.ts` is the one source of truth; the CLI
  imports it.
- **Transaction filters** — `filterTransactions` (`lib/transactionFilters.ts`), vectored; the CLI
  runs the same function in-process.
- **Insights** — `generateInsights`, 8/8 rules vectored.
- **Mortgage** — `lib/finance/mortgage.ts`, vectored.
- **Housing net rental** — occupied-only unit rent − mortgage payment
  (`lib/finance/housing.ts`), vectored by `housing-net-rental.json`.
- **Dashboard month scope** — `availableMonths` / `monthReferenceDate` / `stepMonth`
  (`components/dashboard/range.ts`), vectored by `dashboard-month-scope.json`.
- **Member balance** — `balanceBetween` (`lib/balances.ts`), vectored by `member-balance.json`.

## Known divergences (live — web vs. CLI)

The CLI is a trusted local tool; some differences are by-design (it's USD-only, headless,
operator-driven), others are real gaps. This section only tracks the web-vs-CLI axis now — see the
archive for the retired web-vs-iOS history.

- 📌 **`--admin` bypasses RLS (by design):** admin mode uses the service-role key
  (`SUPABASE_SERVICE_ROLE_KEY` in gitignored `web/.env.local` — never in CI or commits) and
  therefore operates **outside** the household RLS the app relies on: it can read/write any
  household's rows, and `tx add` attributes `created_by` by name-matching the statement holder (or
  the first user) rather than an authenticated session. Intentional — the CLI is the operator's
  trusted local maintenance tool — with standing constraints: prefer sign-in mode when it suffices,
  prefer `DRY_RUN=1` before any admin write, treat the hosted project as live shared data.
- low **`monthsElapsed` / `yearsRemaining`** are pure-TS reimplementations with their own vector
  coverage (8 mortgage vectors incl. the day-29–31 boundary); safe only as far as that coverage goes.

### CLI-only data paths the app then reads (no cross-surface check)

These shape which rows exist and what the app displays, but have no regression-vector check:

- **Dedupe** is `created_by`-scoped, not household-wide — a partner re-importing the same statement
  can double-write charges into the shared ledger.
- **Reconciliation** (matching parsed totals to printed subtotals) and any migration backfill place
  the leftover cent by `sort_order`, which can differ from runtime `computeShares` order.
- **Exclusions, merchant cleanup, and the merchant→category heuristic** (`engine/categorize.ts`,
  profiles) decide row inclusion, merchant strings, and categories the app then reads.
- **Admin first-name owner matching** and **Dec→Jan year inference** in date parsing are CLI-only
  and unvectored.

## How parity is enforced

- **web:** `web/scripts/gen-vectors.ts` generates `shared/test-vectors/*.json` from `web/lib/*`; the
  Vitest suite (`web/test/*.parity.test.ts`) asserts the same files as an ordinary regression/
  snapshot check — a divergence between the TS logic and its own pinned fixtures fails the suite.
  Run: `cd web && npm test` (Node ≥ 20.19 / ≥ 22.12). After any pure-logic change:
  `npm run gen:vectors`, then `npm test`. Adding a *new* vector case is now just
  `gen-vectors.ts` + one Vitest file — no pbxproj wiring, since there is no second consumer.
- **CLI:** has its own unit tests (`web/test/import/*`) but asserts against **no** shared vector.
  Its reuse of `computeShares` / `formatMoney` / `lib/types` is the main thing keeping it aligned;
  everything it reimplements (filtering, money parsing, split validation, dates) can drift
  undetected.
- **Capacitor iOS shell:** `capacitor-ios-ci.yml` build-verifies `web/ios/App/App.xcodeproj` on
  every push touching `web/**` — a compile check, not a test run (the app's testable logic is the
  same TypeScript the Vitest suite already covers; the native Scan plugin currently has no
  automated test target of its own — a known, tracked gap).
- **Frozen native app:** `ios-ci.yml`, `workflow_dispatch`-only, build-only — an on-demand "does it
  still compile" check, not an enforcement mechanism.

## Surface-specific by design (not parity gaps)

- **web only:** Dashboard, Insights, Budgets, Housing/mortgage UI, Settings, navigation (bottom tab
  bar on the Capacitor iOS shell / compact web vs. sidebar on desktop web), display-currency
  conversion.
- **CLI only:** bank detection + per-bank PDF/CSV parsers (`profiles/*`), statement reconciliation,
  dedupe, merchant→category heuristics, exclusions, and `--admin` service-role mode.
- **On-device receipt & bank-statement scanning** — a native Capacitor plugin
  (`web/ios/App/App/Plugins/Scan/`, camera capture + Vision OCR + PDFKit + an optional
  FoundationModels refiner, iOS 26+ only, silently absent otherwise) invoked from the one web/React
  client. Before 021 this was described as "iOS only... an input method, not a product-surface
  divergence" because it lived entirely inside the (then second) native app; that framing is now
  wrong — it's a native capability of the single remaining client, on par with any other plugin in
  the plugin matrix (see `specs/021-capacitor-ios-consolidation/plan.md`). The pure parsing/
  heuristics/categorization logic (ported from the frozen app's `ScanHeuristics`/`ScanParser`/
  `ScanInference`) now lives in `web/lib/scan/*` and is regression-vector-locked like the rest of
  `web/lib/*`; only the capture/OCR/PDF-extraction half stays native, with no cross-platform
  equivalent to lock against. The web/desktop equivalent for statements remains the CLI's
  `make ingest`.
- **Test-build feature flags (spec 015).** The frozen native app gated its Settings → Developer
  section (Use test data + Bypass auth) at compile/receipt time
  (`Config/TestBuild.swift`: `#if DEBUG` OR the TestFlight sandbox receipt) — now historical, see
  the archive. The live (and Capacitor-shell) mechanism is web's build-env-time gate
  (`lib/test-build.ts`: `NEXT_PUBLIC_VERCEL_ENV`/`NODE_ENV`, dead-code-eliminated in production);
  the Capacitor build inherits this unchanged, since it ships the same web bundle. Test-data
  isolation: `createClient()` swaps the live Supabase client for an in-memory seeded client
  (`lib/testdata/`) — outside the regression-vector harness (no money/date math), so it carries no
  vector; the sample dataset (`lib/testdata/seed.ts`) is not vectored.
