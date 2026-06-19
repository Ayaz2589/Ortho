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
