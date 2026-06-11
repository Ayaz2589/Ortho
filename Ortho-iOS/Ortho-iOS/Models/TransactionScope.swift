import Foundation

/// Whether a transaction is private to one Ortho user or shared with every
/// member of a household.
///
/// - `.personal` — visible only to the creator. `Transaction.householdID`
///   is `nil`. Owner is implicit (`createdBy`); any non-Ortho splits stay
///   on the device (see `LocalUser`).
/// - `.shared` — visible to every household member. `householdID` is
///   non-nil. `ownerIDs` only contains Ortho users.
///
/// Raw values match the Postgres `transaction_scope` enum.
enum TransactionScope: String, Codable, Hashable, CaseIterable, Identifiable {
    case personal
    case shared

    var id: String { rawValue }
}
