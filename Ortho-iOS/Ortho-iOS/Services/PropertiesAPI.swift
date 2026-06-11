import Foundation
import Supabase

/// Server-backed CRUD for `Property`. One Swift `Property` spans four
/// Postgres tables (`properties`, `mortgage_info`, `lease_info`, `units`),
/// so this API does the gluing on every read and write.
///
/// Reads: 4 parallel SELECTs, group children by `property_id`, rehydrate.
/// Writes: parent first, then sub-tables for whichever fields are present.
/// Updates use delete-and-reinsert on sub-tables (matches the
/// `transaction_shares` pattern — cheap because counts are small).
/// Deletes lean on the FK cascade — only the parent row needs to go.
struct PropertiesAPI {
    private let client: SupabaseClient

    init(client: SupabaseClient) {
        self.client = client
    }

    // MARK: - Read

    func fetch() async throws -> [Property] {
        async let propsResult: [PropertyRecord] = client
            .from("properties")
            .select()
            .order("address", ascending: true)
            .execute()
            .value
        async let mortgagesResult: [MortgageInfoRow] = client
            .from("mortgage_info")
            .select()
            .execute()
            .value
        async let leasesResult: [LeaseInfoRow] = client
            .from("lease_info")
            .select()
            .execute()
            .value
        async let unitsResult: [UnitRow] = client
            .from("units")
            .select()
            .order("sort_order", ascending: true)
            .execute()
            .value

        let (props, mortgages, leases, unitRows) =
            try await (propsResult, mortgagesResult, leasesResult, unitsResult)

        let mortgageByProperty = Dictionary(uniqueKeysWithValues:
            mortgages.map { ($0.propertyID, $0) }
        )
        let leaseByProperty = Dictionary(uniqueKeysWithValues:
            leases.map { ($0.propertyID, $0) }
        )
        let unitsByProperty = Dictionary(grouping: unitRows, by: \.propertyID)

        return props.map { p in
            Property(
                id: p.id,
                householdID: p.householdID,
                kind: p.kind,
                address: p.address,
                nickname: p.nickname,
                mortgage: mortgageByProperty[p.id]?.toModel(),
                lease: leaseByProperty[p.id]?.toModel(),
                units: (unitsByProperty[p.id] ?? []).map { $0.toModel() }
            )
        }
    }

    // MARK: - Write

    func create(_ property: Property) async throws {
        try await client
            .from("properties")
            .insert(PropertyRecord.from(property))
            .execute()

        if let mortgage = property.mortgage {
            try await client
                .from("mortgage_info")
                .insert(MortgageInfoRow.from(mortgage, propertyID: property.id))
                .execute()
        }
        if let lease = property.lease {
            try await client
                .from("lease_info")
                .insert(LeaseInfoRow.from(lease, propertyID: property.id))
                .execute()
        }
        if !property.units.isEmpty {
            let rows = property.units.enumerated().map { idx, u in
                UnitRow.from(u, propertyID: property.id, sortOrder: idx)
            }
            try await client
                .from("units")
                .insert(rows)
                .execute()
        }
    }

    func update(_ property: Property) async throws {
        try await client
            .from("properties")
            .update(PropertyRecord.from(property))
            .eq("id", value: property.id)
            .execute()

        // Sub-tables: wipe and replace. Simpler than diffing; safe because
        // each table has a small, bounded row count per property.
        try await client
            .from("mortgage_info")
            .delete()
            .eq("property_id", value: property.id)
            .execute()
        if let mortgage = property.mortgage {
            try await client
                .from("mortgage_info")
                .insert(MortgageInfoRow.from(mortgage, propertyID: property.id))
                .execute()
        }

        try await client
            .from("lease_info")
            .delete()
            .eq("property_id", value: property.id)
            .execute()
        if let lease = property.lease {
            try await client
                .from("lease_info")
                .insert(LeaseInfoRow.from(lease, propertyID: property.id))
                .execute()
        }

        try await client
            .from("units")
            .delete()
            .eq("property_id", value: property.id)
            .execute()
        if !property.units.isEmpty {
            let rows = property.units.enumerated().map { idx, u in
                UnitRow.from(u, propertyID: property.id, sortOrder: idx)
            }
            try await client
                .from("units")
                .insert(rows)
                .execute()
        }
    }

    func delete(id: Property.ID) async throws {
        // FK cascade drops mortgage_info / lease_info / units / rental_payments.
        try await client
            .from("properties")
            .delete()
            .eq("id", value: id)
            .execute()
    }
}

// MARK: - DTOs

private struct PropertyRecord: Codable {
    let id: UUID
    let householdID: UUID
    let kind: PropertyKind
    let address: String
    let nickname: String?

    static func from(_ p: Property) -> PropertyRecord {
        PropertyRecord(
            id: p.id,
            householdID: p.householdID,
            kind: p.kind,
            address: p.address,
            nickname: p.nickname
        )
    }

    enum CodingKeys: String, CodingKey {
        case id
        case householdID = "household_id"
        case kind
        case address
        case nickname
    }
}

private struct MortgageInfoRow: Codable {
    let propertyID: UUID
    let purchasePriceCents: Int64
    let originalLoanCents: Int64
    let annualInterestRatePercent: Decimal
    let loanTermYears: Int
    /// `yyyy-MM-dd` string for the `date` column.
    let closingDate: String
    let autoPaySource: String?

    static func from(_ m: MortgageInfo, propertyID: UUID) -> MortgageInfoRow {
        MortgageInfoRow(
            propertyID: propertyID,
            purchasePriceCents: m.purchasePrice,
            originalLoanCents: m.originalLoan,
            annualInterestRatePercent: m.annualInterestRatePercent,
            loanTermYears: m.loanTermYears,
            closingDate: SupabaseDateFormatters.string(from: m.closingDate),
            autoPaySource: m.autoPaySource
        )
    }

    func toModel() -> MortgageInfo {
        MortgageInfo(
            purchasePrice: purchasePriceCents,
            originalLoan: originalLoanCents,
            annualInterestRatePercent: annualInterestRatePercent,
            loanTermYears: loanTermYears,
            closingDate: SupabaseDateFormatters.date(from: closingDate) ?? .now,
            autoPaySource: autoPaySource
        )
    }

    enum CodingKeys: String, CodingKey {
        case propertyID                = "property_id"
        case purchasePriceCents        = "purchase_price_cents"
        case originalLoanCents         = "original_loan_cents"
        case annualInterestRatePercent = "annual_interest_rate_percent"
        case loanTermYears             = "loan_term_years"
        case closingDate               = "closing_date"
        case autoPaySource             = "auto_pay_source"
    }
}

private struct LeaseInfoRow: Codable {
    let propertyID: UUID
    let monthlyRentCents: Int64
    let leaseStart: String
    let leaseEnd: String
    let securityDepositCents: Int64?
    let paidWithSource: String?

    static func from(_ l: LeaseInfo, propertyID: UUID) -> LeaseInfoRow {
        LeaseInfoRow(
            propertyID: propertyID,
            monthlyRentCents: l.monthlyRent,
            leaseStart: SupabaseDateFormatters.string(from: l.leaseStart),
            leaseEnd:   SupabaseDateFormatters.string(from: l.leaseEnd),
            securityDepositCents: l.securityDepositCents,
            paidWithSource: l.paidWithSource
        )
    }

    func toModel() -> LeaseInfo {
        LeaseInfo(
            monthlyRent: monthlyRentCents,
            leaseStart: SupabaseDateFormatters.date(from: leaseStart) ?? .now,
            leaseEnd:   SupabaseDateFormatters.date(from: leaseEnd) ?? .now,
            securityDepositCents: securityDepositCents,
            paidWithSource: paidWithSource
        )
    }

    enum CodingKeys: String, CodingKey {
        case propertyID           = "property_id"
        case monthlyRentCents     = "monthly_rent_cents"
        case leaseStart           = "lease_start"
        case leaseEnd             = "lease_end"
        case securityDepositCents = "security_deposit_cents"
        case paidWithSource       = "paid_with_source"
    }
}

private struct UnitRow: Codable {
    let id: UUID
    let propertyID: UUID
    let name: String
    let monthlyRentCents: Int64
    let tenantName: String?
    let tenantEmail: String?
    let sortOrder: Int

    static func from(_ u: Unit, propertyID: UUID, sortOrder: Int) -> UnitRow {
        UnitRow(
            id: u.id,
            propertyID: propertyID,
            name: u.name,
            monthlyRentCents: u.monthlyRent,
            tenantName: u.tenantName,
            tenantEmail: u.tenantEmail,
            sortOrder: sortOrder
        )
    }

    func toModel() -> Unit {
        Unit(
            id: id,
            name: name,
            monthlyRent: monthlyRentCents,
            tenantName: tenantName,
            tenantEmail: tenantEmail
        )
    }

    enum CodingKeys: String, CodingKey {
        case id
        case propertyID       = "property_id"
        case name
        case monthlyRentCents = "monthly_rent_cents"
        case tenantName       = "tenant_name"
        case tenantEmail      = "tenant_email"
        case sortOrder        = "sort_order"
    }
}
