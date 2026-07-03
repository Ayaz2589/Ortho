import Foundation

/// A name-only member of a household (the account holder or someone you added).
/// Owners of transactions are People. Added people need no Ortho account, so
/// `linkedUserID` is nil for them and set to the auth uid for the account holder.
/// There is a single people list — no separate local-vs-account person split.
struct Person: Identifiable, Hashable, Codable {
    let id: UUID
    var householdID: Household.ID
    var name: String
    var initial: String
    var colorKey: String
    var linkedUserID: User.ID?
    var sortOrder: Int
    /// Soft-remove: hidden from pickers, kept on existing transactions.
    var removedAt: Date?

    init(id: UUID = UUID(),
         householdID: Household.ID,
         name: String,
         initial: String,
         colorKey: String,
         linkedUserID: User.ID? = nil,
         sortOrder: Int = 0,
         removedAt: Date? = nil) {
        self.id = id
        self.householdID = householdID
        self.name = name
        self.initial = initial
        self.colorKey = colorKey
        self.linkedUserID = linkedUserID
        self.sortOrder = sortOrder
        self.removedAt = removedAt
    }

    enum CodingKeys: String, CodingKey {
        case id
        case householdID = "household_id"
        case name
        case initial
        case colorKey = "color_key"
        case linkedUserID = "linked_user_id"
        case sortOrder = "sort_order"
        case removedAt = "removed_at"
    }

    var palette: OrthoColorOption { OrthoColorOption.find(colorKey) }

    /// Render a Person through the existing User-based avatar/row views.
    var asUser: User { User(id: id, name: name, initial: initial, colorKey: colorKey) }
}

// MARK: - Sample data

extension Person {
    /// Sample People for the -uiDemo / test-data seed. Owners of transactions are
    /// People, so the seed must supply them (before spec 015 the sample seeded
    /// only `users`, which made every owner resolve to the "Removed" placeholder
    /// and left member balances empty). Each sample Person reuses its linked
    /// User's id, so the sample transactions' owner ids resolve directly.
    static let mayaSample = Person(
        id: User.mayaSample.id,
        householdID: Household.homeSample.id,
        name: User.mayaSample.name,
        initial: User.mayaSample.initial,
        colorKey: User.mayaSample.colorKey,
        linkedUserID: User.mayaSample.id,
        sortOrder: 0
    )
    static let jordanSample = Person(
        id: User.jordanSample.id,
        householdID: Household.homeSample.id,
        name: User.jordanSample.name,
        initial: User.jordanSample.initial,
        colorKey: User.jordanSample.colorKey,
        linkedUserID: User.jordanSample.id,
        sortOrder: 1
    )

    static let sample: [Person] = [mayaSample, jordanSample]
}
