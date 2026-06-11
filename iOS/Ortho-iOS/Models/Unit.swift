import Foundation

/// A rental unit inside a multifamily property the household owns.
struct Unit: Identifiable, Hashable, Codable {
    let id: UUID
    var name: String           // "Unit 1A", "Garden", "Top floor"
    /// USD cents — configured monthly rent for this unit.
    var monthlyRent: Int64
    var tenantName: String?
    var tenantEmail: String?

    init(id: UUID = UUID(),
         name: String,
         monthlyRent: Int64,
         tenantName: String? = nil,
         tenantEmail: String? = nil) {
        self.id = id
        self.name = name
        self.monthlyRent = monthlyRent
        self.tenantName = tenantName
        self.tenantEmail = tenantEmail
    }

    var isVacant: Bool {
        (tenantName ?? "").trimmingCharacters(in: .whitespaces).isEmpty
    }
}
