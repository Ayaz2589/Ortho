# Ortho cross-surface parity

> Subsystem deep-dives (architecture, key files, commands, gotchas) live in
> [`docs/`](docs/index.md) — this file is the audited parity *contract* between surfaces.
>
> **Enforcement in CI:** the iOS half of the golden-vector lock runs automatically —
> [`.github/workflows/ios-ci.yml`](.github/workflows/ios-ci.yml) executes the XCTest parity
> suites on a macOS runner for any push/PR touching `iOS/**` or `shared/test-vectors/**`,
> so vector drift on the Swift side is caught even from Linux environments that cannot
> build iOS. The web suites run locally via `npm test`.

Ortho is one product on **three surfaces over one Supabase backend** (all money is USD cents):

| Surface | What it is | Location |
|---|---|---|
| **iOS** | The canonical app (SwiftUI). | `iOS/Ortho-iOS/` |
| **web** | The same product on a desktop/responsive canvas (Next.js + React + TS). | `web/` |
| **CLI** | A deterministic Node tool: bank-statement import + transaction CRUD (no LLM). | `web/scripts/import/` (`cli.ts`, `tx.ts`) |

The two **apps** are kept in lockstep: pure finance logic is implemented in both TypeScript (`web/lib/*`)
and Swift (mirrored), and pinned by shared **golden vectors** in `shared/test-vectors/*.json` that *both*
test suites assert. The **CLI** writes to the same tables and reuses the shared TypeScript finance
functions where it can, but it is **not** part of the golden-vector harness and has a few intentional and
a few unintended divergences (below).

> Last reconciled: **2026-07-02, spec 013 (post-audit closeout)** — every residual gap from the same-day
> 65-divergence audit was closed or reclassified: `availableRanges` vectored, recurring-preview
> ordering/casing unified + vectored (`preview_merchants`), web outlier date localized, CLI filtering /
> atomic write / split tolerance / category duplication resolved, `--admin` documented by-design, iOS
> catalog fully translated in all six languages with a cross-catalog Vitest lock
> (`web/test/i18n/catalog-parity.test.ts`). Apps: web **705** tests green.
> Last audited: **2026-07-02** (65-divergence functional audit + same-day remediation — see Known
> divergences). Previous audit **2026-06-22** (full web+iOS app review). Method: 10-capability tri-surface audit plus
> a 6-dimension deep review of each app (dead code, refactors, correctness, per-surface behavior,
> constitution consistency), every finding adversarially re-verified, and a final cross-surface
> reconciliation. Apps: web **593** tests green, iOS **22** green; golden vectors unchanged. The iOS
> cross-surface pass is now COMPLETE: the iOS *loss-is-never-red* color fixes, U+2212 negative-money
> sign, removed-counterparty balances, half-open `[start, end)` month aggregation, and server-side
> atomic-write compensation have all landed, so both apps are in lockstep on colors, money sign,
> balances, the month boundary, and the atomic write. Legend: ✅ in parity · ⚠️ partial / known gap ·
> ⛔️ diverges · — not applicable.

## Parity matrix

| Capability | web | iOS | CLI | Shared source of truth |
|---|:--:|:--:|:--:|---|
| Money / USD-cents invariant | ✅ | ✅ | ✅ | `lib/finance/money.ts` + `currency.ts` → `currency.json` |
| Currency conversion (display) | ✅ | ✅ | — (USD-only) | same as above |
| Splits & owner shares | ✅ | ✅ | ✅ | `lib/splits.ts` → `transaction-splits.json` |
| Canonical leftover-cent order | ✅ | ✅ | ✅ | `orderedOwnerIds` (now used by all three) |
| Transaction + shares data contract | ✅ | ✅ | ✅ | columns mirrored across all three (incl. `paid_by`) |
| Member reimbursement / settle-up balance | ✅ | ✅ | — | `lib/balances.ts` ↔ `Balances.swift` → `member-balance.json` (+ `paid_by`, `transfer` kind) |
| Atomic parent+shares write | ✅ (rollback) | ✅ (rollback) | ✅ (rollback) | — (all three compensate, spec 013; an RPC would make it truly atomic) |
| Category / kind / source taxonomy | ✅ | ✅ | ✅ | Postgres `transaction_category`/`transaction_kind` enums (+ `transfer`) / `lib/types.ts` |
| Date storage & timezone | ✅ | ✅ | ✅ | noon-UTC transaction timestamps (spec 004; apps adopted 2026-07-02); date-only columns = local calendar day |
| Full-UI localization (6 languages) | ✅ | ✅ | — (English) | `web/lib/i18n/*` seeded from iOS `Localizable.xcstrings` |
| Transaction filtering / listing | ✅ | ✅ | ✅ | `lib/transactionFilters.ts` → `transaction-filters.json` (CLI runs the same function in-process, spec 013) |
| Dashboard month selection | ✅ | ✅ | — | `components/dashboard/range.ts` ↔ `DashboardRange.swift` (+ `monthBounds` → `dashboard-month-scope.json` / `transaction-filters.json`; `availableRanges` vectored in spec 013) |
| Insights engine | ✅ | ✅ | — | `insights.json` (8/8 rules + `preview_merchants` ordering/casing, spec 013) |
| Mortgage / housing math | ✅ | ✅ | — | `lib/finance/mortgage.ts` → `mortgage.json` |
| Auth (email-OTP, 8-digit) | ✅ | ✅ | ⚠️ | — (each calls Supabase SDK) |
| Concurrent iOS + web sessions | ✅ | ✅ | — | single-active-platform lock **removed** (feature 010) |
| Max session length (30-day cap) | ✅ | ✅ | ✅ | Supabase session timebox (720h) — clients sign out → sign-in on expiry |
| Golden-vector enforcement | ✅ (generator) | ✅ (asserts) | — | `shared/test-vectors/` + `gen-vectors.ts` |

## The parity core (genuinely shared & locked)

These are identical across the surfaces that have them, and (for the apps) locked by golden vectors so
neither language can silently drift:

- **USD-cents storage invariant** — every surface stores `transactions.amount_cents` as integer cents and
  materializes per-owner `transaction_shares` (`person_id` + `amount_cents`) that sum to the total.
- **Split math** — `computeShares` / `validateSplit` / `seedSplit` (`lib/splits.ts`, mirrored in iOS
  `TransactionSplits.swift`). The CLI imports and reuses `computeShares`, and (since this pass)
  canonicalizes owner order through `orderedOwnerIds` first, so the leftover cent matches the apps.
  `computeShares` guarantees the per-owner cents sum **exactly** to `amountCents` for even/percent —
  including when entered percents total up to `100 + PERCENT_TOLERANCE` (0.5): the floored bases then
  over-allocate, and both clients reclaim the excess one cent per owner in list order, skipping owners
  already at zero so no share goes negative. Locked by the `percent-over-tolerance-reclaim` vector in
  `transaction-splits.json`. (Bug fixed 2026-07-04; previously the negative leftover was dropped, so an
  over-100% split silently over-counted per-owner spend.)
- **Currency** — `toUSDCents` / `toDisplayAmount` / `formatMoney` with round-half-away-from-zero
  (`lib/finance/money.ts` ↔ iOS `Money.swift`), vectored across all 7 currencies. The CLI reuses
  `formatMoney` for display.
- **Category / kind / source taxonomy** — one Postgres `transaction_category` enum; `lib/types.ts`
  (TS union) and iOS `TransactionCategory` enum mirror it; the CLI imports the TS types.
- **Transaction filters** (apps) — `filterTransactions` (`lib/transactionFilters.ts` ↔ iOS
  `TransactionFilters.swift`), vectored.
- **Insights** (apps) — `generateInsights` ↔ `InsightEngine`, 8/8 rules vectored.
- **Mortgage** (apps) — `lib/finance/mortgage.ts` ↔ iOS `MortgageInfo.swift`, vectored.
- **Dashboard month scope** (apps) — `availableMonths` / `monthReferenceDate` / `stepMonth`
  (`components/dashboard/range.ts` ↔ `DashboardRange.swift`), vectored by `dashboard-month-scope.json`;
  the selected-month window reuses the already-vectored `monthBounds`. (Feature `011`.)
- **Member balance** (apps) — `balanceBetween` (`lib/balances.ts` ↔ `Balances.swift`), vectored by
  `member-balance.json`. The net "who owes whom" = each non-payer owner's share of expenses the other
  paid, minus reimbursements. A reimbursement is a directional `transfer` (`paid_by` = sender,
  `owner_ids = [recipient]`) that bypasses `computeShares` and is excluded from every spend/income
  aggregate. Expenses now carry `paid_by`. (Feature `012`.)

## Known divergences

**Full functional parity audit + remediation (2026-07-02):** a 76-agent audit (7 side-by-side area
comparisons, every finding adversarially verified) confirmed **65 divergences** beyond the vectored core —
full report in [`docs/parity-audit-2026-07-02.md`](docs/parity-audit-2026-07-02.md). All 65 were fixed the
same day in three waves: **data integrity** (web supabase-js error-checking sweep with optimistic
rollbacks, duplicate-household bootstrap, iOS property-edit FX corruption, desktop net-rental), **behavior
alignment** (transfer-category leakage out of iOS pickers, delete confirmations on iOS, Dashboard as the
landing tab on both, FX keep-last-rates fallback + freshness caption on web, unknown-enum row guard on web,
split seeding/live-rebalance on web, copy preserves custom splits / drops removed members, transaction
timestamps normalized to **noon UTC** on all three surfaces and date-only columns to the **local calendar
day** on both apps), **feature builds** (iOS collapsible month grouping; web desktop per-row Copy +
"Save and add another"), and **full web UI translation** into the six iOS languages (catalogs seeded from
`Localizable.xcstrings`; বাংলা pinned to Latin digits on both). The golden-vector harness itself was pinned
to TZ=UTC the same day after the first iOS CI run (`.github/workflows/ios-ci.yml`, new) caught
timezone-dependent vectors.

**Post-audit closeout (2026-07-02, spec 013 — `specs/013-post-audit-closeout/`):** every residual left by
the audit was closed the same week: (1) the iOS string catalog's 87 unlocalized keys translated in all five
non-English languages, with symbols/DEBUG-only strings marked `shouldTranslate:false` and a new
cross-catalog Vitest lock (`web/test/i18n/catalog-parity.test.ts`) enforcing coverage, shared-key identity
(placeholder-normalized, `%%` aware), bn Latin digits, and no-English-fallback for every `t()`/`tr()`
call-site key; (2) recurring-preview ordering/casing unified (amount desc, case-insensitive name tie-break,
newest-transaction casing — new `preview_merchants` vector field asserted by both suites); (3) the web
outlier-insight date now renders in the app locale (`generateInsights` locale parameter — the vectors pass
`en-US` explicitly); (4) `availableRanges` vectored (11 cases in `dashboard-month-scope.json`; iOS logic
extracted pure as `DashboardRange.available`); (5) the CLI section below fully resolved; (6) a dry-run-first
maintenance script repairs legacy 00:00–04:00Z timestamps (`make repair-dates`, spec 013 US2); (7) a
TestFlight deploy workflow with a fail-fast secret preflight (`.github/workflows/ios-deploy.yml`,
`docs/deploy.md`). Remaining known items: the `From`/`To` catalog keys serve both date-range and
person contexts with one value per language (es/ja fit only one context — needs per-context keys on both
surfaces, low severity); `monthsElapsed`/`yearsRemaining` stay independent reimplementations (below).

### Apps (web ↔ iOS) — tightly in parity

After `009`, the apps agree on every vectored function (owner ordering, currency rounding, recurring-average
truncation, mortgage months-elapsed boundary, the outlier insight). Residual, low-severity:

- ✅ **Atomic write (RESOLVED 2026-07-02, spec 013):** the parent transaction and its shares are still two
  separate, non-transactional calls, but **all three surfaces now compensate** — web rolls back the orphaned
  parent / restores the prior shares (`lib/store.tsx` `addTransaction`/`updateTransaction`), iOS does the
  equivalent server-side (`Services/TransactionsAPI.swift`), and the CLI now mirrors both: `db/persist.ts`
  and `db/transactions.ts` (`createOne`/`updateOne`) delete the just-inserted parent / restore the previous
  shares on a shares-write failure, reporting the orphan id if the compensation itself fails. *(A server-side
  `create_transaction_with_shares` RPC would make it truly atomic for all three — still the right long-term
  fix, tracked but out of scope.)*
- ✅ **Insights recurring preview (RESOLVED 2026-07-02, spec 013):** both surfaces now order the 3-merchant
  preview by monthly amount desc with a case-insensitive-name tie-break and take each merchant's casing from
  its most recent transaction — locked by the new `preview_merchants` field in `insights.json` (asserted by
  both parity suites); the web outlier-insight date also localizes via the app locale now.
- low **`monthsElapsed` / `yearsRemaining`** are independent reimplementations (iOS `Calendar` vs hand-rolled
  TS); they agree on all 8 mortgage vectors (incl. the day-29–31 boundary) but are only as safe as the
  vector coverage.

### CLI — shares the backend, diverges in places

The CLI is a trusted local tool; some differences are by-design (it's USD-only, headless, operator-driven),
others are real gaps:`

- ✅ **Filtering (RESOLVED 2026-07-02, spec 013):** `tx list` now narrows by **date window only** in SQL and
  runs the apps' shared `filterTransactions` in-process (`engine/filters.ts parseListArgs` →
  `lib/transactionFilters.ts`), so the same criteria return the same set the apps show: free-text `QUERY`
  (merchant/source/category/owner name), comma multi-select `CATEGORY`/`SOURCE` (OR), `OWNER` by household
  person name, `KIND` incl. transfer. Non-admin scope is **household-wide** like the apps; the fetch cap
  (default 200, `LIMIT=` to raise) is printed when hit — never silent. Locked by
  `web/test/import/list-parity.test.ts` (CLI ids ≡ shared-filter ids per scenario).
- **Date storage convention (RESOLVED 2026-07-02):** all three surfaces now write transaction dates as
  noon UTC of the picked local calendar day (`T12:00:00.000Z`, the spec-004 convention) — web's add/edit
  form and iOS's sheet were both normalized to it, so a row entered anywhere renders on the same calendar
  day everywhere.
- 📌 **`--admin` bypasses RLS (BY-DESIGN, documented 2026-07-02 per spec 013 FR-014):** admin mode uses the
  service-role key (`SUPABASE_SERVICE_ROLE_KEY` in gitignored `web/.env.local` — never in CI or commits) and
  therefore operates **outside** the household RLS the apps rely on: it can read/write any household's rows,
  and `tx add` attributes `created_by` by name-matching the statement holder (or the first user) rather than
  an authenticated session. This is intentional — the CLI is the operator's trusted local maintenance tool —
  with standing constraints: prefer sign-in mode when it suffices, prefer `DRY_RUN=1` before any admin write,
  and treat the hosted project as live shared data. Not a parity gap; will not be "fixed".
- ✅ **Split validation (RESOLVED 2026-07-02, spec 013):** `engine/split.ts validateCustomSplit` now delegates
  its sum check to the shared `validateSplit`, inheriting the apps' ±0.5 tolerance (owner-coverage and
  negativity checks unchanged). Locked in `web/test/import/split.test.ts`.
- ✅ **Type/category duplication (RESOLVED 2026-07-02, spec 013):** categories now have one source of truth —
  `lib/types.ts` exports `PICKABLE_CATEGORIES` (transfer deliberately unpickable) and derives the
  `TransactionCategory` union from it; `engine/filters.ts` and `cli.ts` import it, and the CLI month window
  reuses the shared `monthBounds`. Locked in `web/test/import/categories.test.ts`.

**Resolved (2026-06-17):** the CLI now canonicalizes owner order via `orderedOwnerIds` before
`computeShares` (`tx.ts`, `engine/toTransaction.ts`), so the leftover cent matches the apps — locked by a
scrambled-owner case in `web/test/import/toTransaction.test.ts`. The stale "6-digit" OTP copy is corrected
to "8-digit" across `cli.ts`, `tx.ts`, `db/client.ts`, the import README, and the `make ingest-help` text
(and the iOS `AppState` doc comment). *(2026-07-02, spec 013: every remaining item on this list closed —
atomic-write compensation now on all three surfaces, CLI filtering shares the apps' brain, the noon-UTC date
convention landed on all three, and `--admin` is documented by-design above.)*

**Full-app review pass (2026-06-22):** a deep, adversarially-verified review of both apps (dead code,
refactors, correctness, per-surface behavior, constitution consistency) was applied. Cross-surface results
(reconciled, both sides verified in lockstep): constitution *loss-is-never-red* fixes on both apps (housing
negative net-rental/net-balance, daily-spend increase, budget over-limit; web app-shell error panel
de-reddened); negative money now uses the Unicode minus on both; member balances now include **removed**
counterparties so an outstanding debt with someone who left stays visible/settle-able on both; iOS month
aggregation moved to half-open `[start, end)` to match web (closed `DateInterval.contains` was
double-counting the month boundary — locked by a new iOS boundary test); iOS parent+shares writes now
compensate server-side like web (atomic-write cell ⚠️→✅). iOS-only fixes: a Housing force-unwrap crash on
partial data, surfacing the previously-silent `dataError` + a bootstrap-recovery screen, ≥44pt touch
targets + Reduce-Motion gating, and deletion of spec-007 dead models. Web-only: transfer detail mislabel
("Expense"→"Reimbursement"), desktop delete-property, dead-code/`date-fns` removal. No golden vector
changed (finance logic untouched).

**Auth model change (2026-06-17, feature 010):** the single-active-platform lock was **removed** — iOS and
web may be signed in simultaneously (neither signs the other out; `platform_locks` is no longer read or
written by either client, though the table is retained, unused). Session lifetime is now capped at **30
days** via the Supabase server-side session timebox (`720h`, set in `supabase/config.toml` and enabled on
the production project); on expiry both clients sign out → sign-in via their existing failed-refresh
handling. See `specs/010-multi-device-sessions/`.

### CLI-only data paths the apps then read (no app equivalent, untested by vectors)

These shape which rows exist and what the apps display, but have no cross-surface check:

- **Dedupe** is `created_by`-scoped, not household-wide — a partner re-importing the same statement can
  double-write charges into the shared ledger.
- **Reconciliation** (matching parsed totals to printed subtotals) and any migration backfill place the
  leftover cent by `sort_order`, which can differ from runtime `computeShares` order.
- **Exclusions, merchant cleanup, and the merchant→category heuristic** (`engine/categorize.ts`, profiles)
  decide row inclusion, merchant strings, and categories the apps then read.
- **Admin first-name owner matching** and **Dec→Jan year inference** in date parsing are CLI-only and
  unvectored.

## How parity is enforced

- **Apps:** `web/scripts/gen-vectors.ts` generates `shared/test-vectors/*.json` from `web/lib/*`; the web
  Vitest suite (`web/test/*.parity.test.ts`) and the iOS XCTest suite (`iOS/Ortho-iOSTests/*ParityTests.swift`)
  both assert the same files. A divergence in any vectored function fails **both** suites (verified by
  drift-injection). Run: `cd web && npm test` (Node ≥ 20.19 / ≥ 22.12) and
  `cd iOS && xcodebuild test -scheme Ortho-iOS`. After any pure-logic change: `npm run gen:vectors`, then run
  both suites.
- **CLI:** has its own unit tests (`web/test/import/*`) but asserts against **no** shared vector. Its reuse of
  `computeShares` / `formatMoney` / `lib/types` is the main thing keeping it aligned; everything it
  reimplements (filtering, money parsing, split validation, dates) can drift undetected.

## Surface-specific by design (not parity gaps)

- **Apps only:** Dashboard, Insights, Budgets, Housing/mortgage UI, Settings, navigation (tab bar vs sidebar),
  display-currency conversion. *Note:* the dashboard's time-scoping is no longer purely surface-specific —
  its specific-month selection is a parity-locked sub-capability (the chosen-month window reuses the vectored
  `monthBounds`, and the new `availableMonths` / reference-date / stepper logic is locked by
  `dashboard-month-scope.json`; see feature `011`).
- **CLI only:** bank detection + per-bank PDF/CSV parsers (`profiles/*`), statement reconciliation, dedupe,
  merchant→category heuristics, exclusions, and `--admin` service-role mode.
- **iOS only (spec `014`): receipt & statement scanning** — an *input method*, not a product-surface
  divergence: a Scan capsule on the add form runs on-device OCR (camera / Photo Library / PDF via Files)
  and prefills the existing form (receipt) or drives a sequential review wizard (statement); every save
  goes through the same optimistic add path as manual entry, so nothing downstream diverges. The
  web/desktop equivalent for statements is the CLI's `make ingest`. The statement half deliberately
  **ports the CLI ingest conventions** (`iOS/Ortho-iOS/Services/Scan/ScanHeuristics.swift` mirrors
  `web/scripts/import/engine/{dates,categorize,exclusions}.ts`: noon-UTC year-inferred posting dates,
  the ordered merchant→category regex table, the card-payment exclusion patterns) — these tables are
  convention mirrors to keep in sync BY HAND (they are input heuristics, not vectored finance math; the
  parser is locked instead by its own fixture suite `ScanParserTests` + `Resources/ScanFixtures/`).
  Two deliberate deltas from the CLI: the duplicate key is **(calendar day, amount)** household-wide —
  a scanned receipt has no reliable source card, unlike an import run — and an unmatched merchant keeps
  the form's default category instead of the CLI's `entertainment` fallback. Reimbursement remains
  unpickable: card-payment/transfer statement rows are flagged and default-skipped, never expenses.
- **Test-build feature flags (spec 015) — intentional per-surface gating divergence.** A Settings →
  Developer section (Use test data + Bypass auth) exists on both apps but is gated by *different*
  mechanisms because the platforms differ, and this is deliberate, not drift: iOS gates at
  **compile/receipt time** (`Config/TestBuild.swift`: `#if DEBUG` OR the TestFlight sandbox receipt;
  `FeatureFlags` force-false off a test build), web gates at **build-env time**
  (`lib/test-build.ts`: `NEXT_PUBLIC_VERCEL_ENV`/`NODE_ENV`, dead-code-eliminated in production).
  Test-data isolation also differs by necessity — iOS guards each optimistic mutator's network
  `Task` (`AppState.testDataEnabled`); web swaps the single `createClient()` handle for an in-memory
  seeded client (`lib/testdata/`). The feature is **outside** the golden-vector harness (no money/date
  math), so it carries no shared vector; the refreshed sample dataset (`Person.sample` etc. on iOS,
  `lib/testdata/seed.ts` on web) is per-surface, not vectored.
