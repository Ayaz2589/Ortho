# iOS App (`iOS/`)

## 1. Purpose

`iOS/` contains **Ortho-iOS**, the canonical SwiftUI client of Ortho — a calm, money-first household budgeting app for two people sharing a household. The iOS app defines the product; the web app (`web/`) is the same product re-expressed for desktop (see `./web.md`). Both clients talk to the **same Supabase backend** (`supabase/`, see `./supabase.md`) and keep their pure finance logic in lockstep via shared golden test vectors in `shared/test-vectors/` (see `./shared.md`).

Four destinations: **Dashboard** (month-scoped widgets + insights + budgets), **Transactions** (day-grouped activity with splits, filters, settle-up), **Housing** (properties: primary home / multifamily / rental with mortgage + lease math), **Settings** (household people, cards, budgets, currency, language, appearance, sign-out).

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
│   │   └── LegacyImporter.swift, TDBankMay2026Importer.swift   # DEBUG-only one-shot seeders
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
│   │   │   └── TransactionFilters.swift     # vector-locked filtering (spec 006) — mirror of web/lib/transactionFilters.ts
│   │   ├── Housing/                         # HousingView (count-aware), PropertyDetail/Content, Add sheets,
│   │   │                                    # MortgageCards, MultifamilyCards, RentalCards
│   │   ├── Insights/                        # InsightCard + InsightsCardStack (renders InsightEngine output)
│   │   ├── Budgets/                         # BudgetsView + EditBudgetSheet
│   │   └── Settings/                        # SettingsView, HouseholdView, user/card rows + sheets, appearance/language
│   ├── Localizable.xcstrings        # string catalog for en/bn/es/ja/zh/ko
│   ├── Fonts/                       # Lato-Light/Regular/Bold/Black.ttf
│   └── Resources/legacy-import.json # GITIGNORED personal data for DEBUG LegacyImporter
├── Ortho-iOSTests/                  # 7 parity suites asserting shared/test-vectors/*.json
│   ├── CurrencyParityTests.swift, TransactionSplitParityTests.swift, TransactionFilterParityTests.swift,
│   ├── InsightParityTests.swift, MortgageParityTests.swift, MemberBalanceParityTests.swift,
│   └── DashboardScopeParityTests.swift
├── build/, build-device/, temp/     # local build artifacts + scratch (gitignored)
└── .claude/settings.json            # allows Bash(xcodebuild *)
```

## 4. Architecture

### App shell & navigation

- `Ortho_iOSApp.swift` (@main) is the **auth gate**: it switches on `appState.authPhase` — `.launching` → `LaunchView` (neutral, prevents sign-in-screen flash), `.signedIn` → `RootTabView` (or `BootstrapRecoveryView` when `bootstrapDidFail`), `.signedOut` → `SignInView`. It also installs `AppState` into the environment, applies the appearance (`@AppStorage("appearance")`) and language (`@AppStorage("language")` → `\.locale` + `Localizer.currentLocale`).
- `App/RootTabView.swift` is a **custom tab shell**, not SwiftUI `TabView`: a `ZStack` switches between the four tab bodies; `OrthoTabBar` is rendered via `.safeAreaInset(edge: .bottom)`. Pushed detail screens (property detail, household editor) hide the bar with `.hidesTabBar()`, a Bool `PreferenceKey` (`HideTabBarPreferenceKey`) that OR-folds up the tree. `RootTabView` also owns the single global error alert ("Something didn't save") bound to `appState.dataError`.
- There is no NavigationStack-based deep routing; sheets (`.sheet`) drive add/edit flows, and Housing/Settings push detail views inside their own stacks.

### State: one `@Observable` store

`App/AppState.swift` (~1,260 lines) is the single source of truth. Views read it via `@Environment(AppState.self)`; per-screen UI state stays as local `@State`. It owns:

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
- Housing: `Property` (`kind: primaryHome | multifamily | rental`) uses optional-field discrimination (`mortgage`, `lease`, `units`); `MortgageInfo` carries all amortization math as pure functions (vector-locked); `LeaseInfo` computes renewal/due-day helpers; `RentalPayment` logs rent received.
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

The split math deliberately uses `Double` (IEEE-754, identical to TS `number`) so the two implementations cannot diverge; leftover cents land on the same owner via `orderedOwnerIds` (ascending UUID-string sort).

### Design system

- `AppTheme` (`DesignSystem/AppTheme.swift`): warm, muted light/dark token pairs via a `Color(light:dark:)` UITraitCollection helper. Tokens: `bg`, `surface`, `text`, derived `text2/text3/hairline` (opacity 0.58/0.36/0.07), `accent` (sand/tan), `positive` (sage), `destructive` (muted brick). **Loss/cost is never red** — constitution rule.
- Typography: `Font.lato(size:weight:)` — the `weight:` is ignored; family is picked by size (**≥ 24pt → Lato-Light**, below → Lato-Regular). Money is the headline; negative money uses **U+2212** (minus sign), not a hyphen.
- `Palette.swift`: six muted avatar swatches (`peach, slate, sage, terracotta, mauve, sand`) — do not add saturated colors.
- Localization: string catalog `Localizable.xcstrings` (en/bn/es/ja/zh/ko); `AppLanguage` self-names languages in the picker; Bangla forces Latin digits (`bn_BD@numbers=latn`). `Services/Localizer.swift` bridges the in-app locale to imperative formatters (Money, InsightEngine, TransactionGroup) that SwiftUI's `\.locale` doesn't reach.
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

Test (the 7 parity suites; 22 tests green as of the last audit in `PARITY.md`):

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

## 9. Cross-links

- **`./supabase.md`** — the schema this app writes to: `users`, `households`, `household_members`, `household_people`, `transactions`, `transaction_shares`, `cards`, `budgets`, `properties` (+ housing sub-tables), `rental_payments`; RLS policies; migrations under `supabase/migrations/`.
- **`./web.md`** — the sibling client; every vector-locked iOS file has a named TS mirror there; UI decisions carry over per the `ortho-web` skill.
- **`./shared.md`** — `shared/test-vectors/*.json`, the parity contract both test suites assert.
- **`./makefile.md`** — CLI import/CRUD tooling (web-side only; shares the same tables but not the vector harness).
- Repo root `PARITY.md` — the audited capability-by-capability parity matrix and known divergences.
- `specs/` mapping: `002` (golden-vector approach) · `006` → `TransactionFilters.swift` · `007` → `TransactionSplits.swift` · `008`/`009` (parity remediation: test target, vectors in bundle, auth/session fixes) · `010` (platform lock removed; concurrent sessions) · `011` → `DashboardRange.swift` + `MonthPicker.swift` · `012` → `Balances.swift`, `Transaction.paidBy`, the `transfer` kind, settle-up UI. (`001`, `003`, `004`, `005` are web/CLI-only.)
