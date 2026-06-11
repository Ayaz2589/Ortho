import Foundation

/// A named group of users who share transactions. The household scope on a
/// `Transaction.householdID` controls visibility — household-scoped rows are
/// shared with every member; `nil` means personal to a single user.
///
/// The data model supports multiple households per device; the MVP UI shows
/// only the active one (`AppState.currentHouseholdID`).
struct Household: Identifiable, Hashable, Codable {
    let id: UUID
    var name: String
    /// Ordered for stable UI. Insertion-order = display-order.
    var memberIDs: [User.ID]

    init(id: UUID = UUID(), name: String, memberIDs: [User.ID]) {
        self.id = id
        self.name = name
        self.memberIDs = memberIDs
    }
}

extension Household {
    /// Stable UUID so sample transactions can reference the seeded household
    /// deterministically across launches.
    static let homeSample = Household(
        id: UUID(uuidString: "33333333-3333-3333-3333-333333333333")!,
        name: "Home",
        memberIDs: [User.mayaSample.id, User.jordanSample.id]
    )
}
