# shared/ — Regression test vectors (formerly cross-language golden vectors)

> **spec 021 (2026-07-09):** this document originally described `shared/` as the mechanism that
> kept a TypeScript and a Swift implementation of the same finance logic honest against each
> other. That second (native SwiftUI) implementation is now frozen and no longer updated (see
> `./ios.md`); `shared/test-vectors/` is kept, mechanically unchanged, but reframed as an ordinary
> **single-implementation regression/pinning suite** — it still catches an accidental behavior
> change in the pure TS logic it covers, just without a second language to compare against. Where
> this doc still says "both suites" or references the iOS XCTest consumer, that's the historical
> mechanism; going forward, adding a *new* vector file no longer needs the pbxproj step (§8).

## 1. Purpose

`shared/` is the smallest subsystem in the Ortho monorepo. It contains exactly one thing: **`shared/test-vectors/`**, a set of eleven JSON files of canonical input→output cases for the pure finance logic in `web/lib/*` / `web/components/dashboard/range.ts` — now the **only** implementation of that logic (previously mirrored in Swift; see the spec-021 banner above). The web Vitest suite asserts against these exact files on every change, so a behavior change is caught in CI before it ships, even without a second language to diff against. This is the mechanism that started as cross-language parity (originating in `specs/002-logic-dedup`; see `PARITY.md` §"How parity is enforced") and is now a regression lock.

What is **not** in `shared/`:

- **No shared types** — data types live in `web/lib/types.ts`. (The frozen native app's `iOS/Ortho-iOS/Models/*.swift` mirrored them historically, kept aligned by convention plus the vectors themselves; no longer maintained.)
- **No design tokens or assets** — all design tokens now live in `web/app/globals.css`; the `ortho-web` skill governs usage. (The frozen app's `iOS/Ortho-iOS/DesignSystem/` implemented the same system independently, historically.)
- **No shared runtime code** — nothing in `shared/` ships in the app. It is test fixtures only.

## 2. Stack & key dependencies

- Plain JSON files + one markdown README. No package manifest, no build.
- **Generator** (writes the files): `web/scripts/gen-vectors.ts`, run via `tsx` (`^4.22.4`) from the web workspace. Requires the web deps installed (`cd web && npm install`) and Node per `web/package.json` engines: `>=20.19.0 || >=22.12.0`.
- **Consumer**: Vitest `^4.1.8` (`web/test/*.parity.test.ts`) — the sole live consumer since spec 021.
- **Historical consumer (frozen, no longer run in CI)**: XCTest target `Ortho-iOSTests` (macOS/Xcode only) — still present in the frozen app's source and still *able* to run manually, but not kept current.

## 3. Directory map

```
shared/
└── test-vectors/
    ├── README.md                    # Contract, file-by-file docs, regen + run instructions
    ├── mortgage.json                # (554 ln) MortgageInfo / lib/finance/mortgage.ts: payment, balance,
    │                                #   equity, maturity, years remaining, 12-mo amortization slice
    ├── insights.json                # (918 ln) InsightEngine / lib/finance/insights.ts: snapshot +
    │                                #   pinned referenceDate → fired insights (id/severity/category/
    │                                #   magnitude_cents/preview_merchants)
    ├── transaction-filters.json     # (1500 ln) filterTransactions / lib/transactionFilters.ts:
    │                                #   query/categories/kind/sources/owners/date-window cases → expectedIds
    ├── transaction-splits.json      # (535 ln) computeShares/validateSplit/seedSplit/orderedOwnerIds
    │                                #   (lib/splits.ts): even/percent/value splits, leftover-cent placement,
    │                                #   save-gate validations, edit-seed round-trips, canonical owner ordering
    ├── currency.json                # (692 ln) toDisplayAmount/toUSDCents (lib/finance/money.ts +
    │                                #   lib/finance/currency.ts) across all 7 currencies at fallback rates
    ├── currency-names.json          # (9 ln) CURRENCY_NAMES (lib/finance/currency.ts): per-currency
    │                                #   display NAME keyed by code (spec 020)
    ├── currency-symbols.json        # (9 ln) CURRENCY_SYMBOLS (lib/finance/currency.ts): per-currency
    │                                #   SYMBOL, cny=CN¥, keyed by code (spec 020)
    ├── dashboard-month-scope.json   # (267 ln) availableMonths/availableRanges/monthReferenceDate/stepMonth
    │                                #   (components/dashboard/range.ts) — dashboard range + month picker logic
    ├── member-balance.json          # (352 ln) balanceBetween (lib/balances.ts): reimbursement/settle-up
    │                                #   net cents between two members, incl. transfer-kind reimbursements
    ├── housing-net-rental.json      # (113 ln) occupiedRentCents/netRentalCents (lib/finance/housing.ts):
    │                                #   occupied-only unit rent − mortgage payment; the single figure the
    │                                #   Dashboard summary and property-detail Net balance both show (spec 019)
    ├── lease.json                   # (122 ln) rentDueDay/daysUntilNextRent/daysUntilEnd/isRenewalSoon
    │                                #   (components/housing/lease.ts) with an injected asOf (spec 020)
    └── budget-rollover.json         # computeRolloverLedger (lib/finance/budgets.ts): fixed/flex/
                                     #   non_monthly carry recurrence in integer cents (spec 027)
```

> **spec 027 (2026-07-19):** `budget-rollover.json` is the **twelfth** vector file
> — the fixed/flex/non_monthly budget carry math. Added the going-forward way
> (§8): one section in `gen-vectors.ts` + one `budget-rollover.parity.test.ts`,
> no pbxproj/Swift wiring. Where this doc says "eleven files", read "twelve".

Note: `shared/test-vectors/README.md` now documents all eleven files (its "Files (11)" section, refreshed in feature 020), though it still frames them as a cross-language contract — read it alongside this doc's spec-021 banner. `gen-vectors.ts` and `PARITY.md` remain the most current per-case references.

## 4. Architecture — how the regression loop works

```
web/lib/* (TS, source of truth for expected values)
        │
        │  cd web && npm run gen:vectors        (tsx scripts/gen-vectors.ts)
        ▼
shared/test-vectors/*.json   ← committed to git; regenerated only on INTENDED behavior change
        │
        └──  web/test/*.parity.test.ts read the JSON via fs at
             `resolve(here, '../../shared/test-vectors/<file>.json')`
             and assert web/lib/* reproduces `expected`.  (cd web && npm test)

(historical, frozen, not run in CI: iOS/Ortho-iOSTests/*ParityTests.swift decoded the
same JSON via Bundle(for:).url(forResource:) and asserted the Swift mirrors reproduced
`expected` — see ./ios.md. Still runnable manually on macOS via the frozen app's
workflow_dispatch-only CI, but no longer kept current.)
```

Key properties:

- **The TypeScript implementation generates the expected values.** Historically it was also parity-corrected to match the frozen app's Swift semantics (e.g. recurring-average rounding truncates toward zero like `Int64` division, not `Math.round`) — those corrections stay in place (they're now just how the TS implementation behaves), but there's no longer a second implementation to correct *for*.
- **Vectors are no longer wired into any native project for new files.** `iOS/Ortho-iOS.xcodeproj/project.pbxproj` still references all eleven existing JSONs by relative path (`PBXFileReference`, `path = "../shared/test-vectors/<file>.json"`, in the frozen test target's Copy Bundle Resources) — untouched, since that app is frozen. **Adding cases to an existing file** needs no changes anywhere but `gen-vectors.ts` (always true). **Adding a brand-new vector file** now needs only `gen-vectors.ts` + one Vitest file — the pbxproj step in §8 is historical, not a going-forward requirement.
- **Determinism/portability decisions baked into the vectors** (originally so TS `number` and Swift `Double`/`Int64` agreed bit-for-bit; kept as-is since they're still good practice for a pinned regression suite):
  - All money is integer USD cents.
  - Transaction/filter ids are lowercase UUID strings (`00000000-0000-0000-0000-…`) — a convention kept for continuity, no longer required for a Swift decoder to accept them.
  - Dates are timezone-stable by construction: **all housing date-only values** — mortgage `closing_date`, lease `lease_start`/`lease_end`, and rental-payment `date` — parse as **local** calendar dates via the shared `parseLocalDate` helper in `web/lib/format.ts` (used by `mortgage.ts`, `lease.ts`, and the housing cards). (Spec 019 fixed the lease/payment/closing display sites, which previously used raw `new Date('YYYY-MM-DD')` = UTC midnight and shifted a day west of UTC.) Insight dates mirror JS `new Date('YYYY-MM-DD')` (UTC midnight) and sit mid-month so timezone can't flip a month bucket; filter windows are **UTC half-open `[from, to)`** via `monthBounds('YYYY-MM')`. The `housing-net-rental` vectors are pure integer-cent math and carry no dates.
  - Display *strings* for currency are locale-dependent and deliberately **not** vectored — only numeric amounts are.
- **The insight `id` scheme is part of the contract** (e.g. `top-category-dining-2026-06`, `budget-over-dining-2026-06`, `outlier-<lowercase-uuid>`). Differing ids across suites is a real divergence, not a test bug.
- **What's covered**: mortgage math (incl. zero-interest and month-end-closing day-boundary cases), all 8 insight rules, transaction filtering (every dimension in isolation, OR-within/AND-across, empty edges, UTC month boundary), split math (leftover-cent placement in canonical owner order, percent/value validation gates, lossless edit-seed round-trips), currency conversion in both directions for 7 currencies, dashboard month-picker derivation/stepping plus range availability (`availableRanges`, 11 cases: TS `availableRanges` in `web/components/dashboard/range.ts` ↔ Swift `DashboardRange.available`), and member reimbursement balances (expenses with `paid_by` + `transfer`-kind reimbursements netting to signed cents).
- **Insight `expected[]` entries carry `preview_merchants: string[]`** (feature 013): the recurring insight's 3-merchant preview, locking both ordering and casing — amount descending, case-insensitive name tie-break, casing taken from the newest transaction; `[]` on non-recurring insights. Two scenarios exist specifically for the ordering tie-break and casing drift. `generateInsights` also gained a trailing `locale` parameter — the generator and both parity suites pass the default `en-US`, keeping the vectors language-neutral.
- **What's NOT covered**: the CLI (`web/scripts/import/`) asserts against no vector — it reuses `computeShares`/`orderedOwnerIds`/`formatMoney` from `web/lib` directly but its own filtering/parsing can drift (documented in `PARITY.md`).

## 5. Key files

Read in this order:

1. `shared/test-vectors/README.md` — the contract, per-file schemas (for the original 4), timezone rules, regen and run instructions.
2. `web/scripts/gen-vectors.ts` — the single generator; defines every case for all 11 files and is the de-facto schema documentation for any file the README under-documents. Heavily commented with the parity rationale (R1–R8 references) — still accurate as *rationale*, even though there's no second language left to compare against.
3. `PARITY.md` (repo root) — the web-vs-CLI matrix mapping each capability → TS file → vector file; §"How parity is enforced" is the operational summary.
4. `web/package.json` — `"gen:vectors": "tsx scripts/gen-vectors.ts"` and the Node engines constraint.
5. Consumers (11 suites, each mirrors one JSON): `web/test/mortgage.parity.test.ts`, `web/test/insights.parity.test.ts`, `web/test/transaction-filters.parity.test.ts`, `web/test/splits.parity.test.ts`, `web/test/currency.parity.test.ts`, `web/test/currency-names.parity.test.ts`, `web/test/currency-symbols.parity.test.ts`, `web/test/dashboard-month-scope.parity.test.ts`, `web/test/member-balance.parity.test.ts`, `web/test/housing-net-rental.parity.test.ts`, `web/test/lease.parity.test.ts`.
6. **Historical (frozen, not run in CI)**: `iOS/Ortho-iOSTests/MortgageParityTests.swift`, `InsightParityTests.swift`, `TransactionFilterParityTests.swift`, `TransactionSplitParityTests.swift`, `CurrencyParityTests.swift`, `CurrencyNameParityTests.swift`, `CurrencySymbolParityTests.swift`, `DashboardScopeParityTests.swift`, `MemberBalanceParityTests.swift`, `HousingNetRentalParityTests.swift`, `LeaseParityTests.swift` — untouched, part of the frozen app.
7. Vectored implementations: `web/lib/finance/mortgage.ts`, `web/lib/finance/insights.ts`, `web/lib/finance/money.ts`, `web/lib/finance/currency.ts`, `web/lib/transactionFilters.ts`, `web/lib/splits.ts`, `web/lib/balances.ts`, `web/components/dashboard/range.ts`, `web/lib/finance/housing.ts`, `web/components/housing/lease.ts`. (The frozen app's Swift mirrors — `iOS/Ortho-iOS/Models/MortgageInfo.swift`, `Services/InsightEngine.swift`, etc. — are historical only.)
8. `iOS/Ortho-iOS.xcodeproj/project.pbxproj` — where the eleven *existing* JSONs are referenced (`../shared/test-vectors/...`) and added to Copy Bundle Resources, as of when the app was frozen. Not touched going forward.

## 6. How to build / run / test

There is nothing to build in `shared/` itself — the JSONs are committed artifacts.

**Regenerate the vectors** (only when *intended* behavior changes):

```bash
cd web && npm install        # once
npm run gen:vectors          # writes ../shared/test-vectors/*.json + prints a count summary
```

**Run the regression suite** (works on Linux; Node ≥ 20.19 or ≥ 22.12 required by Vitest 4):

```bash
cd web && npm test           # Vitest; regression tests are test/*.parity.test.ts
```

**Run the frozen app's historical parity suite** — **macOS-only, optional** (XCTest cannot build off macOS; only relevant for rollback/archaeology on the frozen app, see `./ios.md`):

```bash
cd iOS && xcodebuild test -scheme Ortho-iOS
```

After any change to a vectored pure-logic function: regenerate, then run `npm test`. Regenerated diffs to the JSONs should be committed alongside the logic change and reviewed as behavior-change diffs — there's no second suite to catch an unintended change anymore, so review the diff carefully.

## 7. Conventions & patterns

- **File shape**: `mortgage.json` and `insights.json` are top-level arrays of `{ input, expected }`; `transaction-filters.json` is `{ cases: [...] }`; `transaction-splits.json` is `{ cases, validations, seeds, ownerOrdering }`; `currency.json` is `{ toDisplay, toUsdCents }`; `dashboard-month-scope.json` is `{ availableMonths, availableRanges, monthReferenceDate, stepMonth }`; `member-balance.json` is `{ cases }`. Every case has a human-readable `name` used as the test name in both suites.
- **Pretty-printed JSON** (`JSON.stringify(..., null, 2)` + trailing newline) so diffs are reviewable.
- **Integer cents everywhere**; the only doubles are rates, percents, `equityFraction`, and display amounts — originally chosen so IEEE-754 arithmetic matched across TS and Swift; kept as good practice for a pinned regression suite.
- **Leftover-cent rule**: remainders go to the earliest owner in *canonical* order (`orderedOwnerIds` — the C1 contract); the `ownerOrdering` cases feed deliberately scrambled owner lists to lock this.
- **Half-open date windows** `[from, to)` for anything month-scoped.
- Cases exist specifically to pin historical bug classes; comments in `gen-vectors.ts` tag them (e.g. R6 recurring-average truncation, R7 month-end mortgage boundary and lossless split seeds, R8 outlier-id casing).

## 8. Gotchas

- **The harness is pinned to TZ=UTC** (since 2026-07-02, originally because the first iOS CI run
  caught timezone-dependent vectors). `gen-vectors.ts` and `vitest.config.ts` set
  `process.env.TZ = 'UTC'` — keep this pin regardless of the frozen app's status. Rationale: JS
  parses date-only strings (`"2026-06-01"`) as UTC midnight but the engines bucket months in the
  process timezone, so an unpinned run encodes the generating machine's timezone (day-1 rows fall
  into the previous month anywhere west of UTC).
- **Never hand-edit the JSONs.** They are generated; hand edits will be silently reverted by the next `npm run gen:vectors`. Fix the TS implementation (or the case list in `gen-vectors.ts`) and regenerate.
- **Regeneration launders bugs — more important than ever to catch in review.** Because expected values come from the TS implementation, regenerating after an *unintended* TS behavior change bakes the bug into the vectors and the suite will still pass — there is no second, independently-implemented suite left to catch it. Treat every vector diff in review as a real behavior-change diff, not a rubber-stamp.
- **The generator asserts nothing** — it just writes whatever the TS functions return. The safety net is reviewing the diff, then running `npm test`.
- **`shared/test-vectors/README.md` documents all eleven vectors** (refreshed in feature 020) but still frames them as a cross-language contract — read it alongside this doc's spec-021 banner, not as the current framing on its own. `gen-vectors.ts` and `PARITY.md` remain the most current references.
- **Adding a new vector file (going forward, post-021)**: two touchpoints — a section + `writeFileSync` in `web/scripts/gen-vectors.ts`, and a `web/test/<name>.parity.test.ts`. No pbxproj edit, no Swift test — there's no second consumer to wire up. (The eleven *existing* files still carry their historical pbxproj entries in the frozen `iOS/Ortho-iOS.xcodeproj`, untouched.)
- **Node version**: Vitest 4 needs Node ≥ 20.19 / ≥ 22.12 (`require(ESM)`); older Node fails the web suite even though `tsx` itself may run.
- Vector transaction `date` strings intentionally sit **mid-month at 12:00Z** (except boundary-specific cases) so no local timezone can re-bucket them.

## 9. Cross-links

- **./web.md** — hosts both the generator (`web/scripts/gen-vectors.ts`, `npm run gen:vectors`) and the vectored TS implementations (`web/lib/*`, `web/components/dashboard/range.ts`) plus the Vitest regression suite; also the Capacitor iOS shell that's now the sole consumer of this logic on iOS.
- **./ios.md** — the **frozen** native app; historically hosted the Swift mirrors and the XCTest parity suite (pbxproj references these JSONs by relative path). Read only for rollback/archaeology.
- **./supabase.md** — vector data models (Transaction/Budget/Property shapes, `paid_by`, `transfer` kind, category/kind enums) mirror the Postgres schema; the vectors themselves never touch the backend.
- **./makefile.md** — the Makefile does **not** cover vectors (it is ingest/tx CLI only); vector regen goes through `npm run gen:vectors` directly.
- `PARITY.md` (repo root) — the authoritative capability↔vector mapping and audit log.
