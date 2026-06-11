import Foundation

/// A user's membership in a household. Mirrors the Postgres
/// `household_members` row — composite primary key `(householdID, userID)`,
/// plus the user's `role` and join timestamp.
///
/// `Household.memberIDs` is still the authoritative ordered list the UI
/// reads from; `HouseholdMember` rows are what comes back from the server
/// and what the membership-management API takes.
struct HouseholdMember: Hashable, Codable {
    var householdID: Household.ID
    var userID: User.ID
    var role: Role
    var createdAt: Date

    init(householdID: Household.ID,
         userID: User.ID,
         role: Role,
         createdAt: Date = .now) {
        self.householdID = householdID
        self.userID = userID
        self.role = role
        self.createdAt = createdAt
    }

    enum CodingKeys: String, CodingKey {
        case householdID = "household_id"
        case userID      = "user_id"
        case role
        case createdAt   = "created_at"
    }
}
