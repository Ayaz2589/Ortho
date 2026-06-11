import Foundation
import Observation
import Supabase

/// Single source of truth for household users, transactions, cards, and
/// currency preferences. Held at the app root and read by every screen via
/// `@Environment(AppState.self)`.
@Observable
final class AppState {
    // MARK: - Supabase

    /// Shared Supabase client. Lifecycle matches `AppState` (created once
    /// at app launch). The SDK handles session persistence in the iOS
    /// Keychain on its own.
    @ObservationIgnored
    let supabase: SupabaseClient

    /// Active auth session, or `nil` when signed out. Drives the auth gate
    /// in `Ortho_iOSApp`. Kept in sync with the SDK's keychain-backed
    /// session via `observeAuthChanges()`.
    var session: Session?

    /// Email the user typed during sign-in step 1, carried through to
    /// step 2 (code verification).
    var pendingSignInEmail: String?

    var isAuthLoading: Bool = false
    var authError: String?

    /// Surfaces failures from the data layer (server CRUD calls). Set when
    /// an optimistic write rolled back. UI banner / toast reads this.
    var dataError: String?

    /// True between sign-in and the completion of the bootstrap server
    /// fetch. Views that show an "empty state" should distinguish
    /// `transactions.isEmpty && isLoadingInitialData` (skeleton) from
    /// `transactions.isEmpty && !isLoadingInitialData` (real empty state).
    /// Stays `false` for incremental syncs after the first bootstrap.
    var isLoadingInitialData: Bool = false

    /// True after `loadDummyData()` runs, until `exitDemoMode()` restores
    /// the real session. While set, every CRUD method skips its server-
    /// sync Task — local mutations still happen, but nothing is pushed
    /// because the in-memory UUIDs (Maya / Jordan / Alex / sample household)
    /// don't exist server-side and would FK-violate immediately. Bootstrap
    /// resets the flag to false defensively.
    var isInDemoMode: Bool = false

    /// Email of the currently-signed-in user, or `nil` when signed out.
    /// Surfaced as a String here so view code doesn't have to import `Auth`
    /// to read it (Swift 6 member-import-visibility — the `User.email`
    /// property lives in the `Auth` module).
    var currentUserEmail: String? {
        session?.user.email
    }

    // MARK: - Domain

    var users: [User]
    var transactions: [Transaction]
    var cards: [Card]
    var households: [Household]
    var properties: [Property]
    var rentalPayments: [RentalPayment]
    var budgets: [Budget]

    /// Device-only people the user can split personal expenses with —
    /// e.g. a partner, roommate, or family member without an Ortho
    /// account. Persisted to `UserDefaults` (JSON) and never written
    /// to Supabase. See `LocalUser` for the invariant that local users
    /// can only participate in personal-scope transactions.
    var localUsers: [LocalUser] = [] {
        didSet { persistLocalUsers() }
    }
    private static let localUsersKey = "localUsers"

    // MARK: - Identity + active household

    /// Which user is "me" on this device. Persisted so the choice survives
    /// relaunches. Default seeded to `User.mayaSample.id`.
    var currentUserID: User.ID {
        didSet {
            UserDefaults.standard.set(currentUserID.uuidString, forKey: Self.currentUserIDKey)
        }
    }

    /// Which household is currently active. The MVP UI shows only this one
    /// household at a time; the model supports many. `nil` only happens if
    /// the user later deletes their only household — handled defensively.
    var currentHouseholdID: Household.ID? {
        didSet {
            if let id = currentHouseholdID {
                UserDefaults.standard.set(id.uuidString, forKey: Self.currentHouseholdIDKey)
            } else {
                UserDefaults.standard.removeObject(forKey: Self.currentHouseholdIDKey)
            }
        }
    }

    private static let currentUserIDKey = "currentUserID"
    private static let currentHouseholdIDKey = "currentHouseholdID"

    // MARK: - Currency + FX

    /// User-selected display currency. Internally `Transaction.amount` stays
    /// in USD cents — `formatMoney(_:)` does the conversion at render time.
    var currency: Currency {
        didSet {
            UserDefaults.standard.set(currency.rawValue, forKey: Self.currencyKey)
        }
    }

    /// Live rates fetched from floatrates.com. Empty until first successful
    /// fetch — `rate(for:)` falls back to `Currency.fallbackRateFromUSD` in
    /// that case.
    var fxRates: [Currency: Decimal] = [:]
    var ratesLastFetched: Date?
    var ratesIsLoading: Bool = false
    var ratesError: String?

    private static let currencyKey = "currency"
    private static let fxRatesKey = "fxRates"
    private static let fxRatesFetchedAtKey = "fxRatesFetchedAt"
    private static let fxStaleAfter: TimeInterval = 24 * 60 * 60
    private static let fxURL = URL(string: "https://www.floatrates.com/daily/usd.json")!

    // MARK: - Init

    init(users: [User] = User.sample,
         transactions: [Transaction] = Transaction.sample,
         cards: [Card] = Card.sample,
         households: [Household] = [.homeSample],
         properties: [Property] = Property.sample,
         rentalPayments: [RentalPayment] = [],
         budgets: [Budget] = []) {
        self.supabase = SupabaseClient(
            supabaseURL: SupabaseConfig.projectURL,
            supabaseKey: SupabaseConfig.publishableKey
        )
        self.users = users
        self.transactions = transactions
        self.cards = cards
        self.households = households
        self.properties = properties
        self.rentalPayments = rentalPayments
        self.budgets = budgets

        // Restore persisted current user; fall back to first user.
        let savedUserID = UserDefaults.standard.string(forKey: Self.currentUserIDKey)
            .flatMap(UUID.init(uuidString:))
        self.currentUserID = savedUserID ?? users.first?.id ?? User.mayaSample.id

        // Restore persisted active household; fall back to first.
        let savedHouseholdID = UserDefaults.standard.string(forKey: Self.currentHouseholdIDKey)
            .flatMap(UUID.init(uuidString:))
        self.currentHouseholdID = savedHouseholdID
            ?? households.first?.id

        // Restore persisted currency.
        let saved = UserDefaults.standard.string(forKey: Self.currencyKey)
            .flatMap(Currency.init(rawValue:)) ?? .usd
        self.currency = saved

        // Restore cached FX rates if present.
        if let data = UserDefaults.standard.data(forKey: Self.fxRatesKey),
           let dict = try? JSONDecoder().decode([String: Double].self, from: data) {
            var loaded: [Currency: Decimal] = [:]
            for c in Currency.allCases {
                if c == .usd { loaded[c] = 1 }
                else if let v = dict[c.code] { loaded[c] = Decimal(v) }
            }
            self.fxRates = loaded
        }
        let fetchedAt = UserDefaults.standard.double(forKey: Self.fxRatesFetchedAtKey)
        if fetchedAt > 0 {
            self.ratesLastFetched = Date(timeIntervalSince1970: fetchedAt)
        }

        // Restore persisted local users (last — has a `didSet` that touches
        // `self`, which the compiler only allows once init is complete).
        loadLocalUsers()
    }

    // MARK: - User helpers

    /// Resolve a user id; returns `User.placeholder` when no longer present
    /// (e.g. user was deleted after the transaction was logged).
    func user(_ id: User.ID) -> User {
        // Lookup order: Supabase users first (the common case), then
        // local users via the rendering shim (`LocalUser.asUser`).
        // Personal-scope transactions can have LocalUser owner IDs;
        // without this fallback they'd render as the placeholder.
        if let u = users.first(where: { $0.id == id }) { return u }
        if let lu = localUsers.first(where: { $0.id == id }) { return lu.asUser }
        return .placeholder
    }

    func addUser(_ user: User) {
        users.append(user)
    }

    /// Owners selectable in a personal-scope transaction's picker: the
    /// current Supabase user plus every local user on this device.
    var personalParticipants: [User] {
        var out: [User] = []
        if let me = users.first(where: { $0.id == currentUserID }) { out.append(me) }
        out.append(contentsOf: localUsers.map { $0.asUser })
        return out
    }

    // MARK: - Local users (device-only, never synced)

    func addLocalUser(_ u: LocalUser) {
        localUsers.append(u)
    }

    func removeLocalUser(_ id: LocalUser.ID) {
        localUsers.removeAll { $0.id == id }
    }

    private func persistLocalUsers() {
        guard let data = try? JSONEncoder().encode(localUsers) else { return }
        UserDefaults.standard.set(data, forKey: Self.localUsersKey)
    }

    private func loadLocalUsers() {
        guard let data = UserDefaults.standard.data(forKey: Self.localUsersKey),
              let decoded = try? JSONDecoder().decode([LocalUser].self, from: data)
        else { return }
        // Assign directly — `didSet` re-encodes which is wasteful on launch,
        // but it's a small array so the cost is negligible. Could short-
        // circuit if it becomes hot.
        localUsers = decoded
    }

    func resolveOwners(of tx: Transaction) -> [User] {
        tx.ownerIDs.map { user($0) }
    }

    /// What the transaction row should render in its single avatar slot + meta
    /// line. Multi-owner transactions render a synthetic avatar with joined
    /// initials and the sage palette swatch (the legacy "joint" default).
    func ownersDisplay(of tx: Transaction) -> (avatarUser: User, label: String) {
        let owners = resolveOwners(of: tx)
        switch owners.count {
        case 0:
            return (.placeholder, "—")
        case 1:
            return (owners[0], owners[0].name)
        case 2:
            let joined = "\(owners[0].initial.prefix(1))+\(owners[1].initial.prefix(1))"
            let synthetic = User(name: "Shared",
                                 initial: joined.uppercased(),
                                 colorKey: "sage")
            return (synthetic, "\(owners[0].name) + \(owners[1].name)")
        default:
            let synthetic = User(name: "Shared", initial: "··", colorKey: "sage")
            return (synthetic, "Shared")
        }
    }

    // MARK: - Transactions

    /// Compute-on-demand so we don't have to manage an additional stored
    /// property's lifetime under `@Observable`. The struct is a thin wrapper
    /// around `SupabaseClient` — allocation is effectively free.
    private var transactionsAPI: TransactionsAPI {
        TransactionsAPI(client: supabase)
    }

    /// Optimistic insert: append locally first, sync to server in a Task.
    /// On failure we remove the local row and surface `dataError`. In
    /// demo mode the server hop is skipped — local-only by design.
    func addTransaction(_ tx: Transaction) {
        transactions.append(tx)
        guard !isInDemoMode else { return }
        Task {
            do {
                try await transactionsAPI.create(tx)
            } catch {
                await MainActor.run {
                    transactions.removeAll { $0.id == tx.id }
                    dataError = error.localizedDescription
                }
            }
        }
    }

    /// Optimistic update: snapshot the old row for rollback, mutate locally,
    /// sync to server. On failure restore the snapshot.
    func updateTransaction(_ tx: Transaction) {
        guard let idx = transactions.firstIndex(where: { $0.id == tx.id }) else { return }
        let previous = transactions[idx]
        transactions[idx] = tx
        guard !isInDemoMode else { return }
        Task {
            do {
                try await transactionsAPI.update(tx)
            } catch {
                await MainActor.run {
                    if let i = transactions.firstIndex(where: { $0.id == tx.id }) {
                        transactions[i] = previous
                    }
                    dataError = error.localizedDescription
                }
            }
        }
    }

    /// Optimistic delete: remove locally, sync to server. On failure re-add
    /// the row at the end (loses original position — acceptable for v1).
    func deleteTransaction(_ tx: Transaction) {
        transactions.removeAll { $0.id == tx.id }
        guard !isInDemoMode else { return }
        Task {
            do {
                try await transactionsAPI.delete(id: tx.id)
            } catch {
                await MainActor.run {
                    transactions.append(tx)
                    dataError = error.localizedDescription
                }
            }
        }
    }

    /// Replace the in-memory transactions array with the server's view.
    /// Triggered manually from the Developer affordance in Settings for now;
    /// auto-sync on auth + realtime are later work.
    func loadTransactionsFromServer() async {
        do {
            let fetched = try await transactionsAPI.fetch()
            await MainActor.run { transactions = fetched }
        } catch {
            await MainActor.run { dataError = error.localizedDescription }
        }
    }

    /// Pull every server-backed collection (transactions, cards, properties
    /// + housing sub-tables, rental payments) in parallel and replace the
    /// in-memory copy. Used by bootstrap + the Developer "Sync all from
    /// server" affordance.
    func loadAllFromServer() async {
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.loadTransactionsFromServer() }
            group.addTask { await self.loadCardsFromServer() }
            group.addTask { await self.loadPropertiesFromServer() }
            group.addTask { await self.loadRentalPaymentsFromServer() }
            group.addTask { await self.loadBudgetsFromServer() }
        }
    }

    var groups: [TransactionGroup] {
        TransactionGroup.group(transactions)
    }

    /// Sum (USD cents) of this user's share of all expense transactions whose
    /// `date` falls inside the calendar month containing `referenceDate`.
    /// Solo expenses count fully; multi-owner expenses contribute
    /// `amount × split% / 100` via `Transaction.effectiveSplits`.
    func monthlySpent(
        by userID: User.ID,
        in calendar: Calendar = .current,
        on referenceDate: Date = .now
    ) -> Int64 {
        let interval = calendar.dateInterval(of: .month, for: referenceDate)
        let sum: Decimal = transactions.reduce(Decimal(0)) { acc, tx in
            guard tx.kind == .expense,
                  tx.ownerIDs.contains(userID),
                  interval?.contains(tx.date) ?? true
            else { return acc }
            let pct = tx.effectiveSplits[userID] ?? 0
            return acc + (Decimal(tx.amount) * pct / 100)
        }
        var rounded = sum
        var src = sum
        NSDecimalRound(&rounded, &src, 0, .plain)
        return NSDecimalNumber(decimal: rounded).int64Value
    }

    // MARK: - Dashboard aggregations

    /// Sum of income transactions whose `date` falls inside the calendar
    /// month containing `referenceDate`. USD cents.
    func monthlyIncome(in calendar: Calendar = .current,
                       on referenceDate: Date = .now) -> Int64 {
        guard let interval = calendar.dateInterval(of: .month, for: referenceDate) else {
            return 0
        }
        return incomeTotal(in: interval)
    }

    /// Sum of expense transactions in the same calendar month. USD cents.
    func monthlyExpenses(in calendar: Calendar = .current,
                         on referenceDate: Date = .now) -> Int64 {
        guard let interval = calendar.dateInterval(of: .month, for: referenceDate) else {
            return 0
        }
        return expenseTotal(in: interval)
    }

    /// Sum of income transactions whose `date` falls inside an arbitrary
    /// interval. USD cents.
    func incomeTotal(in interval: DateInterval) -> Int64 {
        transactions.reduce(0) { acc, tx in
            guard tx.kind == .income, interval.contains(tx.date) else { return acc }
            return acc + tx.amount
        }
    }

    /// Sum of expense transactions whose `date` falls inside an arbitrary
    /// interval. USD cents.
    func expenseTotal(in interval: DateInterval) -> Int64 {
        transactions.reduce(0) { acc, tx in
            guard tx.kind == .expense, interval.contains(tx.date) else { return acc }
            return acc + tx.amount
        }
    }

    /// Sum of a single user's share of expense transactions inside the
    /// given interval. Uses `Transaction.effectiveSplits` like
    /// `monthlySpent(by:)`.
    func spent(by userID: User.ID, in interval: DateInterval) -> Int64 {
        let sum: Decimal = transactions.reduce(Decimal(0)) { acc, tx in
            guard tx.kind == .expense,
                  tx.ownerIDs.contains(userID),
                  interval.contains(tx.date)
            else { return acc }
            let pct = tx.effectiveSplits[userID] ?? 0
            return acc + (Decimal(tx.amount) * pct / 100)
        }
        var rounded = sum
        var src = sum
        NSDecimalRound(&rounded, &src, 0, .plain)
        return NSDecimalNumber(decimal: rounded).int64Value
    }

    /// Per-day expense totals (USD cents) for the trailing `days` days
    /// ending on `referenceDate`. Index 0 is the oldest day, last is today.
    /// Used by the daily-trend sparkline.
    func dailyExpenseCents(days: Int,
                           calendar: Calendar = .current,
                           on referenceDate: Date = .now) -> [Int64] {
        let today = calendar.startOfDay(for: referenceDate)
        var buckets: [Date: Int64] = [:]
        // Pre-seed every day so missing days render as 0.
        for offset in 0..<days {
            if let day = calendar.date(byAdding: .day, value: -(days - 1 - offset), to: today) {
                buckets[day] = 0
            }
        }
        for tx in transactions where tx.kind == .expense {
            let day = calendar.startOfDay(for: tx.date)
            if buckets[day] != nil {
                buckets[day, default: 0] += tx.amount
            }
        }
        return buckets.keys.sorted().map { buckets[$0] ?? 0 }
    }

    /// Total expense (USD cents) for one `TransactionCategory` over an
    /// arbitrary interval. Used by the budget-progress widget and the
    /// budget-status rule in `InsightEngine`.
    func categoryExpenseTotal(_ category: TransactionCategory,
                              in interval: DateInterval) -> Int64 {
        transactions.reduce(0) { acc, tx in
            guard tx.kind == .expense,
                  tx.category == category,
                  interval.contains(tx.date)
            else { return acc }
            return acc + tx.amount
        }
    }

    /// All expense transactions in a given category falling inside the
    /// interval, sorted newest first. Powers the expanded list in the
    /// Dashboard's Spend by Category card.
    func categoryExpenses(_ category: TransactionCategory,
                          in interval: DateInterval) -> [Transaction] {
        transactions
            .filter { $0.kind == .expense
                      && $0.category == category
                      && interval.contains($0.date) }
            .sorted { $0.date > $1.date }
    }

    /// Each expense in the interval that `userID` participated in, paired
    /// with their split-weighted share in USD cents. Sorted by date,
    /// newest first. Powers the expanded transaction list in the
    /// Dashboard's per-owner breakdown.
    func expenseShares(by userID: User.ID,
                       in interval: DateInterval)
        -> [(transaction: Transaction, shareCents: Int64)]
    {
        transactions
            .filter { $0.kind == .expense
                      && $0.ownerIDs.contains(userID)
                      && interval.contains($0.date) }
            .map { tx in
                let pct = tx.effectiveSplits[userID] ?? 0
                let raw = Decimal(tx.amount) * pct / 100
                var rounded = raw
                var src = raw
                NSDecimalRound(&rounded, &src, 0, .plain)
                let share = NSDecimalNumber(decimal: rounded).int64Value
                return (transaction: tx, shareCents: share)
            }
            .sorted { $0.transaction.date > $1.transaction.date }
    }

    /// Top N categories by total expense inside an arbitrary interval.
    /// Each entry returns the category + summed cents; sorted descending.
    func topCategoriesByExpense(in interval: DateInterval,
                                limit: Int = 5)
        -> [(category: TransactionCategory, cents: Int64)]
    {
        var totals: [TransactionCategory: Int64] = [:]
        for tx in transactions where tx.kind == .expense {
            guard interval.contains(tx.date) else { continue }
            totals[tx.category, default: 0] += tx.amount
        }
        return totals
            .sorted { $0.value > $1.value }
            .prefix(limit)
            .map { (category: $0.key, cents: $0.value) }
    }

    /// Top N merchants by total expense inside an arbitrary interval.
    /// Each entry includes the merchant name, summed cents, and count of
    /// visits.
    func topMerchantsByExpense(in interval: DateInterval,
                               limit: Int = 5)
        -> [(merchant: String, cents: Int64, count: Int)]
    {
        var totals: [String: (cents: Int64, count: Int)] = [:]
        for tx in transactions where tx.kind == .expense {
            guard interval.contains(tx.date) else { continue }
            var entry = totals[tx.merchant] ?? (cents: 0, count: 0)
            entry.cents += tx.amount
            entry.count += 1
            totals[tx.merchant] = entry
        }
        return totals
            .sorted { $0.value.cents > $1.value.cents }
            .prefix(limit)
            .map { (merchant: $0.key, cents: $0.value.cents, count: $0.value.count) }
    }

    /// Date of the oldest transaction in the store, or `nil` if none.
    /// Drives `availableRanges` so the Dashboard only offers ranges the
    /// data fully covers.
    var earliestTransactionDate: Date? {
        transactions.map(\.date).min()
    }

    /// Which `DashboardRange`s the current dataset can populate. A range
    /// is "available" when there's at least one transaction from
    /// `monthCount - 1` calendar months ago or earlier — i.e. the data
    /// spans the full window. `.thisMonth` is always available.
    var availableRanges: [DashboardRange] {
        let cal = Calendar.current
        guard let earliest = earliestTransactionDate else {
            return [.thisMonth]
        }
        let earliestStart = cal.startOfDay(for: earliest)
        let monthsBack = cal.dateComponents([.month], from: earliestStart, to: .now).month ?? 0
        return DashboardRange.allCases.filter { monthsBack >= $0.monthCount - 1 }
    }

    // MARK: - Cards

    private var cardsAPI: CardsAPI {
        CardsAPI(client: supabase)
    }

    func addCard(_ card: Card) {
        cards.append(card)
        guard !isInDemoMode else { return }
        Task {
            do {
                try await cardsAPI.create(card)
            } catch {
                await MainActor.run {
                    cards.removeAll { $0.id == card.id }
                    dataError = error.localizedDescription
                }
            }
        }
    }

    func deleteCard(_ card: Card) {
        cards.removeAll { $0.id == card.id }
        guard !isInDemoMode else { return }
        Task {
            do {
                try await cardsAPI.delete(id: card.id)
            } catch {
                await MainActor.run {
                    cards.append(card)
                    dataError = error.localizedDescription
                }
            }
        }
    }

    func loadCardsFromServer() async {
        do {
            let fetched = try await cardsAPI.fetch()
            await MainActor.run { cards = fetched }
        } catch {
            await MainActor.run { dataError = error.localizedDescription }
        }
    }

    // MARK: - Households

    /// The active household, or `nil` if the user has none.
    var currentHousehold: Household? {
        guard let id = currentHouseholdID else { return nil }
        return households.first { $0.id == id }
    }

    /// Rename the active household — optimistic local mutation, server sync,
    /// rollback on failure. No-op if no active household.
    func updateHouseholdName(_ name: String) {
        guard let id = currentHouseholdID,
              let idx = households.firstIndex(where: { $0.id == id })
        else { return }
        let previous = households[idx].name
        households[idx].name = name
        guard !isInDemoMode else { return }
        Task {
            do {
                try await householdsAPI.updateName(name, householdID: id)
            } catch {
                await MainActor.run {
                    if let i = households.firstIndex(where: { $0.id == id }) {
                        households[i].name = previous
                    }
                    dataError = error.localizedDescription
                }
            }
        }
    }

    /// Append a member to the active household. Used by the Add member flow.
    /// Note: the surface that called this (`HouseholdView` → `AddUserSheet`)
    /// is disabled until the Invitations flow lands, so this is currently
    /// unreachable from the UI. Kept for symmetry with the membership model.
    func addMemberToCurrentHousehold(_ userID: User.ID) {
        guard let id = currentHouseholdID,
              let idx = households.firstIndex(where: { $0.id == id })
        else { return }
        if !households[idx].memberIDs.contains(userID) {
            households[idx].memberIDs.append(userID)
        }
    }

    /// Remove a member from the active household — optimistic + server sync.
    /// The `User` record stays in `users` so existing transactions they
    /// participate in continue to resolve to a real name + palette. Caller
    /// is responsible for invariants (e.g. don't remove the last member).
    func removeMemberFromCurrentHousehold(_ userID: User.ID) {
        guard let id = currentHouseholdID,
              let idx = households.firstIndex(where: { $0.id == id })
        else { return }
        let previousMembers = households[idx].memberIDs
        households[idx].memberIDs.removeAll { $0 == userID }
        guard !isInDemoMode else { return }
        Task {
            do {
                try await householdsAPI.removeMember(userID: userID, from: id)
            } catch {
                await MainActor.run {
                    if let i = households.firstIndex(where: { $0.id == id }) {
                        households[i].memberIDs = previousMembers
                    }
                    dataError = error.localizedDescription
                }
            }
        }
    }

    /// Members of the active household, resolved against `users` in the
    /// household's `memberIDs` order. Falls back to all users when there's no
    /// active household (defensive — shouldn't happen in MVP).
    var householdMembers: [User] {
        guard let h = currentHousehold else { return users }
        return h.memberIDs.compactMap { id in users.first { $0.id == id } }
    }

    // MARK: - Properties

    private var propertiesAPI: PropertiesAPI {
        PropertiesAPI(client: supabase)
    }

    func addProperty(_ p: Property) {
        properties.append(p)
        guard !isInDemoMode else { return }
        Task {
            do {
                try await propertiesAPI.create(p)
            } catch {
                await MainActor.run {
                    properties.removeAll { $0.id == p.id }
                    dataError = error.localizedDescription
                }
            }
        }
    }

    func updateProperty(_ p: Property) {
        guard let idx = properties.firstIndex(where: { $0.id == p.id }) else { return }
        let previous = properties[idx]
        properties[idx] = p
        guard !isInDemoMode else { return }
        Task {
            do {
                try await propertiesAPI.update(p)
            } catch {
                await MainActor.run {
                    if let i = properties.firstIndex(where: { $0.id == p.id }) {
                        properties[i] = previous
                    }
                    dataError = error.localizedDescription
                }
            }
        }
    }

    func deleteProperty(_ p: Property) {
        // Snapshot for rollback. Local cascade mirrors the server's FK
        // cascade on `rental_payments.property_id`.
        let cascadedPayments = rentalPayments.filter { $0.propertyID == p.id }
        properties.removeAll { $0.id == p.id }
        rentalPayments.removeAll { $0.propertyID == p.id }
        guard !isInDemoMode else { return }
        Task {
            do {
                try await propertiesAPI.delete(id: p.id)
            } catch {
                await MainActor.run {
                    properties.append(p)
                    rentalPayments.append(contentsOf: cascadedPayments)
                    dataError = error.localizedDescription
                }
            }
        }
    }

    func loadPropertiesFromServer() async {
        do {
            let fetched = try await propertiesAPI.fetch()
            await MainActor.run { properties = fetched }
        } catch {
            await MainActor.run { dataError = error.localizedDescription }
        }
    }

    // MARK: - Rental payments

    private var rentalPaymentsAPI: RentalPaymentsAPI {
        RentalPaymentsAPI(client: supabase)
    }

    func addRentalPayment(_ payment: RentalPayment) {
        rentalPayments.append(payment)
        guard !isInDemoMode else { return }
        Task {
            do {
                try await rentalPaymentsAPI.create(payment)
            } catch {
                await MainActor.run {
                    rentalPayments.removeAll { $0.id == payment.id }
                    dataError = error.localizedDescription
                }
            }
        }
    }

    func deleteRentalPayment(_ payment: RentalPayment) {
        rentalPayments.removeAll { $0.id == payment.id }
        guard !isInDemoMode else { return }
        Task {
            do {
                try await rentalPaymentsAPI.delete(id: payment.id)
            } catch {
                await MainActor.run {
                    rentalPayments.append(payment)
                    dataError = error.localizedDescription
                }
            }
        }
    }

    func loadRentalPaymentsFromServer() async {
        do {
            let fetched = try await rentalPaymentsAPI.fetch()
            await MainActor.run { rentalPayments = fetched }
        } catch {
            await MainActor.run { dataError = error.localizedDescription }
        }
    }

    // MARK: - Budgets

    private var budgetsAPI: BudgetsAPI {
        BudgetsAPI(client: supabase)
    }

    /// Optimistic insert-or-update. The DB enforces `UNIQUE (household_id,
    /// category)`, so editing an existing budget keeps the same `id` and
    /// just changes `monthlyLimitCents`; a new category creates a fresh row.
    /// On rollback we restore the prior state by id (insert vs update both
    /// covered).
    func addOrUpdateBudget(_ budget: Budget) {
        let previous = budgets.first { $0.id == budget.id }
        if let idx = budgets.firstIndex(where: { $0.id == budget.id }) {
            budgets[idx] = budget
        } else {
            budgets.append(budget)
        }
        guard !isInDemoMode else { return }
        Task {
            do {
                try await budgetsAPI.upsert(budget)
            } catch {
                await MainActor.run {
                    if let previous {
                        if let i = budgets.firstIndex(where: { $0.id == budget.id }) {
                            budgets[i] = previous
                        }
                    } else {
                        budgets.removeAll { $0.id == budget.id }
                    }
                    dataError = error.localizedDescription
                }
            }
        }
    }

    func deleteBudget(_ budget: Budget) {
        budgets.removeAll { $0.id == budget.id }
        guard !isInDemoMode else { return }
        Task {
            do {
                try await budgetsAPI.delete(id: budget.id)
            } catch {
                await MainActor.run {
                    budgets.append(budget)
                    dataError = error.localizedDescription
                }
            }
        }
    }

    func loadBudgetsFromServer() async {
        do {
            let fetched = try await budgetsAPI.fetch()
            await MainActor.run { budgets = fetched }
        } catch {
            await MainActor.run { dataError = error.localizedDescription }
        }
    }

    /// The current budget for `category`, or `nil` if none has been set.
    func budget(for category: TransactionCategory) -> Budget? {
        budgets.first { $0.category == category }
    }

    /// Payments for a given property, newest first.
    func payments(for propertyID: Property.ID) -> [RentalPayment] {
        rentalPayments
            .filter { $0.propertyID == propertyID }
            .sorted { $0.date > $1.date }
    }

    // MARK: - Dummy data (DEBUG)

    #if DEBUG
    /// Replace every domain collection with the large dummy dataset and
    /// enter **demo mode** — every CRUD method now skips its server-sync
    /// Task, so the dummy UUIDs (Maya / Jordan / Alex / sample household)
    /// can't FK-violate against the real Supabase schema. User preferences
    /// (currency, appearance) are preserved. Call `exitDemoMode()` to
    /// restore real data from the server.
    func loadDummyData() {
        let bundle = DummyData.large
        users = bundle.users
        households = bundle.households
        cards = bundle.cards
        transactions = bundle.transactions
        properties = bundle.properties
        rentalPayments = bundle.rentalPayments
        budgets = []  // No demo budgets — exercises the empty-state path.
        currentUserID = bundle.users.first?.id ?? currentUserID
        currentHouseholdID = bundle.households.first?.id ?? currentHouseholdID
        isInDemoMode = true
    }

    /// Leave demo mode. Re-runs `bootstrapUserSession` against the current
    /// auth session so `currentUserID` snaps back to `auth.uid()`, the
    /// in-memory dummy data is wiped, and every server-backed collection
    /// is fetched fresh.
    func exitDemoMode() async {
        guard let session else {
            // No session means there's nothing to restore — just flip the
            // flag and clear the dummy data manually.
            await MainActor.run {
                isInDemoMode = false
                transactions = []
                cards = []
                properties = []
                rentalPayments = []
                budgets = []
            }
            return
        }
        // Force the bootstrap to re-run by clearing the auth-id guard.
        bootstrappedAuthID = nil
        await MainActor.run { isInDemoMode = false }
        await bootstrapUserSession(authID: session.user.id, email: session.user.email)
    }
    #endif

    // MARK: - FX rates

    /// Returns the cached/live rate when present, otherwise the hardcoded
    /// fallback. Always succeeds.
    func rate(for c: Currency) -> Decimal {
        fxRates[c] ?? c.fallbackRateFromUSD
    }

    /// Convenience: format a USD-cents amount in the current currency at
    /// the current rate. Used by every display call site.
    func formatMoney(_ cents: Int64, leadingPlus: Bool = false) -> String {
        Money.string(cents: cents,
                     currency: currency,
                     rate: rate(for: currency),
                     leadingPlus: leadingPlus)
    }

    /// Skip when the cache is fresh (< 24h); otherwise call `refreshRates`.
    func refreshRatesIfStale() async {
        if let last = ratesLastFetched,
           Date().timeIntervalSince(last) < Self.fxStaleAfter {
            return
        }
        await refreshRates()
    }

    // MARK: - Auth

    /// Step 1 of magic-link sign-in: ask Supabase to email the user a
    /// one-time code. UI advances to the code-entry state on success.
    func requestSignInCode(email: String) async {
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
        isAuthLoading = true
        authError = nil
        do {
            try await supabase.auth.signInWithOTP(email: trimmed)
            pendingSignInEmail = trimmed
            isAuthLoading = false
        } catch {
            authError = error.localizedDescription
            isAuthLoading = false
        }
    }

    /// Step 2: verify the 6-digit code from the email. On success the
    /// SDK persists the session in the keychain and our
    /// `observeAuthChanges()` listener updates `self.session`.
    func verifyCode(email: String, code: String) async {
        let trimmedCode = code.trimmingCharacters(in: .whitespacesAndNewlines)
        isAuthLoading = true
        authError = nil
        do {
            try await supabase.auth.verifyOTP(
                email: email,
                token: trimmedCode,
                type: .email
            )
            pendingSignInEmail = nil
            isAuthLoading = false
        } catch {
            authError = error.localizedDescription
            isAuthLoading = false
        }
    }

    /// Cancel the in-flight sign-in attempt and let the user enter a
    /// different email. Called from the "Use a different email" affordance
    /// in step 2.
    func resetSignInFlow() {
        pendingSignInEmail = nil
        authError = nil
    }

    func signOut() async {
        do {
            try await supabase.auth.signOut()
            // session will be cleared by the auth-state listener
        } catch {
            authError = error.localizedDescription
        }
    }

    /// Subscribe to auth state changes from the SDK. Call once from the
    /// app root's `.task`. The first event on subscription is the
    /// restored session (or `nil`), so this doubles as launch-time
    /// session restore.
    ///
    /// We drop expired sessions because supabase-swift's `INITIAL_SESSION`
    /// event currently fires with the locally stored session regardless
    /// of expiration. Treating an expired session as signed-in would let
    /// the user into the app but every server call would 401. See
    /// supabase-swift PR #822.
    func observeAuthChanges() async {
        for await (_, session) in supabase.auth.authStateChanges {
            if let session, session.isExpired {
                self.session = nil
            } else {
                if let session {
                    // Sync local user state first so RootTabView's first
                    // render after the auth gate flips sees a valid
                    // `currentUserID`.
                    ensureCurrentUser(authID: session.user.id,
                                      email: session.user.email)
                }
                self.session = session
            }
        }
    }

    /// One-shot guard so we only run the server bootstrap once per app
    /// launch per signed-in identity. Auth state events can fire repeatedly
    /// (e.g. session refresh) — without this we'd thrash the server.
    @ObservationIgnored
    private var bootstrappedAuthID: UUID?

    /// Make sure `currentUserID` points at the signed-in user, then kick
    /// off the server bootstrap in the background. Idempotent: subsequent
    /// emissions for the same auth ID are no-ops.
    ///
    /// The bootstrap (1) upserts `public.users` so the `transactions.created_by`
    /// FK can resolve, (2) finds or creates a default household so
    /// shared-scope transactions have a valid `household_id`, and (3)
    /// replaces the in-memory sample data with the server's view (the
    /// hardcoded sample UUIDs don't match `auth.uid()` and just confuse
    /// queries / FK constraints).
    private func ensureCurrentUser(authID: UUID, email: String?) {
        currentUserID = authID
        guard bootstrappedAuthID != authID else { return }
        bootstrappedAuthID = authID
        Task { [authID, email] in
            await bootstrapUserSession(authID: authID, email: email)
        }
    }

    private var householdsAPI: HouseholdsAPI {
        HouseholdsAPI(client: supabase)
    }

    private func bootstrapUserSession(authID: UUID, email: String?) async {
        let displayName = email?
            .components(separatedBy: "@").first?
            .capitalized ?? "Me"
        let initial = String(displayName.prefix(1)).uppercased()
        let me = User(
            id: authID,
            name: displayName,
            initial: initial,
            colorKey: "sage"
        )

        await MainActor.run {
            isLoadingInitialData = true
            // Defensive: any prior demo-mode state must clear before real
            // server data lands, otherwise the new transactions would be
            // gated from server sync as if they were demo.
            isInDemoMode = false
        }

        do {
            // 1. Upsert public.users — `transactions.created_by` FK needs this.
            try await supabase
                .from("users")
                .upsert(me, onConflict: "id")
                .execute()

            // 2. Find or create the user's default household via HouseholdsAPI.
            let (householdID, householdName) = try await householdsAPI
                .findOrCreate(for: authID)

            // 3. Replace in-memory sample data with the server's view. The
            // sample UUIDs (`User.mayaSample.id`, `Household.homeSample.id`)
            // don't exist on the server — leaving them in place causes FK
            // failures on every insert/update.
            let household = Household(
                id: householdID,
                name: householdName,
                memberIDs: [authID]
            )
            await MainActor.run {
                users = [me]
                households = [household]
                currentHouseholdID = householdID
                transactions = []
                cards = []
                properties = []
                rentalPayments = []
                budgets = []
            }

            // 4. Load live data from the server.
            await loadAllFromServer()
            await MainActor.run { isLoadingInitialData = false }
        } catch {
            await MainActor.run {
                dataError = "Bootstrap failed: \(error.localizedDescription)"
                isLoadingInitialData = false
                // Allow a retry on the next auth event (e.g. relaunch).
                bootstrappedAuthID = nil
            }
        }
    }

    /// One-shot fetch from floatrates.com + decode + cache. On failure, sets
    /// `ratesError` but leaves any previously cached rates in place so the
    /// app keeps working.
    func refreshRates() async {
        await MainActor.run { self.ratesIsLoading = true; self.ratesError = nil }
        do {
            let (data, _) = try await URLSession.shared.data(from: Self.fxURL)
            let decoded = try JSONDecoder().decode([String: FloatRate].self, from: data)

            var next: [Currency: Decimal] = [.usd: 1]
            for c in Currency.allCases where c != .usd {
                if let entry = decoded[c.rawValue] {
                    next[c] = Decimal(entry.rate)
                }
            }

            // Encode for cache: store only the currencies we support, keyed
            // by uppercase ISO code, as Double for JSON round-trippability.
            var cacheDict: [String: Double] = [:]
            for (k, v) in next where k != .usd {
                cacheDict[k.code] = NSDecimalNumber(decimal: v).doubleValue
            }
            let cacheData = try JSONEncoder().encode(cacheDict)

            let fetchedAt = Date()
            await MainActor.run {
                self.fxRates = next
                self.ratesLastFetched = fetchedAt
                self.ratesError = nil
                self.ratesIsLoading = false
                UserDefaults.standard.set(cacheData, forKey: Self.fxRatesKey)
                UserDefaults.standard.set(fetchedAt.timeIntervalSince1970,
                                          forKey: Self.fxRatesFetchedAtKey)
            }
        } catch {
            await MainActor.run {
                self.ratesError = error.localizedDescription
                self.ratesIsLoading = false
            }
        }
    }
}

// MARK: - FX decode shape

private struct FloatRate: Decodable {
    let code: String
    let rate: Double
}

