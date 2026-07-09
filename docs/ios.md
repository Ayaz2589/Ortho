# iOS App (`iOS/`) — FROZEN, historical reference

> **spec 021 (2026-07-09): `iOS/Ortho-iOS/` is retired.** It stays in the repository, unmodified,
> as a historical reference and rollback path — it receives **no new feature work**, is governed by
> neither the current design system nor the current testing discipline
> (`.specify/memory/constitution.md` v2.0.0 explicitly excludes it), and its CI
> (`.github/workflows/ios-ci.yml`) is manual-trigger-only, build-only. **iOS ships going forward
> from the web/TypeScript codebase wrapped natively via Capacitor** — see `./web.md` for the live
> iOS delivery mechanism (`web/ios/App/`) and the custom Scan plugin.
>
> **Read this document when:** you're doing archaeology on the frozen app (an emergency rollback,
> or understanding a UX/product decision this app pioneered), or **porting the original Swift
> source of the on-device scan pipeline** (`Services/Scan/*.swift`,
> `Features/Transactions/Scan/*.swift`) — the Capacitor Scan plugin
> (`web/ios/App/App/Plugins/Scan/`) is a port of exactly the code documented below. Everything else
> in this file describes a state of the product that is no longer current; do not use it to
> understand how Ortho works today.

## 1. Purpose (historical)

`iOS/` contains **Ortho-iOS**, the frozen SwiftUI client of Ortho — a calm, money-first household budgeting app for two people sharing a household. It *was* the canonical client until spec 021; the web app (`web/`) is now the sole canonical implementation, shipped to iOS via a Capacitor shell (see `./web.md`). Both this frozen app and the live web app talk to the **same Supabase backend** (`supabase/`, see `./supabase.md`); the golden-vector system described throughout this document (`shared/test-vectors/` — see `./shared.md`) locked this app's Swift mirrors against the TS originals while both were live and is now reframed as a web-only regression suite (see root `PARITY.md`).

Four destinations: **Dashboard** (month-scoped widgets + insights + budgets), **Transactions** (collapsible month sections over day-grouped activity, with splits, filters, settle-up), **Housing** (properties: primary home / multifamily / rental with mortgage + lease math), **Settings** (household people, cards, budgets, currency, language, appearance, sign-out).

> **Warning:** `iOS/ARCHITECTURE.md` is a detailed but **outdated** design doc from the pre-Supabase prototype era (it claims "no persistence, no backend, sample data seeded on launch"). Its rationale sections (design system, tab bar, dual-mode sheets, USD-cents choice) are still accurate; its data-layer and feature-status sections are not. Trust this doc and the source for anything involving Supabase, auth, People, budgets, insights, or the dashboard.

## 2. Stack & key dependencies

- **Swift 5 / SwiftUI**, `@Observable` (Observation framework) — no ViewModels, one root store.
- **Deployment target: iOS 26.2** (`iOS/Ortho-iOS.xcodeproj/project.pbxproj`, `IPHONEOS_DEPLOYMENT_TARGET = 26.2`).
- **One third-party SPM package: `supabase-swift`** (resolved at **2.46.0** per `iOS/build-device/SourcePackages/workspace-state.json`), from `https://github.com/supabase/supabase-swift`. Auth (email OTP), PostgREST CRUD, keychain session persistence.
- **Apple Charts** framework for the amortization bar chart (`Features/Housing/MortgageCards.swift`).
- **Self-hosted Lato fonts** (`iOS/Ortho-iOS/Fonts/*.ttf`, weights 300/400/700/900) registered at runtime via `CTFontManagerRegisterFontsForURL` in `DesignSystem/AppFont.swift` — no Info.plist `UIAppFonts` entry.
- One non-Supabase network call: `https://www.floatrates.com/daily/usd.json` for live FX rates (no key, cached 24h in `UserDefaults`).
- Xcode project uses **`PBXFileSystemSynchronizedRootGroup`** (objectVersion 77): any file dropped under `iOS/Ortho-iOS/` is automatically part of the target — **no `project.pbxproj` edits needed to add files**.

## 3. Directory map

```
iOS/
├── ARCHITECTURE.md                  # OUTDATED pre-Supabase design doc (rationales still useful)
├── Tasks.md                         # lightweight kanban of backend-integration work (mostly done)
├── Ortho-iOS.xcodeproj/             # objectVersion 77, filesystem-synchronized groups
├── Ortho-iOS/
│   ├── Ortho_iOSApp.swift           # @main; auth gate (launching/signedIn/signedOut); locale + appearance
│   ├── App/
│   │   ├── AppState.swift           # @Observable root store — ALL domain state, auth, FX, optimistic CRUD
│   │   ├── RootTabView.swift        # custom tab shell + OrthoTabBar + HideTabBarPreferenceKey + dataError alert
│   │   ├── SupabaseConfig.swift     # GITIGNORED — real project URL + publishable key
│   │   └── SupabaseConfig.swift.template  # copy → SupabaseConfig.swift, fill in values
│   ├── Models/                      # pure value types mirroring Postgres rows (snake_case CodingKeys)
│   │   ├── Transaction.swift        # USD cents Int64; kind expense|income|transfer; ownerIDs; shares; paidBy
│   │   ├── Person.swift             # household_people row — name-only member, soft-remove, linkedUserID
│   │   ├── User.swift, Household.swift, Card.swift, Budget.swift, Role.swift
│   │   ├── TransactionCategory.swift, TransactionGroup.swift, Currency.swift, Insight.swift
│   │   └── Property.swift, MortgageInfo.swift, LeaseInfo.swift, Unit.swift, RentalPayment.swift
│   ├── Services/                    # Supabase per-table APIs + pure engines
│   │   ├── SupabaseAPI.swift        # SupabaseAPIError, SupabaseCoding date strategies, dateOnly formatter
│   │   ├── TransactionsAPI.swift    # transactions + transaction_shares glue; Lenient enum decode; compensating writes
│   │   ├── HouseholdsAPI.swift      # findOrCreate household, people CRUD, ensureAccountPerson
│   │   ├── CardsAPI.swift, PropertiesAPI.swift, RentalPaymentsAPI.swift, BudgetsAPI.swift
│   │   ├── Balances.swift           # balanceBetween — settle-up math, golden-vector-locked (spec 012)
│   │   ├── InsightEngine.swift      # pure 8-rule recommendation engine, golden-vector-locked
│   │   ├── Localizer.swift          # locale bridge for non-view formatters
│   │   ├── Scan/                    # spec 014 — on-device receipt/statement scanning (pure pipeline)
│   │   │   ├── ScanModels.swift         # ScanDocumentText / ParsedCandidate / ScanParseResult / ScanContext
│   │   │   ├── ScanTextExtractor.swift  # Vision structured OCR (+ line-cluster fallback) & PDFKit text layer
│   │   │   ├── ScanHeuristics.swift     # regex totals/dates/amounts; CLI-ported category/exclusion tables
│   │   │   ├── ScanParser.swift         # receipt-vs-statement detection (R5) → candidates; deterministic
│   │   │   ├── ScanInference.swift      # history-first category/owners guesses + duplicate claiming
│   │   │   └── ScanRefiner.swift        # optional FoundationModels merchant cleanup (availability-gated)
│   │   └── LegacyImporter.swift, TDBankMay2026Importer.swift   # DEBUG-only one-shot seeders
│   ├── Config/                      # spec 015 test-build gating: FeatureFlags.swift, TestBuild.swift
│   ├── DesignSystem/
│   │   ├── AppTheme.swift           # color tokens (bg/surface/text/text2/text3/hairline/accent/positive/destructive)
│   │   ├── AppFont.swift            # Lato; size-driven weight (≥24pt → Light, else Regular); Font.lato(size:)
│   │   ├── Money.swift              # golden-vector-locked cents→display formatter, toUSDCents/toDisplayAmount
│   │   ├── Palette.swift            # OrthoColorOption — 6 muted avatar swatches
│   │   ├── AppLanguage.swift        # system/en/bn/es/ja/zh/ko; bn uses latn digits
│   │   ├── AppearanceMode.swift, Density.swift, DateFormatters.swift
│   ├── Components/                  # reusable views: UserAvatarView, StackedAvatarsView, DayHeader,
│   │                                # RowSeparator, SearchField, LaunchView, BootstrapRecoveryView,
│   │                                # AmbientRippleBackground (sign-in rings)
│   ├── Features/
│   │   ├── Auth/SignInView.swift            # two-step email → 8-digit OTP
│   │   ├── Dashboard/                       # DashboardView + DashboardRange.swift (vector-locked month scope)
│   │   │   ├── MonthPicker.swift            # specific-month override (spec 011)
│   │   │   └── Widgets/                     # MonthSummary, SpendByCategory, PerOwnerBreakdown, TopMerchants,
│   │   │                                    # DailySpendTrend, BudgetProgress, HousingSnapshot cards
│   │   ├── Transactions/                    # TransactionsView, TransactionRow, Add/Detail/Filter/CopyPicker sheets,
│   │   │   ├── TransactionSplits.swift      # vector-locked split math (spec 007) — mirror of web/lib/splits.ts
│   │   │   ├── TransactionFilters.swift     # vector-locked filtering (spec 006) — mirror of web/lib/transactionFilters.ts
│   │   │   └── Scan/                        # spec 014 — scan UI: ScanSession state machine, the custom AVFoundation scan
│   │   │                                    # camera (`ScanCameraView`, in `ScanCaptureView.swift`), statement interstitial + summary (wizard chrome lives
│   │   │                                    # in AddTransactionSheet as its fourth prefill source)
│   │   ├── Housing/                         # HousingView (count-aware), PropertyDetail/Content, Add sheets,
│   │   │                                    # MortgageCards, MultifamilyCards, RentalCards
│   │   ├── Insights/                        # InsightCard + InsightsCardStack (renders InsightEngine output)
│   │   ├── Budgets/                         # BudgetsView + EditBudgetSheet
│   │   └── Settings/                        # SettingsView, HouseholdView, user/card rows + sheets, appearance/language
│   ├── Localizable.xcstrings        # string catalog, fully translated for en/bn/es/ja/zh/ko (coverage locked by a web Vitest suite)
│   ├── Fonts/                       # Lato-Light/Regular/Bold/Black.ttf
│   └── Resources/legacy-import.json # GITIGNORED personal data for DEBUG LegacyImporter
├── Ortho-iOSTests/                  # 13 files: 11 golden-vector parity suites + FeatureFlags + ScanParser
│   ├── CurrencyParityTests, CurrencyNameParityTests, CurrencySymbolParityTests, TransactionSplitParityTests,
│   ├── TransactionFilterParityTests, InsightParityTests, MortgageParityTests, MemberBalanceParityTests,
│   ├── DashboardScopeParityTests, HousingNetRentalParityTests, LeaseParityTests,   # ← 11 vector suites
│   └── FeatureFlagsTests.swift, ScanParserTests.swift                              # spec 015 / spec 014
├── build/, build-device/, temp/     # local build artifacts + scratch (gitignored)
└── .claude/settings.json            # allows Bash(xcodebuild *)
```

## 4. Architecture

### App shell & navigation

- `Ortho_iOSApp.swift` (@main) is the **auth gate**: it switches on `appState.authPhase` — `.launching` → `LaunchView` (neutral, prevents sign-in-screen flash), `.signedIn` → `RootTabView` (or `BootstrapRecoveryView` when `bootstrapDidFail`), `.signedOut` → `SignInView`. It also installs `AppState` into the environment, applies the appearance (`@AppStorage("appearance")`) and language (`@AppStorage("language")` → `\.locale` + `Localizer.currentLocale`).
- `App/RootTabView.swift` is a **custom tab shell**, not SwiftUI `TabView`: a `ZStack` switches between the four tab bodies; `OrthoTabBar` is rendered via `.safeAreaInset(edge: .bottom)`. Pushed detail screens (property detail, household editor) hide the bar with `.hidesTabBar()`, a Bool `PreferenceKey` (`HideTabBarPreferenceKey`) that OR-folds up the tree. `RootTabView` also owns the single global error alert ("Something didn't save") bound to `appState.dataError`.
- There is no NavigationStack-based deep routing; sheets (`.sheet`) drive add/edit flows, and Housing/Settings push detail views inside their own stacks.

### State: one `@Observable` store

`App/AppState.swift` (~1,360 lines) is the single source of truth. Views read it via `@Environment(AppState.self)`; per-screen UI state stays as local `@State`. It owns:

- **Domain collections**: `users`, `people` (household members as `Person`), `transactions`, `cards`, `households`, `properties`, `rentalPayments`, `budgets` — all populated **only from Supabase after sign-in** (the app launches with empty collections; sample data only exists for previews/tests).
- **Auth**: `session`, `authPhase`, `pendingSignInEmail`, `authError`, `bootstrapDidFail`, `isLoadingInitialData`.
- **Preferences persisted in `UserDefaults`**: `currentUserID`, `currentHouseholdID`, `currency`, `dashboardRange`, FX-rate cache. Appearance/language persist separately via `@AppStorage`.
- **Derived aggregations** used by the Dashboard: `monthlyIncome/Expenses`, `incomeTotal/expenseTotal(in:)`, `spent(by:in:)`, `dailyExpenseCents`, `categoryExpenseTotal`, `topCategoriesByExpense`, `topMerchantsByExpense`, `memberBalances`, `activeInterval` / `dashboardReferenceDate` (month-scope logic, vector-locked). All month windows are **half-open `[start, end)`** to match web.

### Auth flow (email OTP)

1. `SignInView` step 1 → `AppState.requestSignInCode(email:)` → `supabase.auth.signInWithOTP`.
2. Step 2 → `verifyCode(email:code:)` → `supabase.auth.verifyOTP(type: .email)` with the **8-digit** emailed code. The SDK persists the session in the Keychain.
3. `observeAuthChanges()` (started from a `.task` in `Ortho_iOSApp`) consumes `supabase.auth.authStateChanges`; the first emission doubles as launch-time session restore. An **expired-but-refreshable session is refreshed, not dropped** (`resolveAuth`).
4. On sign-in, `ensureCurrentUser` (one-shot per auth ID via `bootstrappedAuthID`) kicks off `bootstrapUserSession`: (a) upsert `public.users` (needed by the `transactions.created_by` FK), (b) `HouseholdsAPI.findOrCreate` the default household, (c) reset in-memory data, (d) `loadAllFromServer()` — a parallel `withTaskGroup` fetching people, transactions, cards, properties, rental payments, budgets. Failure sets `bootstrapDidFail` → `BootstrapRecoveryView` with Retry (`retryBootstrap()`).
5. `signOut()` tears down every collection and the household selection regardless of network result. **No single-active-platform lock** — iOS and web sessions coexist (feature `010`); the 30-day cap is Supabase's server-side session timebox.

### Test-build feature flags (spec 015)

A **Feature flags** section in `SettingsView` exposes two toggles — **Use test data** and **Bypass auth** — that let a tester exercise the app on a disposable in-memory dataset without ever writing to the live shared backend.
- **Gating:** the section renders only when `Config/TestBuild.isTestBuild` is true — `#if DEBUG` OR a TestFlight `sandboxReceipt` — so it shows on DEBUG + TestFlight and is inert in an App Store release. `Config/FeatureFlags` reads the `@AppStorage` keys `ff_useTestData` / `ff_bypassAuth` but **force-returns `false` off a test build**, so a value written on a Debug/TestFlight install can never flip behavior in App Store (FR-003; injectable `isTestBuild`/`defaults` for tests).
- **Seeding + auth:** `Ortho_iOSApp.useSeededData` = `isUIDemo || FeatureFlags.effectiveUseTestData()` (bypass implies test data). When true it constructs `AppState(testDataEnabled: true)` (sample-seeded), renders `RootTabView` directly, and **skips `observeAuthChanges()`** — no auth, no server traffic. Flags apply at launch (relaunch to apply, like `-uiDemo`).
- **Isolation:** `AppState.testDataEnabled` guards the network `Task` in *every* optimistic mutator and early-returns `loadAllFromServer`, so test-mode reads/writes stay local (this also fixes the old `-uiDemo` "adds a row that deletes itself" bug). The refreshed sample dataset (`Person.sample`, modernized `Transaction.sample` with `paidBy` + a `.transfer` + a ~3-month span, `Budget.sample`, `RentalPayment.sample` + a rental `Property.sample`) is Person-keyed so balances/splits resolve. Covered by `Ortho-iOSTests/FeatureFlagsTests.swift`. Outside the golden-vector harness (PARITY.md).

### Data layer (Supabase)

- The `SupabaseClient` is created once in `AppState.init` from `App/SupabaseConfig.swift` (**gitignored**; copy `SupabaseConfig.swift.template` and fill in the project URL + publishable key — RLS, not key secrecy, protects data).
- Each table gets a thin stateless struct in `Services/` (`TransactionsAPI`, `CardsAPI`, `HouseholdsAPI`, `PropertiesAPI`, `RentalPaymentsAPI`, `BudgetsAPI`), constructed on demand as a computed property on `AppState` (allocation-free wrappers over the client). DTO structs declare explicit **snake_case `CodingKeys`** matching Postgres columns and are kept `private` to each API file.
- **Reads rely on RLS**: `fetch()` calls have no client-side user filter — Postgres row-level security returns exactly the signed-in user's personal rows plus their households' shared rows.
- **Writes are optimistic with rollback**: every `AppState` mutator (add/update/delete for transactions, cards, properties, rental payments, budgets, people, household rename) mutates the local array first, then syncs in a `Task`; on error it restores the snapshot and sets `dataError` (surfaced by the RootTabView alert).
- **Transactions are two tables**: `TransactionsAPI` splits a Swift `Transaction` into a `transactions` parent row plus N `transaction_shares` rows (one cents-share per owner), and joins them back in `rehydrate`. Since there's no RPC yet, it does **compensating writes**: `create` deletes the orphaned parent if the shares insert fails; `update` re-inserts the *previous* shares if the new-shares insert fails. Deletes cascade via the FK.
- **Forward-compatible decoding**: `Lenient<T>` (in `TransactionsAPI.swift`) decodes unknown enum raw values (a future `kind`/`category`) to `.unknown` instead of throwing, and `rehydrate` drops just that row — one unknown row no longer empties the whole list.
- **Dates**: `SupabaseCoding` handles `timestamptz` (ISO-8601 ± fractional seconds) and `date` (`yyyy-MM-dd`) columns; `SupabaseDateFormatters.dateOnly` is locked to `en_US_POSIX` in the **local** timezone (since 2026-07-02 — date-only columns are calendar days; UTC parsing shifted them a day west of UTC) and must never follow the in-app locale.

### Domain model highlights

- `Transaction` (`Models/Transaction.swift`): `amount: Int64` **USD cents, always ≥ 0** (direction from `kind: expense | income | transfer`); `ownerIDs: Set<Person.ID>` + `shares: [Person.ID: Int64]` materialized from `transaction_shares`; `householdID == nil` ⇒ personal scope; `createdBy` (auth UUID, drives RLS); `paidBy` — for an expense, who fronted the money (defaults to the current person on add); for a **transfer** (reimbursement/settle-up, spec `012`), the sender, with the single owner being the recipient. `effectiveShares` falls back to an even split over the canonical `orderedOwnerIds` order.
- `Person` (`Models/Person.swift`): household member from `household_people` — name-only people need no Ortho account (`linkedUserID` nil); the account holder is linked to `auth.uid()`. Soft-removed via `removedAt` so history keeps resolving names. `AppState.user(_:)` resolves owner IDs through `people` first, then `users`, then `User.placeholder`.
- Housing: `Property` (`kind: primaryHome | multifamily | rental`) uses optional-field discrimination (`mortgage`, `lease`, `units`); `MortgageInfo` carries all amortization math as pure functions (vector-locked); `LeaseInfo` computes renewal/due-day helpers; `RentalPayment` logs rent received. **Net rental** is `Property.occupiedMonthlyRentCents` / `netMonthlyBalanceCents` → the shared `HousingMath` enum (occupied-only rent − mortgage payment), mirrored by web `lib/finance/housing.ts` and vector-locked by `housing-net-rental.json` (spec 019). The Dashboard `HousingSnapshotCard` and the property-detail `MultifamilyNetBalanceCard` both read this one figure — vacant units (no tenant name) contribute zero. Date-only columns (`closing_date`, `lease_start/end`, payment `date`) decode as **local** calendar days via the `.current`-timezone `dateOnly` decoder.
- `Currency`: 7 cases (usd/cad/gbp/eur/jpy/cny/bdt) with fallback rates; display conversion at render time via `Money` + live FX.

### Parity core (mirrored from web, vector-locked)

These files are line-for-line semantic mirrors of `web/lib/*` / `web/components/dashboard/range.ts`, asserted against `shared/test-vectors/*.json` by `Ortho-iOSTests`:

| iOS file | Web mirror | Vector file |
|---|---|---|
| `DesignSystem/Money.swift` + `Models/Currency.swift` | `lib/finance/money.ts` + `currency.ts` | `currency.json` |
| `Features/Transactions/TransactionSplits.swift` | `lib/splits.ts` | `transaction-splits.json` |
| `Features/Transactions/TransactionFilters.swift` | `lib/transactionFilters.ts` | `transaction-filters.json` |
| `Services/Balances.swift` | `lib/balances.ts` | `member-balance.json` |
| `Services/InsightEngine.swift` | `lib/finance/insights.ts` | `insights.json` |
| `Models/MortgageInfo.swift` | `lib/finance/mortgage.ts` | `mortgage.json` |
| `Features/Dashboard/DashboardRange.swift` | `components/dashboard/range.ts` | `dashboard-month-scope.json` |
| `Models/Property.swift` (`HousingMath`) | `lib/finance/housing.ts` | `housing-net-rental.json` (spec 019) |
| `Models/Currency.swift` + `DesignSystem/Money.swift` | `lib/finance/currency.ts` + `money.ts` | `currency-names.json` / `currency-symbols.json` (spec 020) |
| `Models/LeaseInfo.swift` | `components/housing/lease.ts` | `lease.json` (spec 020) |

The split math deliberately uses `Double` (IEEE-754, identical to TS `number`) so the two implementations cannot diverge; leftover cents land on the same owner via `orderedOwnerIds` (ascending UUID-string sort).

Two additions from spec 013: `DashboardRange.available(for:now:calendar:)` is the pure, vectored mirror of the TS `availableRanges` (`AppState` delegates to it), locked by the `availableRanges` section of `dashboard-month-scope.json`; and `Insight.previewMerchants` plus the InsightEngine's recurring 3-merchant preview tie-break are locked via `preview_merchants` in `insights.json`.

### Design system

- `AppTheme` (`DesignSystem/AppTheme.swift`): warm, muted light/dark token pairs via a `Color(light:dark:)` UITraitCollection helper. Tokens: `bg`, `surface`, `text`, derived `text2/text3/hairline` (opacity 0.58/0.36/0.07), `accent` (sand/tan), `positive` (sage), `destructive` (muted brick). **Loss/cost is never red** — constitution rule.
- Typography: `Font.lato(size:weight:)` — the `weight:` is ignored; family is picked by size (**≥ 24pt → Lato-Light**, below → Lato-Regular). Money is the headline; negative money uses **U+2212** (minus sign), not a hyphen.
- `Palette.swift`: six muted avatar swatches (`peach, slate, sage, terracotta, mauve, sand`) — do not add saturated colors.
- Localization: string catalog `Localizable.xcstrings` (en/bn/es/ja/zh/ko), **fully translated in all six languages** since spec 013; symbol/numeral keys and DEBUG-only strings carry `shouldTranslate: false`. A web Vitest suite (`web/test/i18n/catalog-parity.test.ts`) locks catalog coverage and shared-key identity against the web catalogs — iOS translators must keep shared keys byte-identical to `web/lib/i18n/*` (placeholder-converted). `AppLanguage` self-names languages in the picker; Bangla forces Latin digits (`bn_BD@numbers=latn`). `Services/Localizer.swift` bridges the in-app locale to imperative formatters (Money, InsightEngine, TransactionGroup) that SwiftUI's `\.locale` doesn't reach.
- Money renders always use `.lineLimit(1)` + `.minimumScaleFactor` to avoid truncating cents.

## 5. Key files (read first)

1. `iOS/Ortho-iOS/App/AppState.swift` — the whole app's state, auth lifecycle, bootstrap, optimistic CRUD, dashboard aggregations.
2. `iOS/Ortho-iOS/Ortho_iOSApp.swift` — auth gate, locale/appearance plumbing, entry point.
3. `iOS/Ortho-iOS/App/RootTabView.swift` — tab shell, custom tab bar, global error alert, tab-bar-hiding mechanism.
4. `iOS/Ortho-iOS/Services/TransactionsAPI.swift` — the transactions⇄shares glue, `Lenient` decoding, compensating writes.
5. `iOS/Ortho-iOS/Services/SupabaseAPI.swift` — shared error type + date coding strategies for all APIs.
6. `iOS/Ortho-iOS/Services/HouseholdsAPI.swift` — household find-or-create + People CRUD used by bootstrap.
7. `iOS/Ortho-iOS/Models/Transaction.swift` — the central domain type and its invariants.
8. `iOS/Ortho-iOS/Models/Person.swift` — the owner model (`household_people`), soft-remove semantics.
9. `iOS/Ortho-iOS/Features/Transactions/TransactionSplits.swift` — canonical split math + `orderedOwnerIds`.
10. `iOS/Ortho-iOS/Services/Balances.swift` — settle-up math (`balanceBetween`), spec 012.
11. `iOS/Ortho-iOS/Features/Dashboard/DashboardRange.swift` — month-scope logic, spec 011.
12. `iOS/Ortho-iOS/DesignSystem/Money.swift` + `AppTheme.swift` + `AppFont.swift` — the design-system trio every view uses.
13. `iOS/Ortho-iOS/Features/Transactions/TransactionsView.swift` — the flagship screen (grouping, search, filters, sheets).
14. `iOS/Ortho-iOS/Features/Auth/SignInView.swift` — the OTP flow UI.
15. `iOS/Ortho-iOSTests/TransactionSplitParityTests.swift` — pattern for how golden vectors are loaded (test bundle resources) and asserted.
16. `iOS/Ortho-iOS/App/SupabaseConfig.swift.template` — required local config.
17. `/PARITY.md` (repo root) — the audited cross-surface parity matrix; the authoritative "how iOS relates to web/CLI" reference.

## 6. How to build / run / test

**Everything here is macOS-only (requires Xcode + an iOS Simulator). A Linux dev sandbox cannot build, run, or test this target** — you can still read/edit Swift sources and reason about parity via `shared/test-vectors/`, but verification must happen on a Mac.

**From a Linux sandbox, the feedback loop is CI** (`.github/workflows/ios-ci.yml`): every push
touching `iOS/**` or `shared/test-vectors/**` compiles the app, runs the XCTest parity suites,
and uploads a `simulator-screenshots` artifact — a per-language matrix of the app booted in the
simulator: **en on all four tabs, dashboard + settings in each of bn/es/ja/zh-Hans/ko, and all
four tabs in bn + ja**, with files named `<lang>-<tab>.png`. Watch with
`GH_TOKEN=placeholder gh run watch --exit-status`; download artifacts via
`gh api repos/<owner>/<repo>/actions/artifacts/<id>/zip` (`gh run download` can refuse with a
path-traversal error). A second workflow, `.github/workflows/ios-deploy.yml`, is the
**dispatch-only TestFlight deploy** — it never runs automatically; see `./deploy.md`.

**UI-demo mode (DEBUG only):** launch argument `-uiDemo` boots straight into the tab shell on the
built-in sample data — no auth, no server traffic; `-uiDemoTab <dashboard|transactions|housing|settings>`
picks the starting tab, and `-uiDemoLanguage <code>` forces the app language (accepts `AppLanguage`
raw values plus `"zh-Hans"`; defined in `Ortho_iOSApp.swift`, riding the same environment-locale
path as the in-app language picker). This is what CI screenshots; locally, add the arguments under
Product → Scheme → Edit Scheme → Run → Arguments. Compiled out of release builds
(`Ortho_iOSApp.isUIDemo`, `RootTabView.selection`).

**Scan demo (spec 014):** `-uiDemoScan <fixture>` (implies `-uiDemo`) feeds a bundled fixture from
`Resources/ScanFixtures/` through the REAL extract→parse→infer pipeline against the demo store
(seeded with anchor rows so duplicate detection fires) and opens the Transactions add sheet on the
result — a receipt fixture prefills the form, a statement fixture lands on the interstitial;
`-uiDemoScanStep <interstitial|row|summary>` advances the statement flow for screenshots. The
Foundation-Models refiner is disabled here so shots are deterministic. The same fixtures are
asserted field-by-field by `Ortho-iOSTests/ScanParserTests.swift` against their
`<name>.expected.json` (loaded from the APP bundle — no test-target pbxproj resources). CI
screenshots the scan flow per language as `<lang>-scan-<receipt|interstitial|row|summary|fallback>.png`.

Prerequisite: create the gitignored config once:

```sh
cp iOS/Ortho-iOS/App/SupabaseConfig.swift.template iOS/Ortho-iOS/App/SupabaseConfig.swift
# fill in projectURL + publishableKey from Supabase Project Settings → API
```

Build:

```sh
cd iOS
xcodebuild -project Ortho-iOS.xcodeproj -scheme Ortho-iOS \
  -destination 'generic/platform=iOS Simulator' -configuration Debug build
```

Test (13 test files — 11 golden-vector parity suites + FeatureFlags + ScanParser; validated on macOS CI):

```sh
cd iOS
xcodebuild test -project Ortho-iOS.xcodeproj -scheme Ortho-iOS \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO -quiet
```

(Commands from `specs/008-parity-remediation/quickstart.md`; later specs' quickstarts use the same invocation.) In Xcode, `⌘R` runs on the iPhone 17 / iOS 26.2 simulator. Running the app requires a real Supabase project and a sign-in (email OTP) — there is no offline/sample mode in release paths; DEBUG builds have a Developer section in Settings ("Sync all from server", legacy importers).

There are **no Makefile targets for iOS** — the root `Makefile` only wraps the web CLI (see `./makefile.md`).

## 7. Conventions & patterns

- **All money is `Int64` USD cents**, non-negative; direction comes from `kind`; conversion to the display currency happens only at render time via `AppState.formatMoney` → `Money.string`.
- **Optimistic write + snapshot rollback + `dataError`** is the mandatory shape for every new mutator on `AppState`; the RootTabView alert is the single presenter.
- **One API struct per table**, stateless, private snake_case DTOs, constructed on demand from `AppState.supabase`. New enums crossing the wire should be wrapped in `Lenient` on read.
- **No ViewModels, no Combine**: `@Environment(AppState.self)` for domain state, local `@State` for screen state.
- Pure, mirrored finance logic gets: a file-header comment naming the web mirror + vector file + spec, `Double` where TS uses `number`, and a parity test in `Ortho-iOSTests`.
- Dual-mode sheets (`AddTransactionSheet`, `AddPropertySheet`) handle both add and edit via an `editing:` parameter.
- Design constitution (`.specify/memory/constitution.md`): calm over dense; hairlines over borders; loss is never red; no saturated palette additions; Lato only, size-driven weight; U+2212 for negative money.
- Comments only where the *why* is non-obvious; files otherwise self-documenting.
- User-visible strings go through the string catalog; non-view formatters read `Localizer.currentLocale`, never `Locale.current` (except the Supabase wire formatters, which must stay `en_US_POSIX`).

## 8. Gotchas

- **`iOS/ARCHITECTURE.md` is stale** — it describes the pre-Supabase prototype (sample data, no auth, no Services folder). Do not treat its "current state" or "known gaps" sections as truth.
- **The app won't compile without `App/SupabaseConfig.swift`** (gitignored). Copy the `.template` first. Never put the service-role key there.
- **Adding a file needs no pbxproj edit** (filesystem-synchronized groups) — but adding a *test vector* does need it in the test target's **Copy Bundle Resources**; every parity test loads via `Bundle(for:).url(forResource:)` and fails with an explicit message if missing.
- **Golden vectors are generated from web** (`npm run gen-vectors` in `web/`); iOS only *asserts* them. If a parity test fails after a web change, regenerate vectors and mirror the Swift logic — never hand-edit the JSON to make iOS pass.
- **A single unknown `kind`/`category` used to empty the entire transaction list** — fixed by `Lenient`; preserve that pattern when adding decoded enums (commit `3dee57d`).
- **Half-open month intervals `[start, end)` everywhere** — `DateInterval.contains` is closed and will double-count boundary transactions; don't use it for month math.
- **`SupabaseDateFormatters` must stay `en_US_POSIX`/UTC**; routing them through `Localizer` breaks the `yyyy-MM-dd` wire round-trip with Postgres `date` columns.
- **Bootstrap is one-shot per auth ID** (`bootstrappedAuthID`) because auth events re-fire on token refresh; a failed bootstrap clears the marker so relaunch/Retry re-runs it.
- Transfer rows (`kind == .transfer`) are excluded from every spend/income aggregate and have inverted ownership semantics (`paidBy` = sender, single owner = recipient); a share-less transfer is kept owner-less rather than falling back to "creator owns all" (see `rehydrate`).
- `iOS/build/`, `iOS/build-device/`, `iOS/temp/`, and `Resources/legacy-import.json` are gitignored local artifacts / personal financial data — never commit or rely on them.
- FX rates come from floatrates.com with hardcoded fallbacks; rates refresh at most once per launch when the 24h cache is stale (no foreground refresh).
- `LegacyImporter` / `TDBankMay2026Importer` are DEBUG-only one-shot seeders scheduled for deletion — don't build on them.
- **Scan (spec 014) is deliberately forgiving on real-world captures** (post-T037/T041
  device feedback, 2026-07-03): after one-line statement rows (`MM/DD`, month-name, or
  description-first joins), STACKED app-list rows reconstruct a photographed banking
  app/website (each transaction spread over 2–3 OCR lines with its own bare-date line;
  this tier outranks the grand total so a "Total balance" header can't collapse a list
  into one receipt). Then: labeled grand total → receipt; any money-shaped text →
  best-effort prefill with merchant/amount/date ALL tagged Guessed. Only truly
  money-free text shows "Couldn't read this", and on capable hardware
  `ScanRefiner.rescue` first hands the raw OCR text to on-device Foundation Models
  (never in fixtures or `-uiDemoScan`). In DEBUG builds the failure state grows a
  "What the scan read" disclosure (plus an os_log line, category `scan`) so a failing
  photo can be debugged on the device and turned into a fixture. Remember: synthetic
  fixtures passing in CI ≠ real photos working — lock any new real-world shape with a
  fixture (`statement-screenshot`, `receipt-no-total`, `statement-app-list`).
- **The scan camera is a custom AVFoundation view** (`ScanCameraView`, post-T041 — the
  VisionKit document camera auto-fired before users lined up the shot): the shutter
  enables only when live fast-OCR sees readable text, auto-capture needs ~2.5 s of
  sustained readability, and captures are deskewed via document segmentation. One
  capture per camera session; multi-page statements go through the PDF/file source.
  - **Gotcha — the live-OCR frame must be oriented.** `AVCaptureVideoDataOutput`
    delivers sensor-native *landscape* buffers, so a portrait-held receipt's text is
    sideways to `VNRecognizeText`; without a `CGImagePropertyOrientation` it finds no
    lines and the shutter **never arms**. The gate feeds the handler an orientation
    derived from the **interface** orientation (`.portrait → .right`), not the
    accelerometer/`RotationCoordinator` horizon angle — interface orientation stays
    upright-stable when the phone lies flat over a receipt (the primary posture),
    where gravity's roll is ambiguous. Captured once at open; a mid-session rotation
    keeps the launch orientation. The photo path is separate (EXIF + `orientationNormalized`).

## 9. Cross-links

- **`./supabase.md`** — the schema this app writes to: `users`, `households`, `household_members`, `household_people`, `transactions`, `transaction_shares`, `cards`, `budgets`, `properties` (+ housing sub-tables), `rental_payments`; RLS policies; migrations under `supabase/migrations/`.
- **`./web.md`** — the sibling client; every vector-locked iOS file has a named TS mirror there; UI decisions carry over per the `ortho-web` skill.
- **`./shared.md`** — `shared/test-vectors/*.json`, the parity contract both test suites assert.
- **`./makefile.md`** — CLI import/CRUD tooling (web-side only; shares the same tables but not the vector harness).
- Repo root `PARITY.md` — the audited capability-by-capability parity matrix and known divergences.
- `specs/` mapping: `002` (golden-vector approach) · `006` → `TransactionFilters.swift` · `007` → `TransactionSplits.swift` · `008`/`009` (parity remediation: test target, vectors in bundle, auth/session fixes) · `010` (platform lock removed; concurrent sessions) · `011` → `DashboardRange.swift` + `MonthPicker.swift` · `012` → `Balances.swift`, `Transaction.paidBy`, the `transfer` kind, settle-up UI. (`001`, `003`, `004`, `005` are web/CLI-only.)
