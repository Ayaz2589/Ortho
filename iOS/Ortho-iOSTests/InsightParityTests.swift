import XCTest
@testable import Ortho_iOS

/// Asserts `InsightEngine` against `shared/test-vectors/insights.json` — the
/// same canonical vectors the web Vitest suite uses. Locks the 8-rule engine's
/// output (fired insight IDs + severity + category + magnitude) across Swift
/// and TypeScript. See MortgageParityTests for one-time Xcode setup.
final class InsightParityTests: XCTestCase {

    private struct Vector: Decodable { let input: Input; let expected: [Expected] }
    private struct Input: Decodable {
        let name: String
        let referenceDate: String
        let transactions: [Tx]
        let budgets: [Bud]
        let properties: [Prop]
    }
    private struct Tx: Decodable {
        let id: String?
        let kind: String
        let category: String
        let amount_cents: Int64
        let date: String
        let merchant: String
    }
    private struct Bud: Decodable { let category: String; let monthly_limit_cents: Int64 }
    private struct Prop: Decodable { let mortgage: Mort? }
    private struct Mort: Decodable {
        let purchase_price_cents: Int64
        let original_loan_cents: Int64
        let annual_interest_rate_percent: Double
        let loan_term_years: Int
    }
    private struct Expected: Decodable, Equatable {
        let id: String
        let severity: String
        let category: String?
        let magnitude_cents: Int64
    }

    private func localDate(_ s: String) -> Date {
        let p = s.split(separator: "-").compactMap { Int($0) }
        var c = DateComponents(); c.year = p[0]; c.month = p[1]; c.day = p[2]
        return Calendar.current.date(from: c)!
    }
    /// Mirrors JS `new Date('yyyy-mm-dd')` (UTC midnight) for transaction dates.
    private func utcDate(_ s: String) -> Date {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "UTC")
        f.locale = Locale(identifier: "en_US_POSIX")
        return f.date(from: s)!
    }
    private func severityName(_ s: InsightSeverity) -> String {
        switch s {
        case .critical: return "critical"
        case .warning:  return "warning"
        case .info:     return "info"
        case .positive: return "positive"
        }
    }

    func testInsightVectors() throws {
        let url = Bundle(for: type(of: self)).url(forResource: "insights", withExtension: "json")!
        let vectors = try JSONDecoder().decode([Vector].self, from: Data(contentsOf: url))
        XCTAssertFalse(vectors.isEmpty)

        let user = UUID()
        let household = UUID()

        for v in vectors {
            let transactions = v.input.transactions.map { t in
                Transaction(
                    // Use the vector's id when present so id-bearing insights (the
                    // outlier rule's `outlier-<uuid>`) match across clients; else random.
                    id: t.id.flatMap { UUID(uuidString: $0) } ?? UUID(),
                    merchant: t.merchant,
                    category: TransactionCategory(rawValue: t.category)!,
                    kind: TransactionKind(rawValue: t.kind)!,
                    amount: t.amount_cents,
                    ownerIDs: [user],
                    shares: [user: t.amount_cents],
                    source: "",
                    date: utcDate(t.date),
                    householdID: household,
                    createdBy: user
                )
            }
            let budgets = v.input.budgets.map {
                Budget(householdID: household,
                       category: TransactionCategory(rawValue: $0.category)!,
                       monthlyLimitCents: $0.monthly_limit_cents)
            }
            let properties: [Property] = v.input.properties.map { p in
                let m = p.mortgage.map { mo in
                    MortgageInfo(purchasePrice: mo.purchase_price_cents,
                                 originalLoan: mo.original_loan_cents,
                                 annualInterestRatePercent: Decimal(mo.annual_interest_rate_percent),
                                 loanTermYears: mo.loan_term_years,
                                 closingDate: Date(timeIntervalSince1970: 0),
                                 autoPaySource: nil)
                }
                return Property(householdID: household, kind: .primaryHome, address: "", mortgage: m)
            }

            let got = InsightEngine.recommendations(
                transactions: transactions,
                budgets: budgets,
                properties: properties,
                referenceDate: localDate(v.input.referenceDate)
            ).map {
                Expected(id: $0.id,
                         severity: severityName($0.severity),
                         category: $0.category?.rawValue,
                         magnitude_cents: $0.magnitudeCents)
            }

            XCTAssertEqual(got, v.expected, v.input.name)
        }
    }
}
