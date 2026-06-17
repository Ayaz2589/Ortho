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
    /// One or more owners (household People). Derived from `transaction_shares`.
    var ownerIDs: Set<Person.ID>
    /// Per-owner share of the amount, in cents. The values sum to `amount`.
    /// Materialized from `transaction_shares` rows server-side.
    var shares: [Person.ID: Int64]
    var source: String
    var date: Date
    /// The household this transaction belongs to.
    var householdID: Household.ID?
    /// Auth UUID of the user who created the transaction. Drives the
    /// "creator can update/delete" RLS policy.
    var createdBy: User.ID

    init(id: UUID = UUID(),
         merchant: String,
         category: TransactionCategory,
         kind: TransactionKind,
         amount: Int64,
         ownerIDs: Set<Person.ID>,
         shares: [Person.ID: Int64] = [:],
         source: String,
         date: Date,
         householdID: Household.ID? = nil,
         createdBy: User.ID) {
        self.id = id
        self.merchant = merchant
        self.category = category
        self.kind = kind
        self.amount = amount
        self.ownerIDs = ownerIDs
        self.shares = shares
        self.source = source
        self.date = date
        self.householdID = householdID
        self.createdBy = createdBy
    }

    var isIncome: Bool { kind == .income }

    /// Deterministic owner order (for even-split remainder placement) — the
    /// shared canonical sort, mirrored by web `orderedOwnerIds`.
    private var orderedOwners: [Person.ID] { orderedOwnerIds(Array(ownerIDs)) }

    /// Per-owner cents — the stored shares, or an even split when absent.
    var effectiveShares: [Person.ID: Int64] {
        if !shares.isEmpty { return shares }
        return computeShares(amount, orderedOwners, .even)
    }

    /// `ownerIDs` / `shares` live in `transaction_shares` server-side; they are
    /// encoded here for the local cache and the shared filter vectors. `shares`
    /// uses a uuid-string-keyed object so it round-trips with the TS vectors.
    enum CodingKeys: String, CodingKey {
        case id, merchant, category, kind
        case amount       = "amount_cents"
        case ownerIDs     = "owner_ids"
        case shares
        case source, date
        case householdID  = "household_id"
        case createdBy    = "created_by"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        merchant = try c.decode(String.self, forKey: .merchant)
        category = try c.decode(TransactionCategory.self, forKey: .category)
        kind = try c.decode(TransactionKind.self, forKey: .kind)
        amount = try c.decode(Int64.self, forKey: .amount)
        ownerIDs = try c.decodeIfPresent(Set<UUID>.self, forKey: .ownerIDs) ?? []
        let raw = try c.decodeIfPresent([String: Int64].self, forKey: .shares) ?? [:]
        shares = Dictionary(uniqueKeysWithValues: raw.compactMap { key, value in
            UUID(uuidString: key).map { ($0, value) }
        })
        source = try c.decode(String.self, forKey: .source)
        date = try c.decode(Date.self, forKey: .date)
        householdID = try c.decodeIfPresent(UUID.self, forKey: .householdID)
        createdBy = try c.decode(UUID.self, forKey: .createdBy)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(merchant, forKey: .merchant)
        try c.encode(category, forKey: .category)
        try c.encode(kind, forKey: .kind)
        try c.encode(amount, forKey: .amount)
        try c.encode(ownerIDs, forKey: .ownerIDs)
        try c.encode(Dictionary(uniqueKeysWithValues: shares.map { ($0.key.uuidString, $0.value) }), forKey: .shares)
        try c.encode(source, forKey: .source)
        try c.encode(date, forKey: .date)
        try c.encodeIfPresent(householdID, forKey: .householdID)
        try c.encode(createdBy, forKey: .createdBy)
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
            ownerIDs: ownerIDs,
            shares: computeShares(cents, orderedOwnerIds(Array(ownerIDs)), .even),
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
