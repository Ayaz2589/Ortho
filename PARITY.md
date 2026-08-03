# Ortho cross-surface parity

> Subsystem deep-dives (architecture, key files, commands, gotchas) live in
> [`docs/`](docs/index.md) — this file is the audited parity *contract* between surfaces.
>
> **Enforcement in CI:** [`web-ci.yml`](.github/workflows/web-ci.yml) runs the Vitest regression
> suite (`web/test/*.parity.test.ts`) and a golden-vector-drift check on every push/PR touching
> `web/**`; [`capacitor-ios-ci.yml`](.github/workflows/capacitor-ios-ci.yml) build-verifies the
> Capacitor iOS shell of the same codebase. The frozen native app's
> [`ios-ci.yml`](.github/workflows/ios-ci.yml) is manual-trigger-only (see below).

> **Last reconciled: 2026-08-03, spec 035.** Specs 030–035 are all **web-only** (no CLI path) and
> deliberately unvectored: holistic seed data + env-gated bypass auth, the two-level category →
> subcategory taxonomy (`web/lib/categories.ts`, spec 031), PDF data export/import (`web/lib/dataFile/`,
> spec 032), user-configurable **deposit accounts** replacing the old hardcoded `INCOME_SOURCES`
> constant (`deposit_accounts` table + `web/lib/store.tsx`, spec 033), the rebuilt **widget-system
> dashboard** (spec 034 — the old "Overview | Reports" mode is gone), and the **shared dashboard
> scope** every widget reads (spec 035). None add a golden vector or a CLI code path; see the
> web-only matrix rows and "Surface-specific by design" below. Earlier, spec 027 added several
> web-only surfaces: new vectored
> money engines — **Budget rollover & bucket types** (`lib/finance/budgets.ts` →
> `budget-rollover.json`; also makes the budget insight Rule 3 rollover-aware against the derived
> effective limit, byte-identical for the `fixed` default) and **Savings & debt-payoff goals**
> (`lib/finance/goals.ts` → `goals.json` + one off-track insight rule) — plus **transaction tags &
> richer notes** (a `tags` table + `transaction_tags` join orthogonal to category, a nullable
> `transactions.notes` column, and a tag dimension + notes/tag-name search wired into the pure
> `filterTransactions` engine, re-locked in `transaction-filters.json`; additive — an untagged
> transaction behaves exactly as before, and the CLI stays untagged). Each adds a parity-matrix row
> below; the CLI has none of these paths. Spec 027 also closed the atomic-persistence gap: parent +
> shares now commit through the single `upsert_transaction` RPC on **both** surfaces (matrix row
> below), replacing the client-side compensation this file previously tracked as "out of scope".
> Reports, the remaining spec-027 surface, is web-only and deliberately unvectored — see
> "Surface-specific by design". **Spec 028 (SimpleFIN bank-sync)** adds a web/edge-only
> transaction-sync path: SimpleFIN money normalization (signed decimal string → non-negative
> USD cents + `transaction_kind`, dedupe, deterministic ledger id) lives in
> `services/aggregation/src/normalize.ts`, is pinned by that package's Vitest suite, and writes
> through the **same** `upsert_transaction` RPC the CLI uses — the CLI has no SimpleFIN path, so
> it introduces no new cross-surface parity-matrix row. It also contains (does not remove) the
> Plaid provider under `deprecated/`. Earlier: **spec 024 (Plaid Connect — connect-only bank
> linking)** adds a web-only bank-connection capability with no vectored money/date logic, so it
> introduces no new parity-matrix row; spec 018 (billing/entitlements) is likewise accounted for. The deepest
> structural reconciliation remains **spec 021 (Capacitor iOS consolidation)** — the native SwiftUI app
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

There is exactly one implementation of the product's finance logic now (`web/lib/*`, plus the two
vectored engines that live under `web/components/` — `components/dashboard/range.ts` and
`components/housing/lease.ts`), pinned by **regression vectors** in `shared/test-vectors/*.json`
(13 files, asserted 1:1 by the 13 `web/test/*.parity.test.ts` suites), so a change to
`mortgage.ts`/`insights.ts`/`splits.ts`/`money.ts`/`budgets.ts`/`goals.ts`/`transactionFilters.ts`/
`balances.ts`/`housing.ts`/`range.ts`/`lease.ts` can't silently drift from what's already shipped
without the drift-check step in CI catching it. The **CLI** writes to the same tables and reuses the shared TypeScript
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
| Canonical leftover-cent order | ✅ | ✅ | `orderedOwnerIds` — leftover cent goes to canonically-first owner (ascending UUID string sort), a conscious documented policy (see comment in `lib/splits.ts` and `specs/027-finance-model-correctness/contracts/cli-ordering.md`). Verified 2026-07-18 (spec 027 / A4): CLI `toTransaction` calls `orderedOwnerIds` before `computeShares`; `sort_order` DB ordering does not affect the leftover cent. Test: `web/test/import/toTransaction.test.ts` "A4 — sort_order ≠ UUID order". |
| Transaction + shares data contract | ✅ | ✅ | columns mirrored (incl. `paid_by`, `notes`) |
| Member reimbursement / settle-up balance | ✅ | — | `lib/balances.ts` → `member-balance.json` (+ `paid_by`, `transfer` kind) |
| Atomic parent+shares write | ✅ (RPC) | ✅ (RPC) | `upsert_transaction(p_tx, p_shares)` — a single-transaction Postgres RPC (`supabase/migrations/20260718120002_upsert_transaction_atomic.sql`, spec 027) with a DB-level guarantee that shares sum to the parent amount; execute granted only to `authenticated`/`service_role`. **Both** write paths call it: web `web/lib/store.tsx` and CLI `web/scripts/import/db/persist.ts` — the write path itself is now shared. Supersedes spec 023/B7's client-side compensation. The migration counts pre-existing share-less rows (NOTICE) but deliberately does not repair them. |
| Category / kind / source taxonomy | ✅ | ✅ | Postgres `transaction_category` (40 values — 39 pickable + non-pickable `transfer`) / `transaction_kind` enums / `lib/types.ts` (`PICKABLE_CATEGORIES`); the two-level category → subcategory **display** taxonomy (29 expense + 10 income subcats, spec 031) lives in `lib/categories.ts` |
| Date storage & timezone | ✅ | ✅ | noon-UTC transaction timestamps; date-only columns = local calendar day |
| Full-UI localization (6 languages) | ✅ | — (English) | `web/lib/i18n/*` |
| Transaction filtering / listing | ✅ | ✅ | `lib/transactionFilters.ts` → `transaction-filters.json` (CLI runs the same function in-process) |
| Transaction tags & notes (spec 027) | ✅ | — (untagged) | `tags` + `transaction_tags` tables / `transactions.notes`; tag dimension + notes/tag-name search vectored in `lib/transactionFilters.ts` → `transaction-filters.json`. The CLI neither sets nor filters by tags (imported rows are untagged; `emptyCriteria()` carries `tags: []`). |
| Dashboard month selection | ✅ | — | `components/dashboard/range.ts` → `dashboard-month-scope.json` / `transaction-filters.json` |
| Insights engine | ✅ | — | `insights.json` (8/8 rules; Rule 3 rollover-aware since spec 027) |
| Budget rollover & bucket types | ✅ | — | `lib/finance/budgets.ts` → `budget-rollover.json` (spec 027 — fixed/flex/non_monthly carry; the derived effective limit also drives the budget insight) |
| Savings / debt-payoff goals | ✅ | — | `lib/finance/goals.ts` → `goals.json` (progress + off-track pacing; spec 027) |
| Dashboard widget system (spec 034/035) | ✅ | — | toggleable widget board — registry `lib/widgets/registry.tsx`, shared month/range scope `lib/useDashboardRange.ts` + `lib/widgets/DashboardScopeContext.tsx`, spend heatmap `lib/dashboard/spendHeatmap.ts`; none vectored. `components/dashboard/range.ts` remains the vectored month engine underneath. |
| Deposit accounts (spec 033) | ✅ | — | `deposit_accounts` table (household-scoped, mirrors `cards`) + `web/lib/store.tsx` drives the income "Deposit to" dropdown; CLI unaffected since `transactions.source` is still a text column. |
| PDF data export / import (spec 032) | ✅ | — | dual-layer PDF (human-readable + embedded machine-readable payload) → `web/lib/dataFile/`; two-tier dedup on re-import; unvectored (no money/date engine). |
| Mortgage / housing math | ✅ | — | `lib/finance/mortgage.ts` → `mortgage.json`; net rental `lib/finance/housing.ts` → `housing-net-rental.json`; lease date math → `lease.json` |
| On-device receipt/statement scanning | ✅ (native Capacitor plugin) | — | `web/lib/scan/*` (parsing/heuristics, TS) + `web/ios/App/App/Plugins/Scan/` (capture/OCR/PDF, Swift) — see "Surface-specific" below |
| Auth (email-OTP, 8-digit) | ✅ | ⚠️ | each calls the Supabase SDK; the CLI's OTP sign-in path differs by necessity (headless) |
| Session persistence | ✅ (Keychain on the Capacitor build, cookies on desktop/mobile web) | — | `web/lib/auth/keychainStorage.ts` (native only, spec 021) |
| Max session length (30-day cap) | ✅ | ✅ | Supabase session timebox (720h) — clients sign out → sign-in on expiry |
| Entitlement gate derivation (spec 018) | ✅ | — | `services/billing/src/derive.ts` (canonical) ↔ `web/lib/entitlements.ts` — identical literal vectors V01–V19 + sha256 digest (`specs/018-subscription-system/contracts/entitlement-state.md`); deliberately **not** a golden vector (no money/date engine). The frozen native app's Swift mirror was dropped at merge — the Capacitor shell ships the web derivation. |
| Regression-vector coverage | ✅ (generator + asserter, single implementation) | — | `shared/test-vectors/` + `gen-vectors.ts` |

## The regression core (shared & pinned)

Reframed from "the parity core" (pre-021: locked across two languages) to what it actually is now —
pure business logic in `web/lib/*`, pinned by fixtures so an unintended behavior change gets caught
in CI before it ships, not a cross-language honesty check:

- **USD-cents storage invariant** — `transactions.amount_cents` is integer cents; per-owner
  `transaction_shares` (`person_id` + `amount_cents`) sum to the total. Since spec 027 that sum
  invariant is enforced **in the database** by the `upsert_transaction` RPC, which both surfaces
  write through.
- **Split math** — `computeShares` / `validateSplit` / `seedSplit` (`lib/splits.ts`); the CLI
  imports and reuses it, canonicalizing owner order through `orderedOwnerIds` first.
- **Currency** — `toUSDCents` / `toDisplayAmount` / `formatMoney`, round-half-away-from-zero
  (`lib/finance/money.ts`), vectored across all 7 currencies. The CLI reuses `formatMoney`.
- **Category / kind / source taxonomy** — `lib/types.ts` is the one source of truth; the CLI
  imports it.
- **Transaction filters** — `filterTransactions` (`lib/transactionFilters.ts`), vectored; the CLI
  runs the same function in-process. Since spec 027 the criteria include a `tags` dimension
  (OR-within / AND-across, like sources/owners) and the free-text query also matches `notes` and
  tag names (via `FilterContext.tagNames`); the CLI omits `tagNames` (no tag roster) so tag-name
  search is a no-op there.
- **Insights** — `generateInsights`, 8/8 rules vectored. Rule 3 (budget status)
  compares spend against the rollover-aware **effective** limit (spec 027);
  `fixed` budgets are byte-identical to the pre-027 output.
- **Budget rollover** — `computeRolloverLedger` (`lib/finance/budgets.ts`),
  vectored by `budget-rollover.json`: the fixed/flex/non_monthly carry recurrence
  in integer cents. Carry is derived from the ledger, never stored.
- **Mortgage** — `lib/finance/mortgage.ts`, vectored.
- **Housing net rental** — occupied-only unit rent − mortgage payment
  (`lib/finance/housing.ts`), vectored by `housing-net-rental.json`.
- **Dashboard month scope** — `availableMonths` / `monthReferenceDate` / `stepMonth`
  (`components/dashboard/range.ts`), vectored by `dashboard-month-scope.json`.
- **Member balance** — `balanceBetween` (`lib/balances.ts`), vectored by `member-balance.json`.
- **Savings goals** — `goalProgress` / `goalPacing` (`lib/finance/goals.ts`), vectored by `goals.json`
  (spec 027). The off-track rule is a separate engine so `insights.json` stays byte-stable; its
  `Insight` output merges into the dashboard consumers via the exported `compareInsights`.

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
- **Reconciliation** (matching parsed totals to printed subtotals) verifies statement sums — not splits. The CLI's `toTransaction` engine canonicalizes owner order via `orderedOwnerIds` before `computeShares`, identical to the web app; `sort_order` does not affect leftover-cent placement. *(Verified spec 027 / A4, 2026-07-18.)*
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
  Its reuse of `computeShares` / `formatMoney` / `lib/types` — and, since spec 027, the shared
  `upsert_transaction` write RPC (`web/scripts/import/db/persist.ts`) — is the main thing keeping
  it aligned; everything it reimplements (filtering, money parsing, split validation, dates) can
  drift undetected.
- **Capacitor iOS shell:** `capacitor-ios-ci.yml` build-verifies `web/ios/App/App.xcodeproj` on
  every push touching `web/**` — a compile check, not a test run (the app's testable logic is the
  same TypeScript the Vitest suite already covers; the native Scan plugin currently has no
  automated test target of its own — a known, tracked gap).
- **Frozen native app:** `ios-ci.yml`, `workflow_dispatch`-only, build-only — an on-demand "does it
  still compile" check, not an enforcement mechanism.

## Deliberate behavior changes vs. the frozen iOS app

These are intentional product improvements where the current web behavior **differs** from what the
frozen native app (`iOS/Ortho-iOS/`) once did. Because the Capacitor iOS shell ships the same web
bundle (spec 021), the new behavior applies on all surfaces.

- **"Save and add another" keeps all fields (feat/save-add-another-keep, 2026-07-30).** The
  `SaveAndAddAnotherButton` (add-transaction form) previously called `resetForAnother()` after
  saving, which cleared merchant, amount, notes, category, and splits while keeping kind/source/
  date/owners/tags — mirroring the frozen app's `resetFormForAnotherEntry`. The new behavior:
  `resetForAnother()` is a no-op; every field is preserved exactly as submitted so the form is
  fully pre-filled for the next entry. `submit()` already generates a fresh `crypto.randomUUID()`
  id on each call, so successive saves are always distinct transactions. Covered by
  `web/test/tx-form-save-add-another.test.tsx`.

## Surface-specific by design (not parity gaps)

- **web only:** Dashboard, Insights, Budgets, Housing/mortgage UI, Settings, navigation (bottom tab
  bar on the Capacitor iOS shell / compact web vs. sidebar on desktop web), display-currency
  conversion, and Plaid **bank-account connection** (connect-only, spec 024 — `web/lib/aggregation.ts`
  over the `plaid-link-token` / `plaid-exchange` / `plaid-disconnect` edge functions; no transaction
  or money engine, hence no vector row). The CLI has no bank-linking path.
- **web only — Reports math (spec 027).** The segmented "Overview | Reports" **mode** inside the
  Dashboard page is **gone** — spec 036 removed it (`web/app/(app)/dashboard/page.tsx`: "The
  former Reports MODE (spec 027) is gone"). The savings-rate-over-time view now ships as the
  toggleable **`savings-trends` widget** on the single-view widget board
  (`web/components/widgets/bodies/SavingsTrendsBody.tsx`), per-browser in Settings → Widgets. The
  underlying math is unchanged and still web-only: the savings-rate engine
  (`web/lib/reports/savings.ts`) and the category deep-dive / ranking
  (`web/lib/reports/categories.ts`) stay pure and unit-tested but deliberately **not golden vectors**
  (report-only ratio/share math, like `entitlements.ts`), so no vector row. These remain consumers of
  the aggregate RPC wrappers in `web/lib/api/aggregates.ts` (`household_month_summary`,
  `household_category_totals`). **Known divergence (unfixed):** `aggregates.ts`'s
  `fetchOwnerSpend`/`OwnerSpendRow.person_id` does not match the `household_owner_spend` RPC's returned
  `user_id` column; the shipped surfaces avoid that wrapper (they need only month-summary +
  category-totals), so the mismatch is documented here for a future targeted fix, not exercised.
- **CSV bank-statement import** — web UI ships in spec 029 (`web/lib/csv/`, `web/components/csv/`).
  Supports Chase, Amex, Citi, Capital One, BofA, Wells Fargo, and TD Bank CSV formats.
  CLI retains PDF import + `--admin` service-role mode; web adds the browser file-picker CSV path.
- **CLI only (remaining):** PDF bank-statement import, statement reconciliation,
  dedupe, merchant→category heuristics, exclusions, and `--admin` service-role mode.
- **On-device receipt & bank-statement scanning** — a native Capacitor plugin
  (`web/ios/App/App/Plugins/Scan/`, camera capture + Vision OCR + PDFKit + an optional
  FoundationModels refiner, iOS 26+ only, silently absent otherwise) invoked from the one web/React
  client. Before 021 this was described as "iOS only... an input method, not a product-surface
  divergence" because it lived entirely inside the (then second) native app; that framing is now
  wrong — it's a native capability of the single remaining client, on par with any other plugin in
  the plugin matrix (see `specs/021-capacitor-ios-consolidation/plan.md`). The pure parsing/
  heuristics/categorization logic (ported from the frozen app's `ScanHeuristics`/`ScanParser`/
  `ScanInference`) now lives in `web/lib/scan/*` and is unit-tested (`web/test/scan/*`) — though, unlike the
  money engines, it carries no golden vector; only the capture/OCR/PDF-extraction half stays
  native, with no cross-platform equivalent to lock against. The web/desktop equivalent for CSV
  statements is the browser-side CSV import (spec 029); PDF statements remain `make ingest` (CLI).
- **Test-build feature flags (spec 015).** The frozen native app gated its Settings → Developer
  section (Use test data + Bypass auth) at compile/receipt time
  (`Config/TestBuild.swift`: `#if DEBUG` OR the TestFlight sandbox receipt) — now historical, see
  the archive. The live (and Capacitor-shell) mechanism is web's build-env-time gate
  (`lib/test-build.ts`: `NEXT_PUBLIC_VERCEL_ENV`/`NODE_ENV`, dead-code-eliminated in production);
  the Capacitor build inherits this unchanged, since it ships the same web bundle. Test-data
  isolation: `createClient()` swaps the live Supabase client for an in-memory seeded client
  (`lib/testdata/`) — outside the regression-vector harness (no money/date math), so it carries no
  vector; the sample dataset (`lib/testdata/seed.ts`) is not vectored.
- **Subscriptions (spec 018) — per-platform checkout reach + a trust-model note.** Every surface
  gates on the same server-side `entitlements` row and the same derived fact (matrix row above), and
  the paywall is one component (`components/Paywall.tsx`) rendered inside the `(app)` Shell. Two
  deliberate per-platform deltas, not drift: **(a) checkout reach** — desktop/mobile web redirects
  same-tab to Stripe Checkout and consumes a one-shot `?checkout=success|cancelled` return path
  (Settings + paywall both); the **Capacitor iOS shell opens checkout/portal in the external
  browser** (US-storefront rules; no StoreKit purchase flow in v1 — StoreKit-ready adapter seam
  documented in the spec) and relies on "Check again" plus foreground re-derivation (the store refetches the row and
  re-derives the gate on every `appStateChange` resume — merge review) instead of a return path.
  **(b) Trust model (shared, documented limitation):** the paywall is enforced by service-role-only
  entitlement state plus client shell gating; data-table RLS is deliberately **not**
  subscription-aware in v1, so a hostile custom API client with valid credentials but no
  subscription could still read/write its own household's rows
  (`specs/018-subscription-system/research.md` D9 records the rationale and the upgrade path).
