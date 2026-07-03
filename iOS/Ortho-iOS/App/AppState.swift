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

    /// Where launch-time auth resolution stands. The gate in `Ortho_iOSApp`
    /// renders a neutral launch view while `.launching` so a valid stored
    /// session never flashes the sign-in screen before the SDK's first auth
    /// event arrives. Resolves to `.signedIn` / `.signedOut` once the first
    /// `authStateChanges` emission is handled (with expired sessions
    /// refreshed, not dropped).
    enum AuthPhase { case launching, signedIn, signedOut }
    var authPhase: AuthPhase = .launching

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

    /// True when `bootstrapUserSession` failed and left us signed-in with no
    /// usable household (empty data, nil `currentHouseholdID`). Drives the
    /// "Couldn't finish setup — Retry" state; cleared on a successful retry.
    /// Add-card / Add-property are disabled while a household isn't resolved.
    var bootstrapDidFail: Bool = false

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

    /// The household's people — the account holder plus anyone added by name.
    /// Owners of transactions are People. Server-backed (`household_people`);
    /// no on-device persistence. Includes soft-removed people for history.
    var people: [Person] = []

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

    /// User-selected dashboard time range, remembered across launches.
    /// Setting a relative range is mutually exclusive with a specific-month
    /// selection — assigning here clears `dashboardSelectedMonth`.
    var dashboardRange: DashboardRange {
        didSet {
            UserDefaults.standard.set(dashboardRange.rawValue, forKey: Self.dashboardRangeKey)
            // Mutual exclusivity: choosing a relative range returns to the
            // anchored-to-now view and drops any transient month override.
            if dashboardSelectedMonth != nil { dashboardSelectedMonth = nil }
        }
    }

    /// Transient specific-month override of `dashboardRange` (`'YYYY-MM'`),
    /// or `nil` for the relative range. **Not persisted** — a relaunch always
    /// returns to the persisted `dashboardRange`. When non-nil it wins:
    /// `activeInterval`/`referenceDate` resolve to the selected month. Always a
    /// member of `availableMonths` when set (set only via the month control).
    var dashboardSelectedMonth: String? = nil

    /// Live rates fetched from floatrates.com. Empty until first successful
    /// fetch — `rate(for:)` falls back to `Currency.fallbackRateFromUSD` in
    /// that case.
    var fxRates: [Currency: Decimal] = [:]
    var ratesLastFetched: Date?
    var ratesIsLoading: Bool = false
    var ratesError: String?

    private static let currencyKey = "currency"
    private static let dashboardRangeKey = "dashboardRange"
    private static let fxRatesKey = "fxRates"
    private static let fxRatesFetchedAtKey = "fxRatesFetchedAt"
    private static let fxStaleAfter: TimeInterval = 24 * 60 * 60
    private static let fxURL = URL(string: "https://www.floatrates.com/daily/usd.json")!

    // MARK: - UI demo (DEBUG launch arguments — see docs/ios.md §6)

    #if DEBUG
    /// True when launched with `-uiDemo`: the sample store is local-only;
    /// optimistic writes must never hop to the (dummy-configured) server.
    var isUIDemoSession = false
    /// `-uiDemoScan <fixture>` / `-uiDemoScanStep <step>` (spec 014): feed a
    /// bundled fixture through the real scan pipeline for CI screenshots.
    var uiDemoScanFixture: String?
    var uiDemoScanStep: String?
    /// Fixed "now" for demo scan parsing — fixtures and their expected
    /// duplicates are pinned to calendar days around this date.
    static let uiDemoScanReferenceDate: Date = {
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        return utc.date(from: DateComponents(year: 2026, month: 7, day: 3, hour: 12)) ?? .now
    }()
    #endif

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

        // Restore persisted dashboard range.
        let savedRange = UserDefaults.standard.string(forKey: Self.dashboardRangeKey)
            .flatMap(DashboardRange.init(rawValue:)) ?? .thisMonth
        self.dashboardRange = savedRange

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
    }

    // MARK: - User helpers

    /// Resolve an owner id to its display fields. People are the real owners;
    /// `users` is a fallback for the sample/demo state (which seeds `users`,
    /// not `people`). Returns `User.placeholder` when neither matches.
    func user(_ id: User.ID) -> User {
        if let p = people.first(where: { $0.id == id }) { return p.asUser }
        if let u = users.first(where: { $0.id == id }) { return u }
        return .placeholder
    }

    func addUser(_ user: User) {
        users.append(user)
    }

    /// Active (non-removed) people, in display order.
    var activePeople: [Person] {
        people.filter { $0.removedAt == nil }.sorted { $0.sortOrder < $1.sortOrder }
    }

    /// The current account holder's Person id (default transaction owner).
    var currentPersonID: Person.ID? {
        people.first { $0.linkedUserID == currentUserID }?.id
    }

    // MARK: - People (household members)

    func addPerson(name: String, colorKey: String = "sage") {
        guard let householdID = currentHouseholdID else { return }
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        let person = Person(
            householdID: householdID,
            name: trimmed,
            initial: String(trimmed.prefix(1)).uppercased(),
            colorKey: colorKey,
            linkedUserID: nil,
            sortOrder: people.count
        )
        people.append(person)
        Task {
            do { try await householdsAPI.createPerson(person) }
            catch { await MainActor.run { people.removeAll { $0.id == person.id }; dataError = error.localizedDescription } }
        }
    }

    func renamePerson(_ id: Person.ID, name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty, let idx = people.firstIndex(where: { $0.id == id }) else { return }
        let previous = people[idx]
        people[idx].name = trimmed
        people[idx].initial = String(trimmed.prefix(1)).uppercased()
        let updated = people[idx]
        Task {
            do { try await householdsAPI.updatePerson(updated) }
            catch { await MainActor.run { if let i = people.firstIndex(where: { $0.id == id }) { people[i] = previous }; dataError = error.localizedDescription } }
        }
    }

    /// Recolor an existing person. Optimistic local update with rollback on
    /// failure, persisted via `updatePerson` — mirrors `renamePerson`. Web
    /// has the same capability (setPersonColor); this brings iOS to parity.
    func setPersonColor(_ id: Person.ID, colorKey: String) {
        guard let idx = people.firstIndex(where: { $0.id == id }) else { return }
        let previous = people[idx]
        people[idx].colorKey = colorKey
        let updated = people[idx]
        Task {
            do { try await householdsAPI.updatePerson(updated) }
            catch { await MainActor.run { if let i = people.firstIndex(where: { $0.id == id }) { people[i] = previous }; dataError = error.localizedDescription } }
        }
    }

    func removePerson(_ id: Person.ID) {
        guard let idx = people.firstIndex(where: { $0.id == id }) else { return }
        let previous = people[idx]
        people[idx].removedAt = Date()
        let updated = people[idx]
        Task {
            do { try await householdsAPI.updatePerson(updated) }
            catch { await MainActor.run { if let i = people.firstIndex(where: { $0.id == id }) { people[i] = previous }; dataError = error.localizedDescription } }
        }
    }

    func resolveOwners(of tx: Transaction) -> [User] {
        tx.ownerIDs.map { user($0) }
    }

    /// The owners of `tx` (resolved to current members) plus a comma-joined
    /// label, for the transaction row. Mirrors web's `TransactionRow`: real
    /// member avatars (single or stacked for splits), never a synthetic
    /// "Shared" chip. An owner-less transaction falls back to a single
    /// `.placeholder` so the row always has something to render.
    func ownersDisplay(of tx: Transaction) -> (owners: [User], label: String) {
        let owners = resolveOwners(of: tx)
        guard !owners.isEmpty else { return ([.placeholder], "—") }
        return (owners, owners.map(\.name).joined(separator: ", "))
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
        var tx = tx
        // Default the payer of an expense to the current person when the caller
        // didn't set one — the everyday "I entered and paid it" case needs no
        // extra step. Income/transfer keep whatever the caller supplied
        // (transfers always carry an explicit sender; income stays nil).
        if tx.kind == .expense, tx.paidBy == nil {
            tx.paidBy = currentPersonID
        }
        transactions.append(tx)
        #if DEBUG
        // Demo sessions are local-only — a sync against the dummy config
        // would fail and roll the row back mid-screenshot (spec 014 wizard).
        if isUIDemoSession { return }
        #endif
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
        #if DEBUG
        if isUIDemoSession { return }  // demo sessions are local-only
        #endif
        Task {
            do {
                try await transactionsAPI.update(tx, previous: previous)
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
        #if DEBUG
        if isUIDemoSession { return }  // demo sessions are local-only
        #endif
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
        // created_by (auth UUID) → the creator's linked Person id, so a
        // share-less legacy/defensive row resolves to the same identity as on
        // web (web/lib/store.tsx `personForUser`). Auth UUIDs are never
        // Person ids, so without this mapping such rows count toward nobody
        // in owner filters / per-person totals / balances on iOS.
        var linkedPersonByUser: [UUID: Person.ID] = [:]
        for p in people {
            if let uid = p.linkedUserID, linkedPersonByUser[uid] == nil {
                linkedPersonByUser[uid] = p.id
            }
        }
        do {
            let fetched = try await transactionsAPI.fetch(linkedPersonByUser: linkedPersonByUser)
            await MainActor.run { transactions = fetched }
        } catch {
            await MainActor.run { dataError = error.localizedDescription }
        }
    }

    /// Pull every server-backed collection (transactions, cards, properties
    /// + housing sub-tables, rental payments) and replace the in-memory copy.
    /// Used by bootstrap + the Developer "Sync all from server" affordance.
    /// People load FIRST (not in the parallel group) because the transactions
    /// rehydrate maps share-less rows onto the creator's linked Person —
    /// web achieves the same ordering by building `personForUser` from the
    /// people rows of one batched load.
    func loadAllFromServer() async {
        await loadPeopleFromServer()
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.loadTransactionsFromServer() }
            group.addTask { await self.loadCardsFromServer() }
            group.addTask { await self.loadPropertiesFromServer() }
            group.addTask { await self.loadRentalPaymentsFromServer() }
            group.addTask { await self.loadBudgetsFromServer() }
        }
    }

    /// Ensure the account holder has a Person row, then load the household's people.
    func loadPeopleFromServer() async {
        guard let householdID = currentHouseholdID else { return }
        // Best-effort: make sure the account holder has a Person row. A failure
        // here must NOT block loading the (often already-present) people list —
        // otherwise one bad call leaves `people` empty and every owner renders
        // as the "Removed" placeholder.
        let me = users.first { $0.id == currentUserID }
        try? await householdsAPI.ensureAccountPerson(householdID: householdID,
                                                     userID: currentUserID,
                                                     name: me?.name ?? "Me",
                                                     initial: me?.initial ?? "M",
                                                     colorKey: me?.colorKey ?? "sage")
        do {
            let fetched = try await householdsAPI.fetchPeople(householdID: householdID)
            await MainActor.run { people = fetched }
        } catch {
            await MainActor.run { dataError = error.localizedDescription }
        }
    }

    var groups: [TransactionGroup] {
        TransactionGroup.group(transactions)
    }

    // MARK: - Member balances (reimbursement / settle-up)

    /// Net cents owed between the current person and `other` (positive ⇒ `other`
    /// owes you). Pure, golden-vector-locked — see `Balances.swift`.
    func balance(with other: Person.ID) -> Int64 {
        guard let me = currentPersonID else { return 0 }
        return balanceBetween(viewer: me, other: other, transactions: transactions)
    }

    /// Per-other-member net balance for the current person. Positive ⇒ they owe
    /// you. Drives the balance line + Settle-up in the transactions section.
    ///
    /// Iterates over EVERY distinct counterparty that actually appears in
    /// transactions — not just `activePeople` — so a removed member you still
    /// owe (or who still owes you) stays visible and settleable. Names resolve
    /// via `user(_:)`, which looks up removed people too. Only non-zero balances
    /// are returned. (Web applies the identical fix to BalanceSummary.)
    var memberBalances: [(person: User, net: Int64)] {
        guard let me = currentPersonID else { return [] }

        // Collect counterparties from payers, owners, and transfer recipients.
        var counterpartyIDs: Set<Person.ID> = []
        for tx in transactions {
            if let payer = tx.paidBy { counterpartyIDs.insert(payer) }
            counterpartyIDs.formUnion(tx.ownerIDs)
        }
        counterpartyIDs.remove(me)

        return counterpartyIDs
            .map { id -> (person: User, net: Int64) in
                (person: user(id),
                 net: balanceBetween(viewer: me, other: id, transactions: transactions))
            }
            .filter { $0.net != 0 }
            // Locale-aware collation, matching web's `localeCompare` sort in
            // BalanceSummary (a plain `<` compares Unicode scalars and orders
            // accented/localized names differently).
            .sorted { $0.person.name.localizedStandardCompare($1.person.name) == .orderedAscending }
    }

    /// Sum (USD cents) of this user's share of all expense transactions whose
    /// `date` falls inside the calendar month containing `referenceDate`.
    /// Solo expenses count fully; multi-owner expenses contribute
    /// Sum of this person's exact cents shares of their expenses this month.
    func monthlySpent(
        by personID: Person.ID,
        in calendar: Calendar = .current,
        on referenceDate: Date = .now
    ) -> Int64 {
        let interval = calendar.dateInterval(of: .month, for: referenceDate)
        return transactions.reduce(Int64(0)) { acc, tx in
            // Half-open [start, end) to match web + monthBounds (DateInterval's
            // own `contains` is CLOSED and would double-count a tx landing at
            // the exact next-month midnight).
            let inInterval = interval.map { tx.date >= $0.start && tx.date < $0.end } ?? true
            guard tx.kind == .expense,
                  tx.ownerIDs.contains(personID),
                  inInterval
            else { return acc }
            return acc + (tx.effectiveShares[personID] ?? 0)
        }
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
            guard tx.kind == .income,
                  tx.date >= interval.start, tx.date < interval.end
            else { return acc }
            return acc + tx.amount
        }
    }

    /// Sum of expense transactions whose `date` falls inside an arbitrary
    /// interval. USD cents.
    func expenseTotal(in interval: DateInterval) -> Int64 {
        transactions.reduce(0) { acc, tx in
            guard tx.kind == .expense,
                  tx.date >= interval.start, tx.date < interval.end
            else { return acc }
            return acc + tx.amount
        }
    }

    /// Sum of a single person's exact cents shares of expenses in the interval.
    func spent(by personID: Person.ID, in interval: DateInterval) -> Int64 {
        transactions.reduce(Int64(0)) { acc, tx in
            guard tx.kind == .expense,
                  tx.ownerIDs.contains(personID),
                  tx.date >= interval.start, tx.date < interval.end
            else { return acc }
            return acc + (tx.effectiveShares[personID] ?? 0)
        }
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
                  tx.date >= interval.start, tx.date < interval.end
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
                      && $0.date >= interval.start && $0.date < interval.end }
            .sorted { $0.date > $1.date }
    }

    /// Each expense in the interval that `personID` owns, paired with their
    /// exact cents share. Sorted by date, newest first. Powers the expanded
    /// transaction list in the Dashboard's per-owner breakdown.
    func expenseShares(by personID: Person.ID,
                       in interval: DateInterval)
        -> [(transaction: Transaction, shareCents: Int64)]
    {
        transactions
            .filter { $0.kind == .expense
                      && $0.ownerIDs.contains(personID)
                      && $0.date >= interval.start && $0.date < interval.end }
            .map { tx in (transaction: tx, shareCents: tx.effectiveShares[personID] ?? 0) }
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
            guard tx.date >= interval.start, tx.date < interval.end else { continue }
            totals[tx.category, default: 0] += tx.amount
        }
        // Secondary key: category id ascending. Dictionary iteration order is
        // randomized per process, so without a deterministic tie-break,
        // equal-cents categories could shuffle between launches (and against
        // web) right at the top-5 cutoff.
        return totals
            .sorted {
                if $0.value != $1.value { return $0.value > $1.value }
                return $0.key.rawValue < $1.key.rawValue
            }
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
            guard tx.date >= interval.start, tx.date < interval.end else { continue }
            var entry = totals[tx.merchant] ?? (cents: 0, count: 0)
            entry.cents += tx.amount
            entry.count += 1
            totals[tx.merchant] = entry
        }
        // Secondary key: merchant name ascending — deterministic tie order
        // across launches (Dictionary iteration order is randomized).
        return totals
            .sorted {
                if $0.value.cents != $1.value.cents { return $0.value.cents > $1.value.cents }
                return $0.key < $1.key
            }
            .prefix(limit)
            .map { (merchant: $0.key, cents: $0.value.cents, count: $0.value.count) }
    }

    /// Date of the oldest transaction in the store, or `nil` if none.
    /// Drives `availableRanges` so the Dashboard only offers ranges the
    /// data fully covers.
    var earliestTransactionDate: Date? {
        transactions.map(\.date).min()
    }

    /// Which `DashboardRange`s the current dataset can populate. Delegates
    /// to the pure, golden-vectored `DashboardRange.available` (spec 013 —
    /// see Features/Dashboard/DashboardRange.swift).
    var availableRanges: [DashboardRange] {
        DashboardRange.available(for: transactions)
    }

    // MARK: - Dashboard scope (relative range + transient selected month)

    /// Distinct calendar months (`'YYYY-MM'`, newest first) the data spans —
    /// the set the month control may navigate. Parity-locked via
    /// `availableMonths(_:)` (DashboardRange.swift). Empty for a fresh account.
    var dashboardAvailableMonths: [String] {
        availableMonths(transactions)
    }

    /// The dashboard's active window. `dashboardSelectedMonth` wins when set
    /// (its UTC `monthBounds`); otherwise the persisted relative range
    /// anchored to now. Threaded into every month-aware card. Delegates to the
    /// pure, unit-tested `dashboardScopeInterval`.
    var activeInterval: DateInterval {
        dashboardScopeInterval(range: dashboardRange, selectedMonth: dashboardSelectedMonth)
    }

    /// Reference date for Budget/Insights. When a month is selected it's the
    /// 15th-at-noon-UTC of that month (so each platform's calendar math lands
    /// on the selected month); otherwise `now`.
    var dashboardReferenceDate: Date {
        dashboardScopeReferenceDate(selectedMonth: dashboardSelectedMonth)
    }

    /// Select a specific month (transient override). Ignores months not in the
    /// available set so `dashboardSelectedMonth` stays a valid member.
    func selectDashboardMonth(_ yyyymm: String) {
        guard dashboardAvailableMonths.contains(yyyymm) else { return }
        dashboardSelectedMonth = yyyymm
    }

    /// Return to the relative range view ("Latest") — clears the month override
    /// without touching the persisted `dashboardRange`.
    func clearDashboardMonth() {
        dashboardSelectedMonth = nil
    }

    // MARK: - Cards

    private var cardsAPI: CardsAPI {
        CardsAPI(client: supabase)
    }

    func addCard(_ card: Card) {
        cards.append(card)
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

    /// The household's people as display Users (active, in order) — the one
    /// owner list used by pickers and the dashboard. Falls back to `users` for
    /// the sample/demo state, which seeds `users` rather than `people`.
    var householdMembers: [User] {
        let active = activePeople
        return active.isEmpty ? users : active.map { $0.asUser }
    }

    // MARK: - Properties

    private var propertiesAPI: PropertiesAPI {
        PropertiesAPI(client: supabase)
    }

    func addProperty(_ p: Property) {
        properties.append(p)
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

    /// Step 2: verify the 8-digit code from the email. On success the
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
        } catch {
            await MainActor.run { authError = error.localizedDescription }
        }
        // Full local teardown regardless of the network result: clear every
        // domain collection, the current-household selection, and the
        // one-shot bootstrap marker so the next sign-in re-bootstraps from
        // the server and no prior-account data lingers in memory.
        await MainActor.run {
            session = nil
            authPhase = .signedOut
            bootstrappedAuthID = nil
            users = []
            people = []
            households = []
            transactions = []
            cards = []
            properties = []
            rentalPayments = []
            budgets = []
            currentHouseholdID = nil
        }
    }

    /// Subscribe to auth state changes from the SDK. Call once from the
    /// app root's `.task`. The first event on subscription is the restored
    /// session (or `nil`), so this doubles as launch-time session restore.
    /// Until that first event resolves, `authPhase` stays `.launching` and
    /// the gate shows a neutral launch view — never the sign-in screen.
    func observeAuthChanges() async {
        for await (_, session) in supabase.auth.authStateChanges {
            await resolveAuth(session)
        }
    }

    /// Apply one auth-state emission and resolve the launch gate. An expired
    /// but restorable session is REFRESHED rather than dropped — dropping it
    /// signs out a user who still has a valid refresh token (the "lands on
    /// Sign In with empty data" bug). We only fall to `.signedOut` when the
    /// refresh genuinely fails (revoked / expired refresh token) or there is
    /// no session at all.
    private func resolveAuth(_ session: Session?) async {
        guard let session else {
            await MainActor.run {
                self.session = nil
                self.authPhase = .signedOut
            }
            return
        }
        if session.isExpired {
            do {
                let refreshed = try await supabase.auth.refreshSession()
                await applySignedIn(refreshed)
            } catch {
                await MainActor.run {
                    self.session = nil
                    self.authPhase = .signedOut
                }
            }
            return
        }
        await applySignedIn(session)
    }

    private func applySignedIn(_ session: Session) async {
        await MainActor.run {
            // Sync currentUserID before the gate flips so the first
            // signed-in render sees a valid identity, then kick off the
            // server bootstrap.
            self.ensureCurrentUser(authID: session.user.id, email: session.user.email)
            self.session = session
            self.authPhase = .signedIn
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
            bootstrapDidFail = false
        }

        do {
            // 1. Ensure a public.users profile row exists — the
            // `transactions.created_by` FK needs it. Insert-if-absent only
            // (`ignoreDuplicates` → ON CONFLICT DO NOTHING): overwriting on
            // every sign-in made the derived name/created_at flip-flop
            // between platforms. Web applies the same insert-only rule.
            try await supabase
                .from("users")
                .upsert(me, onConflict: "id", ignoreDuplicates: true)
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

            // No single-active-platform lock (feature 010): iOS and web may be
            // signed in at once. The 30-day session cap is enforced server-side
            // by the Supabase session timebox.
            await MainActor.run { isLoadingInitialData = false }
        } catch {
            await MainActor.run {
                dataError = "Bootstrap failed: \(error.localizedDescription)"
                isLoadingInitialData = false
                // Surface the in-app "Couldn't finish setup — Retry" state and
                // allow a retry on the next auth event (e.g. relaunch).
                bootstrapDidFail = true
                bootstrappedAuthID = nil
            }
        }
    }

    /// Re-run the bootstrap after a failure. Driven by the "Retry" button in
    /// the bootstrap-recovery state. No-op if there's no signed-in session.
    func retryBootstrap() async {
        guard let session else { return }
        bootstrappedAuthID = nil
        await bootstrapUserSession(authID: session.user.id, email: session.user.email)
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

