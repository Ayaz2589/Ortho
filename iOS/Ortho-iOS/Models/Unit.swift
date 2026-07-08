import Foundation

/// A rental unit inside a multifamily property the household owns.
struct Unit: Identifiable, Hashable, Codable {
    let id: UUID
    var name: String           // "Unit 1A", "Garden", "Top floor"
    /// USD cents — configured monthly rent for this unit.
    var monthlyRent: Int64
    var tenantName: String?
    var tenantEmail: String?
    /// Explicit occupancy (spec 020, `units.occupied`). Vacancy is a deliberate
    /// state, NOT merely "no tenant name" — a rent-earning unit whose tenant
    /// name was left unrecorded must still count. New units default to occupied.
    /// For rows/caches written before the `occupied` column existed, `init(from:)`
    /// falls back to the old tenant-name inference. Only occupied units' rent
    /// counts toward net rental income (see `HousingMath`).
    var occupied: Bool

    init(id: UUID = UUID(),
         name: String,
         monthlyRent: Int64,
         tenantName: String? = nil,
         tenantEmail: String? = nil,
         occupied: Bool = true) {
        self.id = id
        self.name = name
        self.monthlyRent = monthlyRent
        self.tenantName = tenantName
        self.tenantEmail = tenantEmail
        self.occupied = occupied
    }

    /// The inverse of `occupied` — drives the "Vacant" chip and excludes the
    /// unit from collected-rent math.
    var isVacant: Bool { !occupied }

    enum CodingKeys: String, CodingKey {
        case id, name, monthlyRent, tenantName, tenantEmail
        case occupied
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        monthlyRent = try c.decode(Int64.self, forKey: .monthlyRent)
        tenantName = try c.decodeIfPresent(String.self, forKey: .tenantName)
        tenantEmail = try c.decodeIfPresent(String.self, forKey: .tenantEmail)
        // The `occupied` field may be absent (a cache written before spec 020).
        // Fall back to the old tenant-name inference — a non-blank tenant name
        // means occupied — matching web `isUnitOccupied`. `.whitespacesAndNewlines`
        // mirrors JS `.trim()` so both surfaces infer identically.
        occupied = try c.decodeIfPresent(Bool.self, forKey: .occupied)
            ?? !(tenantName ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
