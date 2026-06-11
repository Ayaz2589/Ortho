import Foundation

enum TransactionKind: String, CaseIterable, Hashable, Codable {
    case expense, income
}

struct Transaction: Identifiable, Hashable, Codable {
    let id: UUID
    var merchant: String
    var category: TransactionCategory
    var kind: TransactionKind
    /// USD cents. Always non-negative; direction comes from `kind`.
    /// e.g. $5.75 → 575; $2,850.00 → 285_000.
    var amount: Int64
    /// Personal vs shared. Invariant: `scope == .personal ⇔ householdID == nil`
    /// (enforced server-side by a CHECK constraint; clients should preserve
    /// it when constructing transactions).
    var scope: TransactionScope
    /// One or more participants. For `.shared` transactions these are
    /// **Ortho users only** (each id equals an `auth.uid()`); local-user
    /// splits stay device-only and never appear here. For `.personal`
    /// transactions this is `[createdBy]` by convention — the queries
    /// (`monthlySpent`, `expenseShares`) read from this set.
    var ownerIDs: Set<User.ID>
    /// Explicit per-owner share of the amount, as percentages summing to 100.
    /// `nil` means split evenly across `ownerIDs`. Only meaningful for
    /// multi-owner shared transactions.
    var splits: [User.ID: Decimal]?
    var source: String
    var date: Date
    /// `nil` for personal; non-nil for shared.
    var householdID: Household.ID?
    /// Auth UUID of the user who created the transaction. Drives the
    /// "creator can update/delete" RLS policy.
    var createdBy: User.ID

    init(id: UUID = UUID(),
         merchant: String,
         category: TransactionCategory,
         kind: TransactionKind,
         amount: Int64,
         scope: TransactionScope,
         ownerIDs: Set<User.ID>,
         splits: [User.ID: Decimal]? = nil,
         source: String,
         date: Date,
         householdID: Household.ID? = nil,
         createdBy: User.ID) {
        self.id = id
        self.merchant = merchant
        self.category = category
        self.kind = kind
        self.amount = amount
        self.scope = scope
        self.ownerIDs = ownerIDs
        self.splits = splits
        self.source = source
        self.date = date
        self.householdID = householdID
        self.createdBy = createdBy
    }

    var isIncome: Bool { kind == .income }

    /// Resolved per-owner percentages — always returns a value, deriving an
    /// even split when `splits` is `nil`. Returns an empty dict for empty
    /// `ownerIDs` (shouldn't happen by invariant, but safe).
    var effectiveSplits: [User.ID: Decimal] {
        if let splits, !splits.isEmpty { return splits }
        let count = ownerIDs.count
        guard count > 0 else { return [:] }
        let per = Decimal(100) / Decimal(count)
        return Dictionary(uniqueKeysWithValues: ownerIDs.map { ($0, per) })
    }

    /// CodingKeys map the schema-backed fields to snake_case so cached JSON
    /// matches what the server emits. `ownerIDs` / `splits` don't have a
    /// matching column on `transactions` (they live in `transaction_shares`
    /// server-side) — they encode here for the local cache only; the data
    /// layer materializes them from `transaction_shares` rows on fetch.
    enum CodingKeys: String, CodingKey {
        case id
        case merchant
        case category
        case kind
        case amount       = "amount_cents"
        case scope
        case ownerIDs     = "owner_ids"
        case splits
        case source
        case date
        case householdID  = "household_id"
        case createdBy    = "created_by"
    }
}

// MARK: - Sample data

extension Transaction {
    /// Builds a sample transaction at `hour:minute` on a day `daysAgo` from
    /// today. Kept private to keep the sample-data spelling readable.
    private static func makeSample(
        merchant: String,
        category: TransactionCategory,
        kind: TransactionKind,
        cents: Int64,
        ownerIDs: Set<User.ID>,
        source: String,
        daysAgo: Int,
        hour: Int,
        minute: Int,
        householdID: Household.ID? = Household.homeSample.id,
        createdBy: User.ID
    ) -> Transaction {
        let cal = Calendar.current
        let base = cal.startOfDay(for: Date())
        let day = cal.date(byAdding: .day, value: -daysAgo, to: base) ?? base
        let date = cal.date(bySettingHour: hour, minute: minute, second: 0, of: day) ?? day
        return Transaction(
            merchant: merchant,
            category: category,
            kind: kind,
            amount: cents,
            scope: householdID == nil ? .personal : .shared,
            ownerIDs: ownerIDs,
            source: source,
            date: date,
            householdID: householdID,
            createdBy: createdBy
        )
    }

    static let sample: [Transaction] = {
        let maya = User.mayaSample.id
        let jordan = User.jordanSample.id
        let both: Set<User.ID> = [maya, jordan]

        return [
            // Today
            makeSample(merchant: "Blue Bottle Coffee",   category: .coffee,    kind: .expense, cents: 575,     ownerIDs: [maya],   source: "Amex Gold",      daysAgo: 0, hour: 8,  minute: 24, createdBy: maya),
            makeSample(merchant: "Whole Foods",          category: .groceries, kind: .expense, cents: 8742,    ownerIDs: [jordan], source: "Chase Sapphire", daysAgo: 0, hour: 12, minute: 8,  createdBy: jordan),
            makeSample(merchant: "Sweetgreen",           category: .dining,    kind: .expense, cents: 1620,    ownerIDs: [jordan], source: "Chase Sapphire", daysAgo: 0, hour: 13, minute: 14, createdBy: jordan),

            // Yesterday
            makeSample(merchant: "Spotify Family",       category: .subs,      kind: .expense, cents: 1699,    ownerIDs: [maya],   source: "Apple Card",     daysAgo: 1, hour: 6,  minute: 0,  createdBy: maya),
            makeSample(merchant: "Shell",                category: .fuel,      kind: .expense, cents: 4210,    ownerIDs: [jordan], source: "Chase Sapphire", daysAgo: 1, hour: 17, minute: 42, createdBy: jordan),
            makeSample(merchant: "Trader Joe's",         category: .groceries, kind: .expense, cents: 5428,    ownerIDs: [maya],   source: "Amex Gold",      daysAgo: 1, hour: 18, minute: 18, createdBy: maya),

            // 2 days ago
            makeSample(merchant: "Greenwood Apartments", category: .rent,      kind: .expense, cents: 285_000, ownerIDs: both,     source: "ACH · Joint",    daysAgo: 2, hour: 9,  minute: 0,  createdBy: maya),
            makeSample(merchant: "CVS Pharmacy",         category: .health,    kind: .expense, cents: 1240,    ownerIDs: [jordan], source: "Apple Card",     daysAgo: 2, hour: 11, minute: 32, createdBy: jordan),
            makeSample(merchant: "Payroll — Acme Co.",   category: .income,    kind: .income,  cents: 342_000, ownerIDs: [maya],   source: "ACH · Checking", daysAgo: 2, hour: 6,  minute: 0,  createdBy: maya),

            // 3 days ago
            makeSample(merchant: "Netflix",              category: .subs,      kind: .expense, cents: 2299,    ownerIDs: [maya],   source: "Apple Card",     daysAgo: 3, hour: 7,  minute: 0,  createdBy: maya),
            makeSample(merchant: "Uber",                 category: .transit,   kind: .expense, cents: 1850,    ownerIDs: [maya],   source: "Amex Gold",      daysAgo: 3, hour: 21, minute: 42, createdBy: maya),
            makeSample(merchant: "ConEd",                category: .utilities, kind: .expense, cents: 9416,    ownerIDs: both,     source: "ACH · Joint",    daysAgo: 3, hour: 10, minute: 0,  createdBy: jordan),
        ]
    }()
}
