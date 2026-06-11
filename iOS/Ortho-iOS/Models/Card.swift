import Foundation

/// A payment method (credit card, debit card, ACH account, etc.) belonging
/// to a household. Drives the "Paid with" dropdown in the add-transaction
/// sheet. `Transaction.source` stores the card's `name` as a string so
/// existing transactions keep their label even if a card is later renamed
/// or deleted.
///
/// Cards are household-scoped server-side (see `public.cards` in the
/// migration). When a household has multiple members, all of them see the
/// same "Paid with" list.
struct Card: Identifiable, Hashable, Codable {
    let id: UUID
    var householdID: Household.ID
    var name: String

    init(id: UUID = UUID(),
         householdID: Household.ID,
         name: String) {
        self.id = id
        self.householdID = householdID
        self.name = name
    }

    enum CodingKeys: String, CodingKey {
        case id
        case householdID = "household_id"
        case name
    }
}

extension Card {
    /// Initial seed — matches the previously hardcoded expense-source list so
    /// existing sample transactions still resolve cleanly to a card by name.
    static let sample: [Card] = [
        .init(householdID: Household.homeSample.id, name: "Amex Gold"),
        .init(householdID: Household.homeSample.id, name: "Chase Sapphire"),
        .init(householdID: Household.homeSample.id, name: "Apple Card"),
        .init(householdID: Household.homeSample.id, name: "ACH · Joint"),
    ]
}
