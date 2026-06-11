import Foundation

#if DEBUG

/// One-off importer for the user's legacy finance app JSON export.
///
/// Triggered from a DEBUG-only button in `SettingsView`. Reads
/// `Resources/legacy-import.json` from the bundle, maps each entry to an
/// Ortho `Transaction` / `Card`, and inserts via the same APIs the rest of
/// the app uses (`TransactionsAPI.create`, `CardsAPI.create`).
///
/// This file (along with the bundled JSON and the Settings button) is
/// **scheduled for deletion** as soon as the import has been run once and
/// the data is verified on device. Keep changes self-contained — no other
/// production code should call into here.
///
/// Mapping rules:
/// - Owner "Ayaz Uddin"    → current signed-in user (`appState.currentUserID`)
/// - Owner "Tasnuva Ahmed" → first matching `LocalUser` (Tasnuva is a
///   device-only LocalUser, not a real Ortho member — she can't appear in
///   `transaction_shares` because of the FK to `auth.users.id`).
/// - Owner "House"         → 50/50 between Ayaz and the Tasnuva LocalUser.
/// - **All imported transactions land in `.personal` scope** with
///   `householdID = nil`, `createdBy = ayazID`. Server-side, only Ayaz's
///   UUID is stored (no `transaction_shares` rows). Locally we still
///   populate `ownerIDs` + `splits` so attribution is correct in the UI
///   right after import. The next "Sync all from server" will rehydrate
///   `ownerIDs = [createdBy]` only — the LocalUser association is
///   device-only and gets shed on sync. Accepted trade-off.
/// - Categories: hierarchical "Parent > Sub" strings flattened to the 11
///   existing `TransactionCategory` cases via a lookup table.
/// - Dates: parsed as 12:00 noon America/New_York.
/// - All amounts are USD; stored as `Int64` cents.
struct LegacyImporter {

    // MARK: - Public surface

    struct Report {
        var cardsCreated: Int = 0
        var expensesImported: Int = 0
        var incomeImported: Int = 0
        var skipped: [Skip] = []
    }

    struct Skip {
        let rowID: String
        let reason: String
    }

    enum ImportError: LocalizedError {
        case bundleResourceMissing
        case householdNotReady(String)
        case decodingFailed(String)

        var errorDescription: String? {
            switch self {
            case .bundleResourceMissing:
                return "legacy-import.json is not bundled in the app."
            case .householdNotReady(let reason):
                return "Household isn't ready: \(reason)"
            case .decodingFailed(let detail):
                return "JSON decoding failed: \(detail)"
            }
        }
    }

    /// Runs the import. When `dryRun` is true, no Supabase writes happen —
    /// counts and skip reasons are still computed so the user can preview
    /// what would land in the live household.
    @MainActor
    static func run(appState: AppState, dryRun: Bool) async throws -> Report {
        // 1. Load + decode bundled JSON.
        guard let url = Bundle.main.url(forResource: "legacy-import", withExtension: "json") else {
            throw ImportError.bundleResourceMissing
        }
        let data = try Data(contentsOf: url)
        let dataset: LegacyDataset
        do {
            dataset = try JSONDecoder().decode(LegacyDataset.self, from: data)
        } catch {
            throw ImportError.decodingFailed(String(describing: error))
        }

        // 2. Resolve users + household. We need:
        //   - Ayaz = current signed-in user (createdBy on every row).
        //   - Tasnuva = a LocalUser on this device. She isn't an Ortho member,
        //     so this is the only place she can live. If the user hasn't
        //     added her yet, fail fast with a clear message.
        //   - currentHouseholdID is needed for Card creation (cards are
        //     household-scoped server-side), even though transactions stay
        //     personal (householdID = nil).
        let ayazID = appState.currentUserID
        guard let householdID = appState.currentHouseholdID else {
            throw ImportError.householdNotReady("no active household.")
        }
        guard let tasnuvaLocal = Self.findTasnuva(in: appState.localUsers) else {
            throw ImportError.householdNotReady(
                "Tasnuva isn't on this device yet. Go to Settings → Household → Add user to create her as a Local user, then re-run."
            )
        }
        let tasnuvaID = tasnuvaLocal.id

        var report = Report()

        // 3. Cards — create one per `cardSources` entry that isn't already
        // present (matched by human-readable name).
        let cardsAPI = CardsAPI(client: appState.supabase)
        let existingCardNames = Set(appState.cards.map(\.name))
        var cardNamesSeen: Set<String> = existingCardNames
        for source in dataset.cardSources {
            let name = Self.cardName(for: source)
            guard !cardNamesSeen.contains(name) else { continue }
            cardNamesSeen.insert(name)
            let card = Card(householdID: householdID, name: name)
            if !dryRun {
                do {
                    try await cardsAPI.create(card)
                    appState.cards.append(card)
                } catch {
                    report.skipped.append(Skip(rowID: "card:\(name)", reason: String(describing: error)))
                    continue
                }
            }
            report.cardsCreated += 1
        }

        // 4. Expenses — sequential to avoid RLS / rate-limit races.
        let transactionsAPI = TransactionsAPI(client: appState.supabase)
        for expense in dataset.expenses {
            do {
                let tx = try Self.buildTransaction(
                    from: expense,
                    kind: .expense,
                    ayazID: ayazID,
                    tasnuvaID: tasnuvaID
                )
                if !dryRun {
                    try await transactionsAPI.create(tx)
                    appState.transactions.append(tx)
                }
                report.expensesImported += 1
            } catch let err as MappingError {
                report.skipped.append(Skip(rowID: expense.id, reason: err.reason))
            } catch {
                report.skipped.append(Skip(rowID: expense.id, reason: String(describing: error)))
            }
        }

        // 5. Income — same pattern, but no allocation field; owner is
        // either Ayaz, Tasnuva, or "House" (rental income).
        for income in dataset.income {
            do {
                let tx = try Self.buildIncomeTransaction(
                    from: income,
                    ayazID: ayazID,
                    tasnuvaID: tasnuvaID
                )
                if !dryRun {
                    try await transactionsAPI.create(tx)
                    appState.transactions.append(tx)
                }
                report.incomeImported += 1
            } catch let err as MappingError {
                report.skipped.append(Skip(rowID: income.id, reason: err.reason))
            } catch {
                report.skipped.append(Skip(rowID: income.id, reason: String(describing: error)))
            }
        }

        return report
    }

    // MARK: - Mapping

    private struct MappingError: Error {
        let reason: String
    }

    private static func buildTransaction(
        from row: LegacyDataset.Expense,
        kind: TransactionKind,
        ayazID: User.ID,
        tasnuvaID: User.ID
    ) throws -> Transaction {
        let allocation = row.allocation ?? []

        // Resolve named owners into IDs. "House" → distribute across both;
        // unknown names → drop the slice.
        let expand: (String, Decimal) -> [(User.ID, Decimal)] = { name, pct in
            switch name {
            case "Ayaz Uddin":    return [(ayazID, pct)]
            case "Tasnuva Ahmed": return [(tasnuvaID, pct)]
            case "House":         return [(ayazID, pct / 2), (tasnuvaID, pct / 2)]
            default:              return []
            }
        }

        // Build a percentage dict from the allocation array, falling back
        // to `row.owner` when allocation is absent or empty.
        var splitsDict: [User.ID: Decimal] = [:]
        for entry in allocation {
            for (id, pct) in expand(entry.owner, entry.percent) {
                splitsDict[id, default: 0] += pct
            }
        }
        if splitsDict.isEmpty, let ownerName = row.owner {
            for (id, pct) in expand(ownerName, 100) {
                splitsDict[id, default: 0] += pct
            }
        }
        guard !splitsDict.isEmpty else {
            throw MappingError(reason: "no resolvable owner (owner=\(row.owner ?? "nil"))")
        }

        // Everything personal. ownerIDs reflects participants; splits is
        // nil for single-owner or "evenish" multi-owner (so AppState's
        // even-split derivation kicks in), populated otherwise.
        let ownerIDs = Set(splitsDict.keys)
        let splits: [User.ID: Decimal]?
        if splitsDict.count == 1 {
            splits = nil
        } else {
            let target = Decimal(100) / Decimal(splitsDict.count)
            let tolerance = Decimal(string: "0.01")!
            let isEvenish = splitsDict.values.allSatisfy { value in
                let diff = value - target
                let absDiff = diff < 0 ? -diff : diff
                return absDiff < tolerance
            }
            splits = isEvenish ? nil : splitsDict
        }

        let date = try Self.parseDate(row.date)
        let category = Self.mapCategory(row.category, kind: kind)
        let source = Self.cardName(for: row.source ?? "manual")
        let amountCents = Self.toCents(row.amount)

        return Transaction(
            merchant: row.description,
            category: category,
            kind: kind,
            amount: amountCents,
            scope: .personal,
            ownerIDs: ownerIDs,
            splits: splits,
            source: source,
            date: date,
            householdID: nil,
            createdBy: ayazID
        )
    }

    private static func buildIncomeTransaction(
        from row: LegacyDataset.Income,
        ayazID: User.ID,
        tasnuvaID: User.ID
    ) throws -> Transaction {
        let ownerIDs: Set<User.ID>
        switch row.owner {
        case "Ayaz Uddin":
            ownerIDs = [ayazID]
        case "Tasnuva Ahmed":
            ownerIDs = [tasnuvaID]
        case "House":
            // Rental income — 50/50 split between Ayaz and Tasnuva-local.
            ownerIDs = [ayazID, tasnuvaID]
        default:
            throw MappingError(reason: "unknown income owner: \(row.owner)")
        }

        let date = try Self.parseDate(row.date)
        let category = Self.mapCategory(row.category, kind: .income)
        let amountCents = Self.toCents(row.amount)

        return Transaction(
            merchant: row.description,
            category: category,
            kind: .income,
            amount: amountCents,
            scope: .personal,
            ownerIDs: ownerIDs,
            splits: nil,
            source: "Manual",
            date: date,
            householdID: nil,
            createdBy: ayazID
        )
    }

    /// Match by case-insensitive "Tasnuva" prefix; if a single LocalUser
    /// exists, prefer it as a fallback (handles e.g. "Tasnuva Ahmed" vs
    /// just "Tasnuva" being entered as the display name).
    private static func findTasnuva(in localUsers: [LocalUser]) -> LocalUser? {
        if let match = localUsers.first(where: { $0.name.lowercased().contains("tasnuva") }) {
            return match
        }
        if localUsers.count == 1 { return localUsers.first }
        return nil
    }

    // MARK: - Helpers

    /// Round to nearest cent. `(34.50 * 100).rounded()` == 3450; binary FP
    /// fuzz on values like 21.78 also rounds cleanly with `.toNearestOrEven`.
    private static func toCents(_ dollars: Double) -> Int64 {
        Int64((dollars * 100).rounded())
    }

    private static let nyTimeZone = TimeZone(identifier: "America/New_York")!

    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = nyTimeZone
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static func parseDate(_ str: String) throws -> Date {
        guard let day = dayFormatter.date(from: str) else {
            throw MappingError(reason: "unparseable date: \(str)")
        }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = nyTimeZone
        return cal.date(bySettingHour: 12, minute: 0, second: 0, of: day) ?? day
    }

    private static func cardName(for source: String) -> String {
        switch source {
        case "amex":            return "Amex"
        case "amex-gold":       return "Amex Gold"
        case "apple":           return "Apple Card"
        case "td":              return "TD Bank"
        case "chase":           return "Chase"
        case "manual":          return "Manual"
        case "visa":            return "Visa"
        case "sapphire":        return "Chase Sapphire"
        case "bank-of-america": return "Bank of America"
        case "wells-fargo":     return "Wells Fargo"
        default:                return source.capitalized
        }
    }

    private static func mapCategory(_ raw: String, kind: TransactionKind) -> TransactionCategory {
        if kind == .income { return .income }
        switch raw {
        case "Food > Groceries":                            return .groceries
        case "Food > Dining Out":                           return .dining
        case "Food > Coffee & Drinks":                      return .coffee
        case "Home > Rent/Mortgage":                        return .rent
        case "Home > Utilities":                            return .utilities
        case "Home > Maintenance":                          return .utilities
        case "Home > Insurance":                            return .utilities
        case "Health > Medical":                            return .health
        case "Health > Dental & Vision":                    return .health
        case "Health > Pharmacy":                           return .health
        case "Health > Fitness":                            return .health
        case "Entertainment > Subscriptions":               return .subs
        case "Entertainment > Events & Tickets":            return .entertainment
        case "Entertainment > Hobbies":                     return .entertainment
        case "Transport > Gas/Fuel":                        return .fuel
        case "Transport > Public Transit":                  return .transit
        case "Transport > Rideshare":                       return .transit
        case "Transport > Car Insurance & Maintenance":     return .fuel
        default:
            if raw.hasPrefix("Shopping >")  { return .entertainment }
            if raw.hasPrefix("Finance >")   { return .utilities }
            if raw.hasPrefix("Travel >")    { return .entertainment }
            if raw.hasPrefix("Pets >")      { return .groceries }
            if raw.hasPrefix("Education >") { return .subs }
            if raw.hasPrefix("Income >")    { return .income }
            return .entertainment
        }
    }
}

// MARK: - Decodable shape

/// Only decodes the fields we actually use. Other top-level keys (debts,
/// debtPayments, ownerTransfers, presetTransactions, expense/incomeCategoriesWithColors,
/// displayCurrency, baseCurrency, owners) are intentionally ignored.
private struct LegacyDataset: Decodable {
    let expenses: [Expense]
    let income: [Income]
    let cardSources: [String]

    struct Expense: Decodable {
        let id: String
        let date: String
        let amount: Double
        let description: String
        let category: String
        let source: String?
        let owner: String?
        let allocationMode: String?
        let allocation: [Allocation]?
    }

    struct Income: Decodable {
        let id: String
        let date: String
        let amount: Double
        let description: String
        let category: String
        let owner: String
    }

    struct Allocation: Decodable {
        let owner: String
        let percent: Decimal
    }
}

#endif
