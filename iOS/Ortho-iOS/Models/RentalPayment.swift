import Foundation

/// A single rent payment logged against a `.rental` property. The user
/// records these manually (no auto-detection of transactions). Powers the
/// "Payment History" list on the rental detail view.
struct RentalPayment: Identifiable, Hashable, Codable {
    let id: UUID
    let propertyID: Property.ID
    /// USD cents — amount paid this period.
    var amount: Int64
    var date: Date
    var note: String?

    init(id: UUID = UUID(),
         propertyID: Property.ID,
         amount: Int64,
         date: Date,
         note: String? = nil) {
        self.id = id
        self.propertyID = propertyID
        self.amount = amount
        self.date = date
        self.note = note
    }
}
