# Ortho — Architecture

Ortho is a household budgeting iOS app. Members of a household share
expenses and income, attribute each transaction to one or more household
members, and (for multi-owner expenses) split the amount by percentage.
A transaction can also be **personal** — visible only to its single owner.
Amounts are stored in USD cents internally and rendered in the user's
selected currency, with live FX rates fetched on launch.

A **Housing** tab tracks the household's properties — primary home,
multifamily investment, or a place the household rents — with
type-specific UI (amortization, equity, units + tenants, lease info,
rent payment history) and computed-from-inputs financials.

This document describes the codebase as it stands today: structure, models,
state, design system, and the technical decisions behind them.

---

## Tech stack and targets

- **Platform:** iOS, Swift 5, SwiftUI
- **Deployment target:** iOS 26.2 (project setting in `Ortho-iOS.xcodeproj`)
- **Xcode project layout:** `PBXFileSystemSynchronizedRootGroup` — any folder
  added under `Ortho-iOS/Ortho-iOS/` is automatically included in the target.
  No `project.pbxproj` edits are needed when adding files.
- **No third-party packages.** Pure SwiftUI + Foundation + Apple's `Charts`
  framework (iOS 16+) for the amortization bar chart.
- **Networking:** one outbound call — `URLSession.shared.data(from:)` to
  [`floatrates.com/daily/usd.json`](https://www.floatrates.com/daily/usd.json)
  for live FX rates. No auth, no backend of our own.
- **No persistence for domain data yet.** Users, transactions, cards,
  households, properties, and rental payments reset on every launch
  (sample data is seeded). What *does* persist via `UserDefaults`: currency
  choice, appearance preference, current-user id, current-household id,
  and the FX rate cache.

---

## File structure

```
Ortho-iOS/Ortho-iOS/
├── Ortho_iOSApp.swift          @main; installs AppState into the environment
├── App/
│   ├── AppState.swift          @Observable single-source-of-truth store
│   └── RootTabView.swift       OrthoTab + OrthoTabBar + RootTabView shell
│                               + HideTabBarPreferenceKey
├── Models/
│   ├── User.swift              Household member; palette extension; sample
│   ├── Transaction.swift       Expense or income; multi-owner; optional splits
│   ├── TransactionCategory.swift  Enum with SF Symbol + tint per case
│   ├── TransactionGroup.swift  Derived day buckets with Today/Yesterday labels
│   ├── Card.swift              Payment source (name only); sample seed
│   ├── Currency.swift          7-case enum + fallback rates + fraction digits
│   ├── Household.swift         Named group of members; sample
│   ├── Property.swift          Property + PropertyKind enum; sample seed
│   ├── MortgageInfo.swift      Amortization math (payment, balance, equity)
│   ├── LeaseInfo.swift         Rent, lease dates, renewal helpers
│   ├── Unit.swift              Rental unit (multifamily); tenant fields
│   ├── RentalPayment.swift     Logged rent payment for a rental property
│   └── DummyData.swift         DEBUG-only — 6-month varied dataset
├── DesignSystem/
│   ├── AppTheme.swift          Color tokens (bg, surface, text, accent, …)
│   ├── Palette.swift           OrthoColorOption — household color palette
│   ├── AppearanceMode.swift    enum system/light/dark + ColorScheme mapping
│   ├── Density.swift           comfortable / compact sizing values
│   └── Money.swift             Currency-aware formatter (USD-cents in)
├── Components/
│   ├── UserAvatarView.swift    Initial-in-circle, palette-driven
│   ├── DayHeader.swift         Sticky day section header
│   ├── RowSeparator.swift      Inset hairline divider
│   ├── SearchField.swift       Focused TextField with Cancel
│   └── SwipeActionRow.swift    iOS-style swipe-to-delete wrapper
└── Features/
    ├── Dashboard/
    │   └── DashboardView.swift          Placeholder cards
    ├── Transactions/
    │   ├── TransactionsView.swift       Day-grouped list + search + scope filter
    │   ├── TransactionRow.swift         One row, tappable
    │   ├── AddTransactionSheet.swift    Dual-mode (add OR edit) form
    │   └── TransactionDetailSheet.swift Read-only view + edit/delete actions
    ├── Housing/
    │   ├── HousingView.swift            Count-aware tab (empty / single / list)
    │   ├── PropertyCard.swift           List-row card for one property
    │   ├── PropertyContentView.swift    Shared kind-specific card stack
    │   ├── PropertyDetailView.swift     Push-mode chrome around PropertyContentView
    │   ├── PropertyTypePickerSheet.swift Three-row kind picker
    │   ├── AddPropertySheet.swift       Polymorphic add/edit form
    │   ├── AddRentalPaymentSheet.swift  Quick rent-payment logger
    │   ├── MortgageCards.swift          Monthly payment + details + equity + amortization
    │   ├── MultifamilyCards.swift       Units list + net balance
    │   └── RentalCards.swift            Rent hero + renewal banner + history
    └── Settings/
        ├── SettingsView.swift           Household link, Cards, Currency, Appearance, Developer (DEBUG)
        ├── HouseholdView.swift          Pushed screen — full household management
        ├── UserRowView.swift            User row + AddUserRowView + ChevronView
        ├── AddUserSheet.swift           New-user form
        ├── ColorSwatchButton.swift      Color picker swatch
        ├── CardRowView.swift            Card row + AddCardRowView
        ├── AddCardSheet.swift           New-card form
        └── AppearanceRowView.swift      Appearance mode row
```

### Folder rationale

Five buckets, each answering a single question:

- **`App/`** — what runs the app: entry point, root navigation, global state.
- **`Models/`** — domain types. Pure values, no SwiftUI.
- **`DesignSystem/`** — tokens and formatters. No SwiftUI views.
- **`Components/`** — small, reusable SwiftUI views with no feature-specific
  logic. If a view is meaningful in more than one screen, it lives here.
- **`Features/<screen>/`** — screen-scoped views. Co-located with their
  supporting subviews and sheets.

Two folders explicitly *not* present:

- **No `ViewModels/`** — with `@Observable` + a single root `AppState`,
  per-screen view models are ceremony for the size of this app. Views read
  state directly via `@Environment(AppState.self)`.
- **No `Services/` or `Persistence/`** — the FX fetch lives inline on
  `AppState` (small, single concern). Add a `Services/` folder when there's
  a second service or when the FX logic outgrows AppState.

---

## Domain model

### `User`

```swift
struct User: Identifiable, Hashable {
    let id: UUID
    var name: String
    var initial: String          // "M" or "M+J"
    var colorKey: String         // references OrthoColorOption.all
}
```

- `User.placeholder` is returned by `AppState.user(_:)` when an id no longer
  matches anyone in `users` (defensive — happens if a User was removed but
  a transaction still references them).
- `User.mayaSample` / `User.jordanSample` have stable hardcoded UUIDs so
  sample transactions and the seeded household reference them deterministically.
- A User can be in zero, one, or many households (the data model supports it;
  the UI currently shows one active household).

### `Household`

```swift
struct Household: Identifiable, Hashable, Codable {
    let id: UUID
    var name: String
    var memberIDs: [User.ID]    // ordered for stable UI
}
```

`Household.homeSample` is the seeded household ("Home", Maya + Jordan).
`memberIDs` is an array (not a set) so display order survives renames /
re-orders. The same User can be removed and re-added without losing
transaction history because their User record stays in `appState.users`.

### `Transaction`

```swift
struct Transaction: Identifiable, Hashable {
    let id: UUID
    var merchant: String
    var category: TransactionCategory
    var kind: TransactionKind             // .expense or .income — explicit
    var amount: Int64                      // USD cents; always >= 0
    var ownerIDs: Set<User.ID>             // count >= 1
    var splits: [User.ID: Decimal]?        // optional explicit percentages
    var source: String                     // free-form (card name or income source)
    var date: Date                         // see "Time" note below
    var householdID: Household.ID?         // nil = personal; non-nil = shared
}
```

- `amount` is **USD cents**, stored as `Int64`. e.g. `$5.75 → 575`. Display
  conversion to the user's selected currency happens at every render via
  `AppState.formatMoney(_:)`.
- `householdID == nil` means **personal** — `ownerIDs.count == 1` by
  invariant, and the row is visible only to the matching `currentUserID`.
  Non-nil means **shared** — every member of that household sees it.
- `effectiveSplits` returns either `splits` directly or an even-split
  distribution over `ownerIDs` when `splits` is `nil`. Callers don't branch.
- `isIncome` is a computed convenience.

### `TransactionGroup`

```swift
struct TransactionGroup: Identifiable, Hashable {
    let id: Date                  // start-of-day
    let day: Date
    let items: [Transaction]
    var dayLabel: String          // "Today" / "Yesterday" / weekday / "May 17"
    var dateLabel: String         // "May 17"
    var outgoingTotal: Int64      // USD cents
}

static func group(_ txs: [Transaction]) -> [TransactionGroup]
```

Derived, not stored. `dayLabel` computes from `Calendar.startOfDay(for:)` so
"Today / Yesterday" stays correct as time passes — no hardcoded strings.

### `TransactionCategory`

`enum` with one case per category. Each case knows its SF Symbol (used by
`TransactionRow` and the category picker) and its muted tile tint.

### `Card`

```swift
struct Card: Identifiable, Hashable {
    let id: UUID
    var name: String
}
```

Drives the "Paid with" dropdown in the add-transaction sheet. `Transaction`
stores the card's `name` string, not its id, so an existing transaction
keeps its label if the underlying card is later renamed or deleted.

### `Currency`

```swift
enum Currency: String, CaseIterable, Identifiable, Hashable, Codable {
    case usd, cad, gbp, eur, jpy, cny, bdt

    var code: String                       // ISO 4217 — "USD", "CAD", ...
    var displayName: String                // "US Dollar", "Canadian Dollar", ...
    var fractionDigits: Int                // 2 for most, 0 for JPY
    var fallbackRateFromUSD: Decimal       // used until live rate lands
}
```

7 currencies. The `code` drives `NumberFormatter.currencyCode` which handles
symbol + grouping + locale-aware formatting. `fallbackRateFromUSD` is a
hardcoded approximate value used until the first successful fetch from
floatrates.com, or when network is unavailable.

### `Property` + `PropertyKind`

```swift
enum PropertyKind: String, CaseIterable, Codable {
    case primaryHome, multifamily, rental
    var hasMortgage: Bool { self != .rental }
}

struct Property: Identifiable, Hashable, Codable {
    let id: UUID
    var kind: PropertyKind
    var address: String
    var nickname: String?
    var mortgage: MortgageInfo?    // populated for primaryHome + multifamily
    var lease: LeaseInfo?          // populated for rental
    var units: [Unit]              // populated for multifamily; empty otherwise
}
```

The optional-field discriminator pattern keeps `Property` a single Codable
struct. `kind` decides which optional fields are meaningful. Invariants:
`primaryHome.mortgage != nil && units.isEmpty && lease == nil`;
`multifamily.mortgage != nil && units.count >= 1 && lease == nil`;
`rental.lease != nil && mortgage == nil && units.isEmpty`. The AddProperty
sheet enforces these at construction time.

`Property.sample` seeds 124 Oak Lane (a primary home with a mid-life
mortgage). The dummy dataset extends to 3 properties — one of each kind.

### `MortgageInfo`

```swift
struct MortgageInfo: Hashable, Codable {
    var purchasePrice: Int64                       // USD cents
    var originalLoan: Int64                        // USD cents
    var annualInterestRatePercent: Decimal         // e.g. 6.85
    var loanTermYears: Int                         // 15 / 20 / 30
    var closingDate: Date
    var autoPaySource: String?

    // Derived
    var monthlyPaymentCents: Int64                 // standard fixed-rate formula
    func currentPrincipalBalanceCents(asOf:) -> Int64
    func currentEquityCents(asOf:) -> Int64
    func equityFraction(asOf:) -> Double
    var maturityDate: Date
    func yearsRemaining(asOf:) -> Int
    func upcomingAmortization(months:) -> [MonthlyBreakdown]
}
```

All the financial math lives here as pure functions of the stored inputs.
The display layer (mortgage cards, amortization chart) reads these directly
— there's no separate service. Standard fixed-rate amortization formula
(`M = P · r(1+r)^n / ((1+r)^n − 1)`), uses Double internally for `pow()`
then rounds back to `Int64` cents at the boundary.

### `LeaseInfo`

```swift
struct LeaseInfo: Hashable, Codable {
    var monthlyRent: Int64
    var leaseStart: Date
    var leaseEnd: Date
    var securityDepositCents: Int64?
    var paidWithSource: String?

    func daysUntilEnd(asOf:) -> Int
    func isRenewalSoon(asOf:) -> Bool          // ≤ 60 days
    var rentDueDay: Int                         // derived from leaseStart
    func daysUntilNextRent(asOf:) -> Int
}
```

Powers the rental detail view's heading caption ("Due in X days"), the
lease-renewal banner (60-day window), and the lease-info card.

### `Unit`

```swift
struct Unit: Identifiable, Hashable, Codable {
    let id: UUID
    var name: String           // "Unit 1A"
    var monthlyRent: Int64
    var tenantName: String?
    var tenantEmail: String?
    var isVacant: Bool         // computed from tenantName
}
```

Multifamily-only. Stored inline on `Property.units`. Vacancy is purely a
display concern (`tenantName == nil || isEmpty`).

### `RentalPayment`

```swift
struct RentalPayment: Identifiable, Hashable, Codable {
    let id: UUID
    let propertyID: Property.ID
    var amount: Int64                  // USD cents
    var date: Date
    var note: String?
}
```

Logged manually by the user via `AddRentalPaymentSheet` for `.rental`
properties. Power the rental detail's Payment History list. Deleting the
underlying property cascades these via `AppState.deleteProperty(_:)`.

---

## State management

A single `@Observable` class lives at the app root and is read by every
screen via `@Environment(AppState.self)`:

```swift
@Observable
final class AppState {
    // Domain
    var users: [User]
    var transactions: [Transaction]
    var cards: [Card]
    var households: [Household]
    var properties: [Property]
    var rentalPayments: [RentalPayment]

    // Identity + active household (persisted via UserDefaults)
    var currentUserID: User.ID
    var currentHouseholdID: Household.ID?

    // Currency + live FX (persisted via UserDefaults)
    var currency: Currency
    var fxRates: [Currency: Decimal]
    var ratesLastFetched: Date?
    var ratesIsLoading: Bool
    var ratesError: String?

    // Domain CRUD
    func addUser(_:)
    func addTransaction(_:)       func updateTransaction(_:)
    func deleteTransaction(_:)
    func addCard(_:)              func deleteCard(_:)
    func addMemberToCurrentHousehold(_:)
    func removeMemberFromCurrentHousehold(_:)
    func updateHouseholdName(_:)
    func addProperty(_:)          func updateProperty(_:)
    func deleteProperty(_:)       // cascades rentalPayments by propertyID
    func addRentalPayment(_:)
    func deleteRentalPayment(_:)
    func payments(for: Property.ID) -> [RentalPayment]    // newest-first

    // Lookups + derived
    func user(_ id: User.ID) -> User
    func resolveOwners(of:) -> [User]
    func ownersDisplay(of:) -> (avatarUser: User, label: String)
    func monthlySpent(by:in:on:) -> Int64
    var currentHousehold: Household?
    var householdMembers: [User]
    var groups: [TransactionGroup]

    // Currency
    func rate(for: Currency) -> Decimal
    func formatMoney(_ cents: Int64, leadingPlus: Bool = false) -> String
    func refreshRatesIfStale() async       // 24h cache window
    func refreshRates() async              // network → cache → state

    // DEBUG-only
    #if DEBUG
    func loadDummyData()                   // replaces every domain collection
    #endif
}
```

Installation, in `Ortho_iOSApp.swift`:

```swift
@State private var appState = AppState()
...
RootTabView().environment(appState)
```

`RootTabView` calls `.task { await appState.refreshRatesIfStale() }` so a
fresh rate fetch happens once per launch when the 24h cache is stale.

Per-screen UI state (search query, "showing add sheet", focus state, form
inputs, scope filter) lives as `@State` on the screen itself. `AppState`
only owns domain data, identity, currency, and the helpers needed to read it.

---

## Design system

### Color tokens (`AppTheme`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | warm off-white | deep neutral | screen background |
| `surface` | white | near-black | inset cards / rows |
| `text` | graphite | warm off-white | primary text |
| `text2 / text3 / hairline` | `text * 0.58 / 0.36 / 0.07` | same | derived |
| `accent` | muted sand | warm tan | active affordances, links |
| `positive` | sage | lighter sage | income amounts, equity, progress |
| `destructive` | muted brick | softer salmon | Delete actions, swipe-to-delete |

Every token pairs a light and dark value via a `Color(light:dark:)` helper
that wraps `UITraitCollection.userInterfaceStyle`. No `Color`-literal
hardcoding outside of `AppTheme` and `Palette`.

The custom `OrthoTabBar` uses `.ultraThinMaterial` for its background with
no warm-color overlay underneath, so scrolling content shows through a
soft frosted blur. The hairline sits at the top edge.

### Household palette (`OrthoColorOption`)

Six muted swatches: `peach, slate, sage, terracotta, mauve, sand`. Each is
a `(bg, fg)` pair. Users carry a `colorKey` and resolve to a palette entry
via `User.palette`. Used by `UserAvatarView`, the chip rows in the
add-transaction sheet, and the color picker in `AddUserSheet`.

Do not add saturated colors to this list — calm is a design constraint.

### Other DesignSystem types

- **`Density`** — `.comfortable` or `.compact`. Drives row min height, font
  sizes, avatar diameter, padding values for the activity list. Currently
  hardcoded to `.comfortable` everywhere but the value is plumbed through.
- **`AppearanceMode`** — `system / light / dark` with `ColorScheme?` mapping.
- **`Money`** — currency-aware formatter. Public surface:
  `string(cents:currency:rate:leadingPlus:)`, `symbol(for:)`,
  `toUSDCents(_:from:rate:)`, `toDisplayAmount(cents:in:rate:)`. Cached
  per-currency `NumberFormatter` keeps rapid re-renders cheap.

---

## Key technical decisions

### Why `@Observable`, not `ObservableObject`

iOS 17+ supports the new `@Observable` macro, which removes `@Published`
boilerplate and gives per-property change tracking. With deployment target
at iOS 26.2, this is strictly correct.

### Why amounts are `Int64` USD cents

Floating-point loses pennies. `Decimal` is precise but verbose at every
boundary. `Int64` of USD cents is exact, naturally bounded for currency
math, and matches how most accounting systems represent money. Sums are
exact integer addition. The display path multiplies `Decimal(cents) / 100
× rate` (Decimal kept for the rate math) and rounds back to the currency's
fraction digits at render time.

### Why live FX rates with a fallback

The app's primary metric is "how much did we spend?" so a stale conversion
is more wrong than a missing currency code. Live rates from floatrates.com
(free, no API key, includes BDT — most ECB-based feeds don't) keep the
display honest. The 24h cache + hardcoded fallback means the app always
renders something sensible: live → cached (< 24h) → cached (stale) →
hardcoded fallback, in that order of preference.

### Why `Set<User.ID>` for ownership, not a multi-owner struct

Owners are a set: order doesn't matter, duplicates are meaningless, and the
common operations are membership tests and counts. `Set` makes these O(1)
and self-documenting. The User struct itself isn't stored on the transaction
— only the id — because users can be renamed / re-colored / re-added to a
household in Settings and we want existing transactions to follow.

### Why `splits: [User.ID: Decimal]?` is optional

When `nil`, the amount is split evenly across `ownerIDs`. This makes 90%+
of multi-owner transactions zero-overhead: rent that's truly 50/50 doesn't
need stored data saying "50/50." `effectiveSplits` papers over the
distinction for readers. The add-sheet's percentage editor auto-rebalances
*proportionally* when one row is edited (prior manual adjustments survive);
an **Even** button resets the split.

### Why `Transaction.householdID: Household.ID?` instead of a `scope` enum

`householdID == nil ⇒ personal` is one indirection rather than two
(`scope == .personal` + a separate optional `householdID`). Personal
transactions have a single owner anyway (`ownerIDs.count == 1` by
invariant), so the model collapses cleanly. The Activity-list filter
(`.all / .shared / .personal`) and `AddTransactionSheet`'s Shared|Personal
toggle both derive from this single field.

### Why `Transaction.source: String` instead of `Card.ID`

Cards are user-managed in Settings. A user might delete an old card after
already logging transactions against it. Storing the name as a string means
those rows keep their label — no "Removed" placeholder, no data migration.
Same reasoning as why ownerIDs survives member removal: the User record
stays in `users` even if removed from `currentHousehold.memberIDs`.

### Why `currentUserID` exists but has no picker UI

The current user is the anchor for **Personal** transactions (whose
ownership is just `[currentUserID]`) and for the `(you)` marker on the
household member row. Without it, "Personal" has no meaning. The original
prototype had an "I am" Menu that let you switch perspective; it was
removed because it was effectively a dev affordance on a single-user
device. The field defaults to the first household member on first launch
and survives via UserDefaults. When real auth lands, it'll be set from the
session.

### Why `Property` uses optional fields, not an enum with associated values

`enum PropertyKind { case primary(MortgageInfo), multifamily(MortgageInfo, [Unit]), rental(LeaseInfo) }`
is the more "type-safe" Swift idiom. We picked the flatter shape
(`Property` with `kind: PropertyKind` + optional `mortgage` / `lease` /
`units`) because:

1. `Codable` synthesis is trivial — no per-case decoding to write.
2. Field reuse — `mortgage` is identical for primary and multifamily; in
   the enum form we'd duplicate or factor out, both noisier than just
   sharing an optional.
3. The Property model survives a `kind` change at edit time (a primary
   becoming a rental) without throwing away data — `AddPropertySheet`
   intentionally locks `kind` post-creation, but the option is open.

Invariants are enforced at construction (the `AddPropertySheet` builder)
rather than encoded in the type system.

### Why `MortgageInfo` carries its own math (no separate service)

The amortization formulas are pure functions of the stored mortgage
inputs. Putting them on the struct lets every consumer (cards, chart,
detail header) call `mortgage.monthlyPaymentCents` / `equityFraction()` /
`upcomingAmortization(months:)` without any setup. No separate
`AmortizationCalculator` class needed. When a real "what-if" simulator
appears (extra-payment scenarios, refi modeling), it can layer on top of
this without disturbing the core.

### Why `HousingView` branches on property count

With one property, drilling in for the detail wastes a tap and a screen —
the user already knows which one it is. With multiple, the user needs to
disambiguate, so the list-of-cards is right. The view checks
`properties.count` and renders one of three branches: empty state, inline
`PropertyContentView` with an extended header, or a list of
`PropertyCard`s pushing to `PropertyDetailView`. The shared
`PropertyContentView` keeps the actual card content identical between the
inline and pushed modes.

### Why `PropertyContentView` is extracted from `PropertyDetailView`

`PropertyDetailView` and the single-property branch of `HousingView` both
need to render the same kind-specific stack of cards (mortgage cards,
multifamily units, rental history, etc.) plus a Delete button and
confirmation alert. The chrome around them differs — `PropertyDetailView`
has a back chevron + Edit button + `.hidesTabBar()`; the inline mode has
a "Housing" title + Edit + Add buttons and keeps the tab bar visible.
`PropertyContentView` is the shared body; the parents own the chrome.

### Why `HideTabBarPreferenceKey` for the custom tab bar

SwiftUI's `.toolbar(.hidden, for: .tabBar)` only works against the system
`TabView`. The custom `OrthoTabBar` is rendered via `.safeAreaInset(.bottom)`
on `RootTabView`, so we need our own mechanism for pushed detail screens
to ask for it to slide away. `HideTabBarPreferenceKey` (a Bool `PreferenceKey`
that OR-folds child values) lets any descendant declare `.hidesTabBar()`,
and `RootTabView` consumes the aggregated value with a sliding
`.transition(.move(edge: .bottom))`. Both `PropertyDetailView` and
`HouseholdView` opt in.

### Why a custom `SwipeActionRow` instead of SwiftUI `List` + `.swipeActions`

`.swipeActions` only works on `List` rows. Migrating the activity tab to
`List` would mean rebuilding the inset-card-per-day grouping, sticky day
headers, and hairline separators inside cards — all of which our custom
`LazyVStack` already does cleanly. `SwipeActionRow` is a small wrapper
(`ZStack(alignment: .trailing)` with a destructive Delete button revealed
by `.offset` on the foreground content) and preserves the existing
visual. `DragGesture(minimumDistance: 8)` lets stationary taps pass
through to the row's inner Button (drill-into-detail behavior survives).

### Why a custom `OrthoTabBar`, not SwiftUI's `TabView`

`TabView` applies its own translucency, tint, and label-weight rules that
diverge from the Ortho spec (hairline top, frosted glass via
`.ultraThinMaterial`, muted-graphite inactive labels). The custom bar is
small and gives full control. It does not support state-restoration /
deep-link behavior — when that becomes a real requirement, swap in
`TabView` and recover the look via `.toolbarBackground`.

### Why `date: Date` even though the UI never shows time

Removing the time *concept* from the user-facing app is intentional: the
DatePicker is `displayedComponents: [.date]`, the row's right column shows
only the amount. But the underlying type stays `Date` because:

1. `Calendar.startOfDay(for:)` derives day grouping correctly even across
   DST boundaries — it can't with a hand-rolled "day only" type.
2. The time portion (set to `.now` when adding) doubles as an implicit
   ordering signal for transactions logged on the same day. The user sees
   nothing; the sort stays stable.

### Why detail sheet looks up by id, not by snapshot

`TransactionDetailSheet` takes `txID: Transaction.ID` and re-reads the live
transaction from `AppState` on every render. This means edits propagate to
the open detail sheet automatically (you save changes in the edit sheet,
the detail sheet behind it re-renders with the new values). It also
handles delete gracefully: `tx` becomes `nil`, `Color.clear` renders in
its place, and the sheet's `.onAppear` calls `dismiss()`.

`PropertyDetailView` and `PropertyContentView` use the same pattern with
`propertyID: Property.ID`, which lets the inline single-property
`HousingView` re-render when the user edits the property without any
explicit refresh plumbing.

### Why `AddTransactionSheet` / `AddPropertySheet` are dual-mode (add or edit)

Edit forms always end up duplicating the add form. The two flows differ
only in (a) initial values, (b) the nav title and action label, and (c)
whether the resulting record keeps the old id or gets a new one. Putting
both in one struct with an `editing: Transaction?` / `editing: Property?`
parameter and an explicit `init` that pre-fills `@State` removes that
duplication. `AddPropertySheet` additionally takes a `creating: PropertyKind`
init for the new-property flow because the kind is chosen separately (via
`PropertyTypePickerSheet`) before the form opens.

### Why an `originalAmountText` round-trip mitigation in edit mode

The amount is stored in USD cents but displayed in the user's currency.
Re-opening an existing transaction in CNY (or any non-USD currency) would
mean: stored cents → display amount → user re-saves → display amount →
stored cents. That round-trip introduces sub-cent rounding error (and full
yen errors for JPY). The edit sheet snapshots the formatted amount string
on appear; on save, if the field is unchanged, we reuse `editing.amount`
directly instead of re-converting. So editing non-amount fields never
shifts the stored cents.

### Why `.lineLimit(1)` + `.minimumScaleFactor(...)` on every money render

Wide currencies (CN¥, BDT prefix, ৳) plus comma-grouped digits can overflow
the right column of a transaction row or the amount hero on a sheet. Hard
truncation would hide cents (`$1,234.5…` is dangerous in an accounting
context). `.lineLimit(1)` keeps the value on one line; `.minimumScaleFactor`
lets SwiftUI shrink the font before wrapping. Tuned per surface: 0.6 for
list rows, 0.5 for the 40pt amount heroes, 0.7 for the 12pt day-total.

### Why `@AppStorage` for appearance, `UserDefaults` directly for the rest

Appearance is a pure UI preference and the change site (Settings) is
right next to the read site (`Ortho_iOSApp`). `@AppStorage` is the right
SwiftUI primitive — it persists and propagates automatically. The other
persisted preferences (currency, currentUserID, currentHouseholdID, FX
cache) live on `AppState` because they're read by many call sites and
participate in `@Observable` change tracking. `AppState.init` reads from
`UserDefaults` once; `didSet` writes back on every change.

### Why `DummyData` is `#if DEBUG`-gated

The seeded sample data on `Property.sample` / `User.sample` / etc. is the
right "first run" experience for real users — small, focused, comprehensible.
The dummy dataset is bigger (~300 transactions, 3 properties, 3 users)
specifically so the activity list and analytics views have something dense
to chew on while iterating on UI. That's a developer convenience, not a
product feature, so it ships only in DEBUG builds. The `loadDummyData()`
method on `AppState` and the Developer section in `SettingsView` are both
`#if DEBUG`-wrapped.

### Why no comments in most files

Source code defaults to no comments. The exceptions are:

- File headers explaining what a file is for and any non-obvious design
  intent (e.g. "Why not SwiftUI's TabView?")
- Inline comments where the *why* would be non-obvious to a future reader.

`AddTransactionSheet.rebalance(after:)`, `TransactionGroup.group(_:)`,
`User.placeholder`, the deletion-resilience note in `Card.swift`, the
`originalAmountText` rationale, the FX `MainActor.run` blocks, and the
`SwipeActionRow` minimum-distance gesture comment all qualify. The rest
is named well enough to read on its own.

---

## Features (current state)

The bottom nav has **4 tabs**: Dashboard / Transactions / Housing / Settings.

### Transactions (activity tab)

- Day-grouped list with sticky headers (Today / Yesterday / weekday / date)
- **Scope filter pill** below the search field: All / Shared / Personal
- Search filters across merchant, source, category name, and owner names
- "+" button in the title bar presents `AddTransactionSheet` in add mode
- Tap any row → `TransactionDetailSheet` (read-only view)
  - **Edit** opens `AddTransactionSheet` pre-filled, preserving id
  - **Delete transaction** confirms via alert, then removes
  - Nav title surfaces scope: "Expense · Home" or "Personal expense"
- **Swipe-to-delete** on any row via `SwipeActionRow`. Drag horizontally
  to reveal the red Delete button; tap to remove. Single-tap drill-in
  behavior is preserved by the gesture's minimum-distance threshold.
- Add sheet supports both expense and income via a segmented control,
  plus a **Shared | Personal** scope toggle above it:
  - **Amount** is the headline, currency symbol from `Money.symbol(for:)`
  - **Multi-select owner chips** (shared only) drive `Transaction.ownerIDs`
    — chips iterate `appState.householdMembers` so removed members don't
    appear in new transactions
  - **Split editor** appears only for multi-owner shared expenses; auto-
    rebalances on edit; **Even** button for one-tap reset
  - **Paid with** menu (expense) reads from `appState.cards`
  - **Date** is a `displayedComponents: [.date]` picker

### Housing tab

Behavior varies with property count:

- **0 properties** — empty-state CTA inviting the user to add their first.
- **1 property** — the property's full detail (cards) rendered inline.
  Header shows "Housing" + `<address> · <kind>` subtitle, with **Edit**
  and **+** buttons on the right. The tab bar stays visible.
- **≥ 2 properties** — list of `PropertyCard`s, each pushing to
  `PropertyDetailView`. The detail view has its own back-chevron header
  + Edit button and hides the tab bar via `.hidesTabBar()`.

Across all modes, the **+** button opens `PropertyTypePickerSheet` (3-row
picker: Primary home / Multifamily / Rental), which then presents
`AddPropertySheet(creating: kind)` with kind-specific fields. Editing an
existing property uses the same sheet with `editing:`.

Per-kind detail content (all in `Features/Housing/`):

- **Primary home / Multifamily**:
  - `MortgageMonthlyPaymentCard` — big hero with auto-pay caption
  - `MortgageDetailsCard` — principal balance / interest rate / maturity
  - `EquityProgressCard` — sage progress bar showing equity built
  - `AmortizationCard` — 12-month stacked bar chart (principal vs interest)
    using Apple's `Charts` framework
  - **Multifamily extras**: `MultifamilyUnitsCard` (rent + tenant per row,
    "Vacant" in destructive when no tenant), `MultifamilyNetBalanceCard`
    (income − mortgage, sage when cashflowing, destructive otherwise)
- **Rental**:
  - `RentalMonthlyRentCard` — big hero with "Due in X days" caption
  - `LeaseRenewalBanner` — soft accent-tinted card when lease ends within
    60 days
  - `LeaseInfoCard` — start / end / deposit / paid-with
  - `RentalPaymentsCard` — payment history list with "Log payment" action;
    each row has a destructive minus to delete

A "Delete property" button sits at the bottom of every detail view; it
confirms via alert, then cascades to drop the property's rental payments.

### Settings tab

- **Household** section — single push row showing the active household's
  name. NavigationLinks to `HouseholdView` for the full editor.
- **Cards** section — user-managed payment source list with destructive
  minus button per row; **Add card** opens `AddCardSheet`.
- **Currency** section — single Menu row with all 7 currencies (checkmark
  on the active one). Below the card: a rates-freshness caption
  ("Rates updated 2 minutes ago" / "Updating rates…" / "Rates unavailable;
  using approximate values").
- **Appearance** section — system / light / dark rows; selection persists
  via `@AppStorage("appearance")`.
- **Developer** section (`#if DEBUG`) — a single **Load demo data** row
  with confirmation alert. Replaces every domain collection with the
  6-month `DummyData.large` bundle (3 users, 3 properties, ~300 mixed
  transactions, monthly rental payments). Currency and appearance
  preferences are preserved. Relaunching the app reverts to the default
  sample (no persistence on domain data).
- Bottom: a 60pt `Color.clear` spacer because the NavigationStack +
  toolbar-hidden chrome interferes with the bottom tab bar's
  safe-area-inset propagation.

### Household screen (pushed from Settings)

- Custom large-title header ("Household") with a circular back chevron;
  `.hidesTabBar()` so the tab bar slides away.
- **Name** row → tap opens a SwiftUI `.alert` with a TextField for renaming
- **Member list** — each row is `UserRowView` showing the member's avatar,
  name, monthly-spent total ("(you) · $X this month" on the current user),
  and a destructive minus button (`onRemove`). Removing a member detaches
  them from `currentHousehold.memberIDs` but keeps the User record so
  existing transactions still resolve their name + palette.
  - Minus is hidden for the current user and for the last remaining member.
- **Add member** → `AddUserSheet` (name + 6-color picker + live preview);
  on add, the new user is appended to both `appState.users` and
  `currentHousehold.memberIDs`.

### Dashboard tab

Placeholder cards (May summary + joint balance) with hardcoded strings.
Real data lookups exist (`AppState.monthlySpent(by:)`) but the Dashboard
hasn't been redesigned around them. The Housing tab partially fills the
"what does our household own?" question this tab was originally meant to
answer.

---

## Known gaps and out-of-scope decisions

- **No persistence for domain data.** Users, transactions, cards, households,
  properties, and rental payments reset on every launch. SwiftData / a
  backing store is the obvious next step. (Preferences and FX cache *do*
  persist via UserDefaults.)
- **No real Dashboard.** Placeholder cards with hardcoded strings. Real
  per-user / per-month aggregations exist in `AppState` already; they just
  haven't been surfaced.
- **Single household in the UI.** The data model supports many — `households:
  [Household]` and `currentHouseholdID: Household.ID?` — but there's no
  household switcher. Adding one is mostly UI: a picker in Settings or a
  segmented header on Transactions.
- **No transfers between members.** Iteration 2 work. Transfer model,
  Add Transfer sheet, balance computation, separate display in Activity.
- **No current-user picker UI.** `currentUserID` exists in state but isn't
  user-editable. Defaults to first member on first launch.
- **No category management.** Categories are a hardcoded enum. Could get
  the same treatment as Cards (user-managed list) when there's a real
  need to add custom ones.
- **No income-source management.** Cards are an expense concept;
  `AddTransactionSheet`'s income side still uses a static list of three
  options (ACH · Checking / ACH · Joint / Wire).
- **No Density toggle UI.** The plumbing exists (`comfortable / compact`)
  but no Settings toggle exposes it.
- **No accessibility audit.** Labels exist on destructive buttons and
  the avatar/initial Text scales with Dynamic Type, but no VoiceOver pass
  has been done.
- **No FX refresh on foreground.** Rates fetch once per launch when the
  24h cache is stale. A long-lived session won't pick up newer rates
  without a scene-phase listener.
- **Round-trip currency precision loss.** USD cents is a lossy base for
  currencies with much larger units (JPY, BDT). Typing ¥9 stores 6 cents
  which displays back as ¥9 (rounded). For currencies near USD scale
  (CAD/EUR/GBP) the loss is sub-cent. The `originalAmountText` mitigation
  in `AddTransactionSheet` preserves stored cents when the user doesn't
  touch the amount field.
- **No iOS local notifications.** The rental detail view's "Due in X days"
  hero caption and the lease-renewal banner are in-app affordances only.
  There's no `UNUserNotificationCenter` integration to push lock-screen
  reminders.
- **No auto-detection of rent payments from Transaction records.** Rent
  appears in two places — as a household expense in `appState.transactions`
  AND as a `RentalPayment` against the rental property — and the user
  logs them separately. A future iteration could detect "rent paid"
  transactions and offer to auto-log them as `RentalPayment`s.
- **Multifamily tenant payments aren't tracked.** Configured `Unit.monthlyRent`
  drives the displayed income on `MultifamilyNetBalanceCard`, but there's
  no record of actual rent collected per month per tenant.
- **Mortgage figures don't include taxes/insurance.** `monthlyPaymentCents`
  is principal + interest only. Property tax, homeowner's insurance, HOA
  fees, and PMI aren't modeled.

---

## Verification

To confirm the project builds cleanly:

```sh
xcodebuild \
  -project Ortho-iOS.xcodeproj \
  -scheme Ortho-iOS \
  -destination 'generic/platform=iOS Simulator' \
  -configuration Debug \
  build
```

Expect `** BUILD SUCCEEDED **`. Inside Xcode, `⌘R` runs against the
iPhone 17 / iOS 26.2 simulator with sample data seeded.

Preview blocks live on the screen-level views and the standalone sheets:

- `App/RootTabView.swift` — Root · Light / Dark
- `Features/Transactions/TransactionsView.swift` — three density variants
- `Features/Transactions/TransactionDetailSheet.swift` — solo / joint / income
- `Features/Transactions/AddTransactionSheet.swift` — Light / Dark
- `Features/Housing/HousingView.swift` — single property / multiple / empty
- `Features/Housing/PropertyDetailView.swift` — Primary home detail
- `Features/Housing/PropertyTypePickerSheet.swift` — Light / Dark
- `Features/Housing/AddPropertySheet.swift` — primary / multifamily / rental
- `Features/Settings/SettingsView.swift` — Light / Dark
- `Features/Settings/HouseholdView.swift` — Light / Dark
- `Features/Settings/AddUserSheet.swift` — Light / Dark
- `Features/Settings/AddCardSheet.swift` — Light / Dark

`#Preview` blocks generally include `.environment(AppState())` so the
canvas renders against fresh sample data.

For a denser test experience, open the Simulator → Settings tab → scroll
to **Developer → Load demo data** (DEBUG only). The activity list will
populate with ~300 transactions across 6 months, three properties will
appear in Housing, and the rental will have six monthly payment records.
