import Foundation

/// A property the household owns or rents. One of three kinds — primary
/// home, multifamily (rental units the household owns), or rental (the
/// household is the renter). Each kind uses a different subset of the
/// optional fields below.
enum PropertyKind: String, CaseIterable, Hashable, Codable, Identifiable {
    // Raw values match the Postgres `property_kind` enum so Codable
    // round-trips cleanly without a CodingKeys override.
    case primaryHome = "primary_home"
    case multifamily = "multifamily"
    case rental      = "rental"

    var id: String { rawValue }

    var displayName: LocalizedStringResource {
        switch self {
        case .primaryHome: "Primary home"
        case .multifamily: "Multifamily property"
        case .rental:      "Rental"
        }
    }

    var subtitle: LocalizedStringResource {
        switch self {
        case .primaryHome: "You own where you live"
        case .multifamily: "Rental units you own"
        case .rental:      "You rent your home"
        }
    }

    var symbol: String {
        switch self {
        case .primaryHome: "house"
        case .multifamily: "building.2"
        case .rental:      "key"
        }
    }

    /// True for owner-occupied and landlord-owned properties — both carry
    /// mortgages.
    var hasMortgage: Bool {
        self == .primaryHome || self == .multifamily
    }
}

struct Property: Identifiable, Hashable, Codable {
    let id: UUID
    /// Household that owns/rents this property. All household members can
    /// read + write — properties are collectively owned, not per-user.
    var householdID: Household.ID
    var kind: PropertyKind
    var address: String
    /// Optional display nickname. When `nil`, the address is the title.
    var nickname: String?

    /// Mortgage info — populated for `.primaryHome` and `.multifamily`.
    var mortgage: MortgageInfo?

    /// Lease info — populated for `.rental`.
    var lease: LeaseInfo?

    /// Rental units — populated for `.multifamily`. Empty otherwise.
    var units: [Unit]

    init(id: UUID = UUID(),
         householdID: Household.ID,
         kind: PropertyKind,
         address: String,
         nickname: String? = nil,
         mortgage: MortgageInfo? = nil,
         lease: LeaseInfo? = nil,
         units: [Unit] = []) {
        self.id = id
        self.householdID = householdID
        self.kind = kind
        self.address = address
        self.nickname = nickname
        self.mortgage = mortgage
        self.lease = lease
        self.units = units
    }

    /// The label shown as the row title in the property list / nav header.
    var title: String { nickname ?? address }

    enum CodingKeys: String, CodingKey {
        case id
        case householdID = "household_id"
        case kind
        case address
        case nickname
        // The four below are client-side composites — server keeps them in
        // sibling tables (mortgage_info, lease_info, units). They round-trip
        // through the JSON cache here for offline reads.
        case mortgage
        case lease
        case units
    }
}

// MARK: - Multifamily derived financials

extension Property {
    /// Sum of configured rents for **occupied** units only. Vacant units
    /// contribute zero — their `monthlyRent` is the asking number, not
    /// money you're collecting. Returns 0 for non-multifamily properties.
    var occupiedMonthlyRentCents: Int64 {
        units
            .filter { !$0.isVacant }
            .reduce(0) { $0 + $1.monthlyRent }
    }

    /// Multifamily net monthly cashflow — occupied rent minus the
    /// mortgage's principal + interest payment. P&I only; taxes, insurance,
    /// HOA, PMI, and maintenance reserves aren't modeled. Returns 0 for
    /// non-multifamily properties (no rental-income side).
    var netMonthlyBalanceCents: Int64 {
        guard kind == .multifamily else { return 0 }
        let mortgagePayment = mortgage?.monthlyPaymentCents ?? 0
        return occupiedMonthlyRentCents - mortgagePayment
    }
}

extension Property {
    /// Seeded so the Housing tab isn't an empty state on first launch.
    /// Numbers picked to produce a realistic mid-life mortgage view (closed
    /// roughly a decade ago, ~6.85% rate, ~$340k remaining of a $435k loan).
    static let sample: [Property] = {
        let closing = Calendar.current.date(
            from: DateComponents(year: 2016, month: 5, day: 18)
        ) ?? Date()
        let primary = Property(
            householdID: Household.homeSample.id,
            kind: .primaryHome,
            address: "124 Oak Lane",
            mortgage: MortgageInfo(
                purchasePrice: 530_000_00,     // $530,000.00 in USD cents
                originalLoan:  435_000_00,     // $435,000.00
                annualInterestRatePercent: Decimal(string: "6.85") ?? 6.85,
                loanTermYears: 30,
                closingDate: closing,
                autoPaySource: "ACH · Joint"
            )
        )
        return [primary]
    }()
}
