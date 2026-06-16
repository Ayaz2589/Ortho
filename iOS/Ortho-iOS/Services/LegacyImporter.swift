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
        let createdBy = appState.currentUserID
        guard let householdID = appState.currentHouseholdID else {
            throw ImportError.householdNotReady("no active household.")
        }
        guard let ayazID = appState.currentPersonID else {
            throw ImportError.householdNotReady("your person isn't ready yet.")
        }
        guard let tasnuva = Self.findTasnuva(in: appState.people) else {
            throw ImportError.householdNotReady(
                "Tasnuva isn't in your household yet. Go to Settings → Household → Add person, then re-run."
            )
        }
        let tasnuvaID = tasnuva.id

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
                    householdID: householdID,
                    createdBy: createdBy,
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
                    householdID: householdID,
                    createdBy: createdBy,
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
        householdID: Household.ID,
        createdBy: User.ID,
        ayazID: Person.ID,
        tasnuvaID: Person.ID
    ) throws -> Transaction {
        let allocation = row.allocation ?? []

        // Resolve named owners into person ids. "House" → both; unknown → drop.
        let expand: (String, Decimal) -> [(Person.ID, Decimal)] = { name, pct in
            switch name {
            case "Ayaz Uddin":    return [(ayazID, pct)]
            case "Tasnuva Ahmed": return [(tasnuvaID, pct)]
            case "House":         return [(ayazID, pct / 2), (tasnuvaID, pct / 2)]
            default:              return []
            }
        }

        // Build a percentage dict from the allocation array, falling back
        // to `row.owner` when allocation is absent or empty.
        var percentDict: [Person.ID: Decimal] = [:]
        for entry in allocation {
            for (id, pct) in expand(entry.owner, entry.percent) {
                percentDict[id, default: 0] += pct
            }
        }
        if percentDict.isEmpty, let ownerName = row.owner {
            for (id, pct) in expand(ownerName, 100) {
                percentDict[id, default: 0] += pct
            }
        }
        guard !percentDict.isEmpty else {
            throw MappingError(reason: "no resolvable owner (owner=\(row.owner ?? "nil"))")
        }

        let amountCents = Self.toCents(row.amount)
        let owners = Array(percentDict.keys)
        let split: SplitInput<Person.ID> = owners.count == 1
            ? .even
            : .percent(Dictionary(uniqueKeysWithValues: percentDict.map { ($0.key, NSDecimalNumber(decimal: $0.value).doubleValue) }))
        let shares = computeShares(amountCents, owners, split)

        let date = try Self.parseDate(row.date)
        let category = Self.mapCategory(row.category, kind: kind)
        let source = Self.cardName(for: row.source ?? "manual")

        return Transaction(
            merchant: row.description,
            category: category,
            kind: kind,
            amount: amountCents,
            ownerIDs: Set(owners),
            shares: shares,
            source: source,
            date: date,
            householdID: householdID,
            createdBy: createdBy
        )
    }

    private static func buildIncomeTransaction(
        from row: LegacyDataset.Income,
        householdID: Household.ID,
        createdBy: User.ID,
        ayazID: Person.ID,
        tasnuvaID: Person.ID
    ) throws -> Transaction {
        let owners: [Person.ID]
        switch row.owner {
        case "Ayaz Uddin":    owners = [ayazID]
        case "Tasnuva Ahmed": owners = [tasnuvaID]
        case "House":         owners = [ayazID, tasnuvaID]
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
            ownerIDs: Set(owners),
            shares: computeShares(amountCents, owners, .even),
            source: "Manual",
            date: date,
            householdID: householdID,
            createdBy: createdBy
        )
    }

    /// Match by case-insensitive "Tasnuva"; if a single non-account person
    /// exists, prefer it as a fallback.
    private static func findTasnuva(in people: [Person]) -> Person? {
        if let match = people.first(where: { $0.name.lowercased().contains("tasnuva") }) {
            return match
        }
        let added = people.filter { $0.linkedUserID == nil && $0.removedAt == nil }
        if added.count == 1 { return added.first }
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
