import Foundation

#if DEBUG

/// Larger-than-default dataset used for local testing. Loaded via the
/// Developer section in Settings (DEBUG builds only). Spans 6 months and
/// includes 3 users, 3 property kinds (primary + multifamily + rental),
/// ~150 transactions with mixed solo/joint ownership and splits, plus 6
/// monthly rental-payment entries.
///
/// Everything is deterministic (no randomness) so the dataset is stable
/// across launches — useful when iterating on UI and wanting the same
/// rows to be present every time.
enum DummyData {
    struct Bundle {
        let users: [User]
        let households: [Household]
        let cards: [Card]
        let transactions: [Transaction]
        let properties: [Property]
        let rentalPayments: [RentalPayment]
    }

    /// A third household member used in the dummy dataset. Stable UUID so
    /// transactions can reference them deterministically.
    static let alexDummy = User(
        id: UUID(uuidString: "44444444-4444-4444-4444-444444444444")!,
        name: "Alex",
        initial: "A",
        colorKey: "terracotta"
    )

    static let large: Bundle = build()

    // MARK: - Builder

    private static func build() -> Bundle {
        let maya = User.mayaSample
        let jordan = User.jordanSample
        let alex = alexDummy

        let household = Household(
            id: Household.homeSample.id,
            name: "Home",
            memberIDs: [maya.id, jordan.id, alex.id]
        )

        let cards: [Card] = [
            .init(householdID: household.id, name: "Amex Gold"),
            .init(householdID: household.id, name: "Chase Sapphire"),
            .init(householdID: household.id, name: "Apple Card"),
            .init(householdID: household.id, name: "ACH · Joint"),
            .init(householdID: household.id, name: "Chase Freedom"),
            .init(householdID: household.id, name: "Citi Double Cash"),
        ]

        // Primary home — reuse the seeded sample so amortization math
        // matches the screenshots.
        let primary = Property.sample[0]

        // Multifamily — 2-unit investment with tenants.
        let elmClosing = Calendar.current.date(
            from: DateComponents(year: 2020, month: 6, day: 1)
        ) ?? Date()
        let multifamily = Property(
            householdID: household.id,
            kind: .multifamily,
            address: "22 Elm Street",
            nickname: "Elm Street",
            mortgage: MortgageInfo(
                purchasePrice: 380_000_00,
                originalLoan:  304_000_00,
                annualInterestRatePercent: Decimal(string: "5.50") ?? 5.50,
                loanTermYears: 30,
                closingDate: elmClosing,
                autoPaySource: "ACH · Joint"
            ),
            units: [
                Unit(name: "Unit 1", monthlyRent: 1_200_00,
                     tenantName: "Sarah Chen", tenantEmail: "sarah@example.com"),
                Unit(name: "Unit 2", monthlyRent: 1_400_00,
                     tenantName: "Mike Park",  tenantEmail: "mike@example.com"),
            ]
        )

        // Rental — household IS the renter on this one.
        let leaseStart = Calendar.current.date(byAdding: .month, value: -6, to: .now) ?? Date()
        let leaseEnd   = Calendar.current.date(byAdding: .month, value:  6, to: .now) ?? Date()
        let rental = Property(
            householdID: household.id,
            kind: .rental,
            address: "800 Park Ave Apt 4B",
            nickname: "Park Avenue",
            lease: LeaseInfo(
                monthlyRent: 2_400_00,
                leaseStart: leaseStart,
                leaseEnd: leaseEnd,
                securityDepositCents: 4_800_00,
                paidWithSource: "ACH · Joint"
            )
        )

        let transactions = buildTransactions(
            maya: maya.id, jordan: jordan.id, alex: alex.id,
            householdID: household.id
        )

        let rentalPayments = buildRentalPayments(rentalID: rental.id)

        return Bundle(
            users: [maya, jordan, alex],
            households: [household],
            cards: cards,
            transactions: transactions,
            properties: [primary, multifamily, rental],
            rentalPayments: rentalPayments
        )
    }

    // MARK: - Transactions

    private static func buildTransactions(
        maya: User.ID, jordan: User.ID, alex: User.ID,
        householdID: Household.ID
    ) -> [Transaction] {
        var out: [Transaction] = []

        for monthsBack in 0..<6 {
            // --- Income (sole, household-scoped) ---
            out.append(tx(.income,  .income,    420_000, [maya],   "ACH · Checking",
                          merchant: "Payroll — Acme Co.",
                          monthsBack: monthsBack, day: 1, hour: 6, minute: 0,
                          household: householdID))
            out.append(tx(.income,  .income,    380_000, [jordan], "ACH · Checking",
                          merchant: "Payroll — Globex",
                          monthsBack: monthsBack, day: 15, hour: 8, minute: 0,
                          household: householdID))
            out.append(tx(.income,  .income,    510_000, [alex],   "ACH · Checking",
                          merchant: "Payroll — Initech",
                          monthsBack: monthsBack, day: 15, hour: 8, minute: 0,
                          household: householdID))

            // --- Housing — joint Maya + Jordan ---
            out.append(tx(.expense, .rent,      284_700, [maya, jordan], "ACH · Joint",
                          merchant: "Greenwood Mortgage",
                          monthsBack: monthsBack, day: 1, hour: 9, minute: 0,
                          household: householdID))
            out.append(tx(.expense, .rent,      180_000, [maya, jordan], "ACH · Joint",
                          merchant: "Elm Street Mortgage",
                          monthsBack: monthsBack, day: 1, hour: 9, minute: 0,
                          household: householdID))
            out.append(tx(.expense, .rent,      240_000, [maya, jordan], "ACH · Joint",
                          merchant: "Park Avenue Rent",
                          monthsBack: monthsBack, day: 1, hour: 10, minute: 0,
                          household: householdID))

            // --- Utilities — split across all 3 ---
            out.append(tx(.expense, .utilities,  9_400, [maya, jordan, alex], "ACH · Joint",
                          merchant: "ConEd",
                          monthsBack: monthsBack, day: 5, hour: 10, minute: 0,
                          household: householdID))
            out.append(tx(.expense, .utilities,  8_000, [maya, jordan, alex], "ACH · Joint",
                          merchant: "Verizon Fios",
                          monthsBack: monthsBack, day: 5, hour: 10, minute: 30,
                          household: householdID))

            // --- Subscriptions ---
            out.append(tx(.expense, .subs,       2_299, [maya],   "Apple Card",
                          merchant: "Netflix",
                          monthsBack: monthsBack, day: 7, hour: 7, minute: 0,
                          household: householdID))
            out.append(tx(.expense, .subs,       1_699, [maya],   "Apple Card",
                          merchant: "Spotify Family",
                          monthsBack: monthsBack, day: 7, hour: 7, minute: 0,
                          household: householdID))
            out.append(tx(.expense, .subs,       1_700, [maya],   "Apple Card",
                          merchant: "NYT Subscription",
                          monthsBack: monthsBack, day: 8, hour: 7, minute: 0,
                          household: householdID))
            out.append(tx(.expense, .subs,       2_000, [jordan], "Apple Card",
                          merchant: "ChatGPT Plus",
                          monthsBack: monthsBack, day: 20, hour: 7, minute: 0,
                          household: householdID))

            // --- Coffee, varied across all 3 owners and most weeks ---
            // Maya runs (weekly morning coffee)
            let mayaCoffees: [(day: Int, merchant: String, cents: Int64, hour: Int, minute: Int)] = [
                (3,  "Blue Bottle Coffee", 575, 8, 14),
                (5,  "Sightglass",         600, 8, 24),
                (9,  "Verve",              625, 8, 30),
                (12, "Stumptown",          650, 8, 12),
                (17, "Blue Bottle Coffee", 575, 8, 18),
                (22, "Sightglass",         600, 8, 22),
                (26, "Verve",              625, 8, 28),
            ]
            for c in mayaCoffees {
                out.append(tx(.expense, .coffee, c.cents, [maya], "Amex Gold",
                              merchant: c.merchant,
                              monthsBack: monthsBack, day: c.day, hour: c.hour, minute: c.minute,
                              household: householdID))
            }
            // Jordan + Alex coffees
            out.append(tx(.expense, .coffee,       550, [jordan], "Chase Sapphire",
                          merchant: "Sightglass",
                          monthsBack: monthsBack, day: 9, hour: 9, minute: 5,
                          household: householdID))
            out.append(tx(.expense, .coffee,       600, [alex],   "Chase Freedom",
                          merchant: "Verve",
                          monthsBack: monthsBack, day: 16, hour: 9, minute: 12,
                          household: householdID))
            out.append(tx(.expense, .coffee,       625, [jordan], "Chase Sapphire",
                          merchant: "Blue Bottle Coffee",
                          monthsBack: monthsBack, day: 23, hour: 9, minute: 8,
                          household: householdID))
            out.append(tx(.expense, .coffee,       700, [alex],   "Citi Double Cash",
                          merchant: "Stumptown",
                          monthsBack: monthsBack, day: 27, hour: 9, minute: 15,
                          household: householdID))

            // --- Groceries — spread across owners and weeks ---
            out.append(tx(.expense, .groceries, 11_242, [jordan], "Chase Sapphire",
                          merchant: "Whole Foods",
                          monthsBack: monthsBack, day: 4, hour: 12, minute: 8,
                          household: householdID))
            out.append(tx(.expense, .groceries,  3_480, [jordan], "Chase Sapphire",
                          merchant: "Bi-Rite Market",
                          monthsBack: monthsBack, day: 9, hour: 18, minute: 24,
                          household: householdID))
            out.append(tx(.expense, .groceries,  8_728, [maya],   "Amex Gold",
                          merchant: "Trader Joe's",
                          monthsBack: monthsBack, day: 11, hour: 18, minute: 18,
                          household: householdID))
            out.append(tx(.expense, .groceries,  4_250, [maya],   "Amex Gold",
                          merchant: "Whole Foods",
                          monthsBack: monthsBack, day: 16, hour: 17, minute: 42,
                          household: householdID))
            out.append(tx(.expense, .groceries,  5_820, [alex],   "Chase Freedom",
                          merchant: "Trader Joe's",
                          monthsBack: monthsBack, day: 20, hour: 19, minute: 14,
                          household: householdID))
            out.append(tx(.expense, .groceries,  6_412, [alex],   "Chase Freedom",
                          merchant: "Safeway",
                          monthsBack: monthsBack, day: 25, hour: 19, minute: 4,
                          household: householdID))

            // --- Dining — lunches, dinners, brunch; varied owners ---
            out.append(tx(.expense, .dining,     1_450, [maya],            "Amex Gold",
                          merchant: "Chipotle",
                          monthsBack: monthsBack, day: 2,  hour: 13, minute: 4,
                          household: householdID))
            out.append(tx(.expense, .dining,     1_520, [alex],            "Chase Freedom",
                          merchant: "Sweetgreen",
                          monthsBack: monthsBack, day: 6,  hour: 12, minute: 50,
                          household: householdID))
            out.append(tx(.expense, .dining,     1_620, [jordan],          "Chase Sapphire",
                          merchant: "Sweetgreen",
                          monthsBack: monthsBack, day: 8,  hour: 13, minute: 14,
                          household: householdID))
            out.append(tx(.expense, .dining,     4_280, [maya, jordan],    "Amex Gold",
                          merchant: "Mama's on Washington Sq",
                          monthsBack: monthsBack, day: 9,  hour: 11, minute: 0,
                          household: householdID))
            out.append(tx(.expense, .dining,     1_680, [jordan],          "Citi Double Cash",
                          merchant: "Burger Lounge",
                          monthsBack: monthsBack, day: 13, hour: 12, minute: 44,
                          household: householdID))
            out.append(tx(.expense, .dining,     3_450, [maya, alex],      "Amex Gold",
                          merchant: "Tartine Bakery",
                          monthsBack: monthsBack, day: 14, hour: 11, minute: 0,
                          household: householdID))
            out.append(tx(.expense, .dining,     1_340, [alex],            "Chase Freedom",
                          merchant: "Chipotle",
                          monthsBack: monthsBack, day: 17, hour: 13, minute: 8,
                          household: householdID))
            out.append(tx(.expense, .dining,     1_150, [maya],            "Amex Gold",
                          merchant: "Tartine Bakery",
                          monthsBack: monthsBack, day: 19, hour: 8, minute: 42,
                          household: householdID))
            out.append(tx(.expense, .dining,     5_880, [maya, jordan, alex], "Chase Sapphire",
                          merchant: "Mission Chinese",
                          monthsBack: monthsBack, day: 21, hour: 19, minute: 0,
                          household: householdID))
            out.append(tx(.expense, .dining,    12_800, [maya, jordan],    "Chase Sapphire",
                          merchant: "Lazy Bear",
                          monthsBack: monthsBack, day: 26, hour: 20, minute: 30,
                          household: householdID))
            out.append(tx(.expense, .dining,       920, [alex],            "Citi Double Cash",
                          merchant: "Smitten Ice Cream",
                          monthsBack: monthsBack, day: 28, hour: 20, minute: 12,
                          household: householdID))

            // --- Transit ---
            out.append(tx(.expense, .transit,    2_200, [maya],   "Amex Gold",
                          merchant: "Uber",
                          monthsBack: monthsBack, day: 4,  hour: 21, minute: 42,
                          household: householdID))
            out.append(tx(.expense, .transit,    1_400, [maya],   "Amex Gold",
                          merchant: "Uber",
                          monthsBack: monthsBack, day: 9,  hour: 19, minute: 28,
                          household: householdID))
            out.append(tx(.expense, .transit,      850, [jordan], "Chase Sapphire",
                          merchant: "BART",
                          monthsBack: monthsBack, day: 13, hour: 8,  minute: 12,
                          household: householdID))
            out.append(tx(.expense, .transit,    1_900, [alex],   "Chase Freedom",
                          merchant: "Uber",
                          monthsBack: monthsBack, day: 16, hour: 22, minute: 4,
                          household: householdID))
            out.append(tx(.expense, .transit,    1_850, [jordan], "Citi Double Cash",
                          merchant: "Lyft",
                          monthsBack: monthsBack, day: 18, hour: 20, minute: 12,
                          household: householdID))
            out.append(tx(.expense, .transit,    1_600, [maya],   "Amex Gold",
                          merchant: "Lyft",
                          monthsBack: monthsBack, day: 23, hour: 21, minute: 38,
                          household: householdID))

            // --- Fuel ---
            out.append(tx(.expense, .fuel,       4_210, [jordan], "Chase Sapphire",
                          merchant: "Shell",
                          monthsBack: monthsBack, day: 11, hour: 17, minute: 42,
                          household: householdID))
            out.append(tx(.expense, .fuel,       4_680, [jordan], "Chase Sapphire",
                          merchant: "Chevron",
                          monthsBack: monthsBack, day: 25, hour: 17, minute: 30,
                          household: householdID))

            // --- Health + sundries ---
            out.append(tx(.expense, .health,     5_200, [maya],   "Apple Card",
                          merchant: "ClassPass",
                          monthsBack: monthsBack, day: 6,  hour: 7,  minute: 0,
                          household: householdID))
            out.append(tx(.expense, .health,     1_840, [maya],   "Apple Card",
                          merchant: "CVS Pharmacy",
                          monthsBack: monthsBack, day: 23, hour: 11, minute: 32,
                          household: householdID))
            out.append(tx(.expense, .health,     1_120, [jordan], "Chase Sapphire",
                          merchant: "Walgreens",
                          monthsBack: monthsBack, day: 27, hour: 16, minute: 8,
                          household: householdID))

            // --- Personal Maya (visible only to her under Personal filter) ---
            out.append(tx(.expense, .health,    20_000, [maya],   "Apple Card",
                          merchant: "Dr. Chen Therapy",
                          monthsBack: monthsBack, day: 10, hour: 10, minute: 0,
                          household: nil))
            out.append(tx(.expense, .coffee,       650, [maya],   "Amex Gold",
                          merchant: "Sightglass",
                          monthsBack: monthsBack, day: 24, hour: 9, minute: 30,
                          household: nil))
        }

        return out
    }

    private static func buildRentalPayments(rentalID: Property.ID) -> [RentalPayment] {
        (0..<6).map { monthsBack in
            RentalPayment(
                propertyID: rentalID,
                amount: 240_000,
                date: dateOf(monthsBack: monthsBack, day: 1, hour: 10, minute: 0),
                note: nil
            )
        }
    }

    // MARK: - Helpers

    private static func tx(
        _ kind: TransactionKind,
        _ category: TransactionCategory,
        _ cents: Int64,
        _ ownerIDs: [User.ID],
        _ source: String,
        merchant: String,
        monthsBack: Int,
        day: Int,
        hour: Int,
        minute: Int,
        household: Household.ID?
    ) -> Transaction {
        Transaction(
            merchant: merchant,
            category: category,
            kind: kind,
            amount: cents,
            scope: household == nil ? .personal : .shared,
            ownerIDs: Set(ownerIDs),
            source: source,
            date: dateOf(monthsBack: monthsBack, day: day, hour: hour, minute: minute),
            householdID: household,
            createdBy: ownerIDs.first ?? User.mayaSample.id
        )
    }

    private static func dateOf(monthsBack: Int, day: Int, hour: Int, minute: Int) -> Date {
        let cal = Calendar.current
        let now = Date()
        let monthBase = cal.date(byAdding: .month, value: -monthsBack, to: now) ?? now
        var comps = cal.dateComponents([.year, .month], from: monthBase)
        comps.day = day
        comps.hour = hour
        comps.minute = minute
        return cal.date(from: comps) ?? monthBase
    }
}

#endif
