import Foundation

/// A household's monthly spending limit for a single `TransactionCategory`.
/// Drives the budget-status rule in `InsightEngine` and the
/// `BudgetProgressCard` widget on the Dashboard. Amounts are USD cents,
/// rendered in the user's display currency via the `Money` formatter.
///
/// Mirrors the Postgres `public.budgets` row. The `(householdID, category)`
/// pair is unique server-side — one budget per category per household.
struct Budget: Identifiable, Hashable, Codable {
    let id: UUID
    var householdID: Household.ID
    var category: TransactionCategory
    var monthlyLimitCents: Int64

    init(id: UUID = UUID(),
         householdID: Household.ID,
         category: TransactionCategory,
         monthlyLimitCents: Int64) {
        self.id = id
        self.householdID = householdID
        self.category = category
        self.monthlyLimitCents = monthlyLimitCents
    }

    enum CodingKeys: String, CodingKey {
        case id
        case householdID       = "household_id"
        case category
        case monthlyLimitCents = "monthly_limit_cents"
    }
}

// MARK: - Sample data

extension Budget {
    /// Seeded budgets on categories present in `Transaction.sample`, so the
    /// dashboard budget widget and the Settings "Budgets" peek are non-empty in
    /// the -uiDemo / test-data seed (spec 015).
    static let sample: [Budget] = [
        Budget(householdID: Household.homeSample.id, category: .groceries, monthlyLimitCents: 60_000),
        Budget(householdID: Household.homeSample.id, category: .dining,    monthlyLimitCents: 25_000),
        Budget(householdID: Household.homeSample.id, category: .utilities, monthlyLimitCents: 15_000),
    ]
}
