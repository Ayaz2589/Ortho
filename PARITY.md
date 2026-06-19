# Ortho cross-surface parity

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

> Last audited: **2026-06-19** (full web+iOS app review). Method: 10-capability tri-surface audit plus
> a 6-dimension deep review of each app (dead code, refactors, correctness, per-surface behavior,
> constitution consistency), every finding adversarially re-verified. Apps: web **593** tests green,
> iOS **21** green. Web pass applied: constitution *loss-is-never-red* fixes (housing negative net
> rental / net balance, app-shell error panel), transfer-detail mislabel, dead-code/dependency removal.
> The matching iOS-side color fixes + cross-surface items (see Known divergences) are tracked for the
> iOS pass. Legend: ✅ in parity · ⚠️ partial / known gap · ⛔️ diverges · — not applicable.

## Parity matrix

| Capability | web | iOS | CLI | Shared source of truth |
|---|:--:|:--:|:--:|---|
| Money / USD-cents invariant | ✅ | ✅ | ✅ | `lib/finance/money.ts` + `currency.ts` → `currency.json` |
| Currency conversion (display) | ✅ | ✅ | — (USD-only) | same as above |
| Splits & owner shares | ✅ | ✅ | ✅ | `lib/splits.ts` → `transaction-splits.json` |
| Canonical leftover-cent order | ✅ | ✅ | ✅ | `orderedOwnerIds` (now used by all three) |
| Transaction + shares data contract | ✅ | ✅ | ✅ | columns mirrored across all three (incl. `paid_by`) |
| Member reimbursement / settle-up balance | ✅ | ✅ | — | `lib/balances.ts` ↔ `Balances.swift` → `member-balance.json` (+ `paid_by`, `transfer` kind) |
| Atomic parent+shares write | ✅ (rollback) | ⚠️ | ⚠️ | — (only web compensates) |
| Category / kind / source taxonomy | ✅ | ✅ | ✅ | Postgres `transaction_category`/`transaction_kind` enums (+ `transfer`) / `lib/types.ts` |
| Date storage & timezone | ✅ | ✅ | ⚠️ | — (convention, not shared code) |
| Transaction filtering / listing | ✅ | ✅ | ⚠️ | `lib/transactionFilters.ts` → `transaction-filters.json` |
| Dashboard month selection | ✅ | ✅ | — | `components/dashboard/range.ts` ↔ `DashboardRange.swift` (+ `monthBounds` → `dashboard-month-scope.json` / `transaction-filters.json`) |
| Insights engine | ✅ | ✅ | — | `insights.json` (8/8 rules) |
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

### Apps (web ↔ iOS) — tightly in parity

After `009`, the apps agree on every vectored function (owner ordering, currency rounding, recurring-average
truncation, mortgage months-elapsed boundary, the outlier insight). Residual, low-severity:

- ⚠️ **Atomic write (HIGH, also affects CLI):** all surfaces write the parent transaction and its shares as
  two separate, non-transactional calls. **Only web rolls back** the orphaned parent on a shares-write
  failure (`lib/store.tsx` `addTransaction`/`updateTransaction`). iOS rolls back local state only
  (`AppState.swift`) and the CLI throws without cleanup (`db/persist.ts`), so on a partial failure both can
  leave a share-less parent that rehydrates as "creator owns all." *(Web was hardened in 009; iOS/CLI not
  yet — a server-side `create_transaction_with_shares` RPC would close it for all three.)*
- low **Insights recurring preview:** the 3-merchant name preview is ordered by amount on iOS but in
  trailing-window order on web, and uses a different transaction's merchant casing. IDs / severities /
  magnitudes (the vectored fields) match; only the body string differs.
- low **`monthsElapsed` / `yearsRemaining`** are independent reimplementations (iOS `Calendar` vs hand-rolled
  TS); they agree on all 8 mortgage vectors (incl. the day-29–31 boundary) but are only as safe as the
  vector coverage.

### CLI — shares the backend, diverges in places

The CLI is a trusted local tool; some differences are by-design (it's USD-only, headless, operator-driven),
others are real gaps:`

- ⚠️ **Filtering reimplemented (MEDIUM):** `tx list` builds SQL `WHERE` clauses (`db/transactions.ts` +
  `engine/filters.ts`) rather than the shared `filterTransactions`. Consequences: no free-text query or
  owner filter; single-value (not multi-select OR) for category/source/kind; a silent **200-row cap**;
  non-admin scopes to `created_by = you` (the apps scope household-wide). Same criteria can return a
  different set than the apps.
- ⚠️ **Date storage convention (MEDIUM):** the CLI writes `T12:00:00.000Z` (noon **UTC**); web's add-form
  writes noon in the **browser's local** time. Both apps then bucket "Today/Yesterday" by the viewer's local
  day, so far-from-UTC viewers can see a CLI-imported row land on an adjacent calendar day. The cents/owners
  are unaffected.
- ⚠️ **`--admin` bypasses RLS (MEDIUM, by-design):** admin mode uses the service-role key and attributes
  `created_by` by name-matching the statement holder rather than an authenticated session — powerful, and
  outside the household RLS the apps rely on.
- low **Split validation drift:** `engine/split.ts validateCustomSplit` requires percentages to total
  *exactly* 100, while the shared `validateSplit` allows a ±0.5 tolerance.
- low **Type/category duplication:** `engine/filters.ts` hardcodes its own `CATEGORY_LIST` and month-window
  helper instead of deriving from `lib/types.ts` / `transactionFilters.ts` — they match today but drift if a
  category is added.

**Resolved (2026-06-17):** the CLI now canonicalizes owner order via `orderedOwnerIds` before
`computeShares` (`tx.ts`, `engine/toTransaction.ts`), so the leftover cent matches the apps — locked by a
scrambled-owner case in `web/test/import/toTransaction.test.ts`. The stale "6-digit" OTP copy is corrected
to "8-digit" across `cli.ts`, `tx.ts`, `db/client.ts`, the import README, and the `make ingest-help` text
(and the iOS `AppState` doc comment). Still open: the cross-cutting atomic-write gap (iOS/CLI), CLI
filtering reimplementation, the noon-UTC date convention, and `--admin` RLS bypass.

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
