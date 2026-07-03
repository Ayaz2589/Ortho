# shared/ — Cross-language golden test vectors

## 1. Purpose

`shared/` is the smallest subsystem in the Ortho monorepo, and the only directory consumed by *both* apps. It contains exactly one thing: **`shared/test-vectors/`**, a set of seven JSON files of canonical input→output cases for the pure finance logic that is implemented twice — once in TypeScript (`web/lib/*`, `web/components/dashboard/range.ts`) and once in Swift (`iOS/Ortho-iOS/*`). Both test suites (Vitest on web, XCTest on iOS) assert against these exact files, so neither language can silently drift. This is the deliberate, no-backend mechanism for cross-language parity (originating in `specs/002-logic-dedup`; see `PARITY.md` §"How parity is enforced").

What is **not** in `shared/`:

- **No shared types** — data types are duplicated per surface (`web/lib/types.ts` vs `iOS/Ortho-iOS/Models/*.swift`), kept aligned by convention plus the vectors themselves (vector JSON decodes straight into each language's native types).
- **No design tokens or assets** — iOS design tokens live in `iOS/Ortho-iOS/DesignSystem/`, web tokens in the web app's CSS; the `ortho-web` skill governs the mapping.
- **No shared runtime code** — nothing in `shared/` ships in either app. It is test fixtures only.

## 2. Stack & key dependencies

- Plain JSON files + one markdown README. No package manifest, no build.
- **Generator** (writes the files): `web/scripts/gen-vectors.ts`, run via `tsx` (`^4.22.4`) from the web workspace. Requires the web deps installed (`cd web && npm install`) and Node per `web/package.json` engines: `>=20.19.0 || >=22.12.0`.
- **Web consumer**: Vitest `^4.1.8` (`web/test/*.parity.test.ts`).
- **iOS consumer**: XCTest target `Ortho-iOSTests` (macOS/Xcode only).

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
    ├── transaction-filters.json     # (1408 ln) filterTransactions / lib/transactionFilters.ts:
    │                                #   query/categories/kind/sources/owners/date-window cases → expectedIds
    ├── transaction-splits.json      # (516 ln) computeShares/validateSplit/seedSplit/orderedOwnerIds
    │                                #   (lib/splits.ts): even/percent/value splits, leftover-cent placement,
    │                                #   save-gate validations, edit-seed round-trips, canonical owner ordering
    ├── currency.json                # (692 ln) toDisplayAmount/toUSDCents (lib/finance/money.ts +
    │                                #   lib/finance/currency.ts) across all 7 currencies at fallback rates
    ├── dashboard-month-scope.json   # (267 ln) availableMonths/availableRanges/monthReferenceDate/stepMonth
    │                                #   (components/dashboard/range.ts) — dashboard range + month picker logic
    └── member-balance.json          # (352 ln) balanceBetween (lib/balances.ts): reimbursement/settle-up
                                     #   net cents between two members, incl. transfer-kind reimbursements
```

Note: `shared/test-vectors/README.md` documents only 4 of the 7 files (mortgage, insights, filters, splits); `currency.json`, `dashboard-month-scope.json`, and `member-balance.json` were added later (features 008–012 era) and are documented in the generator source and `PARITY.md` instead.

## 4. Architecture — how the parity loop works

```
web/lib/* (TS, source of truth for expected values)
        │
        │  cd web && npm run gen:vectors        (tsx scripts/gen-vectors.ts)
        ▼
shared/test-vectors/*.json   ← committed to git; regenerated only on INTENDED behavior change
        │
        ├── web:  web/test/*.parity.test.ts read the JSON via fs at
        │         `resolve(here, '../../shared/test-vectors/<file>.json')`
        │         and assert web/lib/* reproduces `expected`.  (cd web && npm test)
        │
        └── iOS:  iOS/Ortho-iOSTests/*ParityTests.swift decode the SAME JSON via
                  `Bundle(for:).url(forResource:)` and assert the Swift mirrors
                  reproduce `expected`.  (Xcode/xcodebuild, macOS only)
```

Key properties:

- **The TypeScript implementation generates the expected values** (after being parity-corrected to match iOS semantics — e.g. recurring-average rounding truncates toward zero like Swift `Int64` division, not `Math.round`). The Swift side never generates; it only asserts.
- **Vectors are wired into the Xcode project by relative path**: `iOS/Ortho-iOS.xcodeproj/project.pbxproj` contains `PBXFileReference` entries with `path = "../shared/test-vectors/<file>.json"` and all seven JSONs are in the test target's Copy Bundle Resources phase. Regenerating a JSON therefore updates the iOS test inputs automatically on the next test build — no copy step, and **adding cases or sections to an existing file needs no pbxproj change** (feature 013 added `availableRanges` and `preview_merchants` this way). Adding an **eighth** vector file requires pbxproj edits (see §8), but the pbxproj is plain text and hand-editable.
- **Determinism/portability decisions baked into the vectors** (so TS `number` and Swift `Double`/`Int64` agree bit-for-bit):
  - All money is integer USD cents.
  - Transaction/filter ids are lowercase UUID strings (`00000000-0000-0000-0000-…`) so the iOS `Transaction` decoder (UUID ids) accepts them; web compares strings and is agnostic.
  - Dates are timezone-stable by construction: mortgage dates parse as **local** calendar dates on both sides; insight dates mirror JS `new Date('YYYY-MM-DD')` (UTC midnight) and sit mid-month so timezone can't flip a month bucket; filter windows are **UTC half-open `[from, to)`** via `monthBounds('YYYY-MM')`.
  - Display *strings* for currency are locale-dependent and deliberately **not** vectored — only numeric amounts are.
- **The insight `id` scheme is part of the contract** (e.g. `top-category-dining-2026-06`, `budget-over-dining-2026-06`, `outlier-<lowercase-uuid>`). Differing ids across suites is a real divergence, not a test bug.
- **What's covered**: mortgage math (incl. zero-interest and month-end-closing day-boundary cases), all 8 insight rules, transaction filtering (every dimension in isolation, OR-within/AND-across, empty edges, UTC month boundary), split math (leftover-cent placement in canonical owner order, percent/value validation gates, lossless edit-seed round-trips), currency conversion in both directions for 7 currencies, dashboard month-picker derivation/stepping plus range availability (`availableRanges`, 11 cases: TS `availableRanges` in `web/components/dashboard/range.ts` ↔ Swift `DashboardRange.available`), and member reimbursement balances (expenses with `paid_by` + `transfer`-kind reimbursements netting to signed cents).
- **Insight `expected[]` entries carry `preview_merchants: string[]`** (feature 013): the recurring insight's 3-merchant preview, locking both ordering and casing — amount descending, case-insensitive name tie-break, casing taken from the newest transaction; `[]` on non-recurring insights. Two scenarios exist specifically for the ordering tie-break and casing drift. `generateInsights` also gained a trailing `locale` parameter — the generator and both parity suites pass the default `en-US`, keeping the vectors language-neutral.
- **What's NOT covered**: the CLI (`web/scripts/import/`) asserts against no vector — it reuses `computeShares`/`orderedOwnerIds`/`formatMoney` from `web/lib` directly but its own filtering/parsing can drift (documented in `PARITY.md`).

## 5. Key files

Read in this order:

1. `shared/test-vectors/README.md` — the contract, per-file schemas (for the original 4), timezone rules, regen and run instructions.
2. `web/scripts/gen-vectors.ts` — the single generator; defines every case for all 7 files and is the de-facto schema documentation for the 3 files the README omits. Heavily commented with the parity rationale (R1–R8 references).
3. `PARITY.md` (repo root) — the parity matrix mapping each capability → TS file → Swift file → vector file; §"How parity is enforced" is the operational summary.
4. `web/package.json` — `"gen:vectors": "tsx scripts/gen-vectors.ts"` and the Node engines constraint.
5. Web consumers (each mirrors one JSON): `web/test/mortgage.parity.test.ts`, `web/test/insights.parity.test.ts`, `web/test/transaction-filters.parity.test.ts`, `web/test/splits.parity.test.ts`, `web/test/currency.parity.test.ts`, `web/test/dashboard-month-scope.parity.test.ts`, `web/test/member-balance.parity.test.ts`.
6. iOS consumers: `iOS/Ortho-iOSTests/MortgageParityTests.swift`, `InsightParityTests.swift`, `TransactionFilterParityTests.swift`, `TransactionSplitParityTests.swift`, `CurrencyParityTests.swift`, `DashboardScopeParityTests.swift`, `MemberBalanceParityTests.swift`.
7. Vectored implementations — TS: `web/lib/finance/mortgage.ts`, `web/lib/finance/insights.ts`, `web/lib/finance/money.ts`, `web/lib/finance/currency.ts`, `web/lib/transactionFilters.ts`, `web/lib/splits.ts`, `web/lib/balances.ts`, `web/components/dashboard/range.ts`. Swift mirrors: `iOS/Ortho-iOS/Models/MortgageInfo.swift`, `Services/InsightEngine.swift`, `DesignSystem/Money.swift`, `Models/Currency.swift`, `Features/Transactions/TransactionFilters.swift`, `Features/Transactions/TransactionSplits.swift`, `Services/Balances.swift`, `Features/Dashboard/DashboardRange.swift`.
8. `iOS/Ortho-iOS.xcodeproj/project.pbxproj` — where the JSONs are referenced (`../shared/test-vectors/...`) and added to Copy Bundle Resources.

## 6. How to build / run / test

There is nothing to build in `shared/` itself — the JSONs are committed artifacts.

**Regenerate the vectors** (only when *intended* behavior changes):

```bash
cd web && npm install        # once
npm run gen:vectors          # writes ../shared/test-vectors/*.json + prints a count summary
```

**Run the web parity suite** (works on Linux; Node ≥ 20.19 or ≥ 22.12 required by Vitest 4):

```bash
cd web && npm test           # Vitest; parity tests are test/*.parity.test.ts
```

**Run the iOS parity suite** — **macOS-only** (XCTest cannot build off macOS; in a Linux sandbox you can only edit the Swift tests, never run them):

```bash
cd iOS && xcodebuild test -scheme Ortho-iOS
```

After any change to a vectored pure-logic function: regenerate, then run **both** suites so any Swift↔TS divergence surfaces. Regenerated diffs to the JSONs should be committed alongside the logic change.

## 7. Conventions & patterns

- **File shape**: `mortgage.json` and `insights.json` are top-level arrays of `{ input, expected }`; `transaction-filters.json` is `{ cases: [...] }`; `transaction-splits.json` is `{ cases, validations, seeds, ownerOrdering }`; `currency.json` is `{ toDisplay, toUsdCents }`; `dashboard-month-scope.json` is `{ availableMonths, availableRanges, monthReferenceDate, stepMonth }`; `member-balance.json` is `{ cases }`. Every case has a human-readable `name` used as the test name in both suites.
- **Pretty-printed JSON** (`JSON.stringify(..., null, 2)` + trailing newline) so diffs are reviewable.
- **Integer cents everywhere**; the only doubles are rates, percents, `equityFraction`, and display amounts — chosen so IEEE-754 arithmetic matches across TS and Swift.
- **Leftover-cent rule**: remainders go to the earliest owner in *canonical* order (`orderedOwnerIds` — the C1 contract); the `ownerOrdering` cases feed deliberately scrambled owner lists to lock this.
- **Half-open date windows** `[from, to)` for anything month-scoped.
- Cases exist specifically to pin historical bug classes; comments in `gen-vectors.ts` tag them (e.g. R6 recurring-average truncation, R7 month-end mortgage boundary and lossless split seeds, R8 outlier-id casing).

## 8. Gotchas

- **The harness is pinned to TZ=UTC** (since 2026-07-02, when the first iOS CI run caught
  timezone-dependent vectors). `gen-vectors.ts` and `vitest.config.ts` set `process.env.TZ = 'UTC'`,
  and `InsightParityTests.swift` passes an explicit UTC `Calendar` to the engine. Rationale: JS
  parses date-only strings (`"2026-06-01"`) as UTC midnight but the engines bucket months in the
  process timezone, so unpinned vectors encode the generating machine's timezone (day-1 rows fall
  into the previous month anywhere west of UTC). Keep all three pins in sync.
- **Never hand-edit the JSONs.** They are generated; hand edits will be silently reverted by the next `npm run gen:vectors`. Fix the TS implementation (or the case list in `gen-vectors.ts`) and regenerate.
- **Regeneration launders bugs.** Because expected values come from the TS implementation, regenerating after an *unintended* TS behavior change bakes the bug into the vectors — the web suite will pass and only the iOS suite will catch it (on macOS, which a Linux sandbox can't run). Treat vector diffs in review as behavior-change diffs.
- **iOS tests can't run in this (Linux) sandbox.** A change that regenerates vectors is only *half*-verified here; flag that the iOS XCTest run is pending on macOS.
- **The generator asserts nothing** — it just writes whatever the TS functions return. The safety net is running both suites afterward.
- **`shared/test-vectors/README.md` is stale for the 3 newer files** (currency, dashboard-month-scope, member-balance) and its "Running the suites" section describes the one-time Xcode setup as if pending — the pbxproj already wires all seven files. `gen-vectors.ts` and `PARITY.md` are more current.
- **Adding a new vector file** requires three touchpoints: a section + `writeFileSync` in `web/scripts/gen-vectors.ts`, a `web/test/<name>.parity.test.ts`, and an `iOS/Ortho-iOSTests/<Name>ParityTests.swift` **plus** pbxproj entries (a `PBXFileReference` with `path = "../shared/test-vectors/<file>.json"`, a `PBXBuildFile`, a group entry, and a Resources build-phase entry) — the pbxproj is hand-editable text, so this is doable from a Linux sandbox, and CI validates the result. Adding cases to an *existing* file needs none of the pbxproj work.
- **Node version**: Vitest 4 needs Node ≥ 20.19 / ≥ 22.12 (`require(ESM)`); older Node fails the web suite even though `tsx` itself may run.
- Vector transaction `date` strings intentionally sit **mid-month at 12:00Z** (except boundary-specific cases) so no local timezone can re-bucket them.

## 9. Cross-links

- **./web.md** — hosts both the generator (`web/scripts/gen-vectors.ts`, `npm run gen:vectors`) and the vectored TS implementations (`web/lib/*`, `web/components/dashboard/range.ts`) plus the Vitest parity suite.
- **./ios.md** — hosts the Swift mirrors and the XCTest parity suite; the pbxproj references these JSONs by relative path.
- **./supabase.md** — vector data models (Transaction/Budget/Property shapes, `paid_by`, `transfer` kind, category/kind enums) mirror the Postgres schema; the vectors themselves never touch the backend.
- **./makefile.md** — the Makefile does **not** cover vectors (it is ingest/tx CLI only); vector regen goes through `npm run gen:vectors` directly.
- `PARITY.md` (repo root) — the authoritative capability↔vector mapping and audit log.
