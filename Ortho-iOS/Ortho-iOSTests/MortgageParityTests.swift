import XCTest
@testable import Ortho_iOS

/// Asserts `MortgageInfo` against `shared/test-vectors/mortgage.json` — the same
/// canonical vectors the web Vitest suite uses. If Swift and TypeScript ever
/// diverge on the mortgage math, this fails.
///
/// Setup (one-time, in Xcode): add an `Ortho-iOSTests` unit-test target if you
/// don't have one, add this file to it, and add `mortgage.json` /
/// `insights.json` (from `shared/test-vectors/`) to the test target's
/// "Copy Bundle Resources" so `Bundle(for:)` can find them.
final class MortgageParityTests: XCTestCase {

    private struct Vector: Decodable { let input: Input; let expected: Expected }
    private struct Input: Decodable {
        let name: String
        let purchasePriceCents: Int64
        let originalLoanCents: Int64
        let annualRatePercent: Double
        let termYears: Int
        let closingDate: String
        let asOf: String
    }
    private struct Amort: Decodable, Equatable { let principalCents: Int64; let interestCents: Int64 }
    private struct Expected: Decodable {
        let monthlyPaymentCents: Int64
        let currentPrincipalBalanceCents: Int64
        let currentEquityCents: Int64
        let equityFraction: Double
        let maturityDate: String
        let yearsRemaining: Int
        let amortization12: [Amort]
    }

    /// Parse `YYYY-MM-DD` as a local calendar date (matches the TS test).
    private func localDate(_ s: String) -> Date {
        let p = s.split(separator: "-").compactMap { Int($0) }
        var c = DateComponents(); c.year = p[0]; c.month = p[1]; c.day = p[2]
        return Calendar.current.date(from: c)!
    }
    private func ymd(_ d: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }

    func testMortgageVectors() throws {
        let url = Bundle(for: type(of: self)).url(forResource: "mortgage", withExtension: "json")!
        let vectors = try JSONDecoder().decode([Vector].self, from: Data(contentsOf: url))
        XCTAssertFalse(vectors.isEmpty)

        for v in vectors {
            let i = v.input, e = v.expected
            let asOf = localDate(i.asOf)
            let info = MortgageInfo(
                purchasePrice: i.purchasePriceCents,
                originalLoan: i.originalLoanCents,
                annualInterestRatePercent: Decimal(i.annualRatePercent),
                loanTermYears: i.termYears,
                closingDate: localDate(i.closingDate)
            )

            XCTAssertEqual(info.monthlyPaymentCents, e.monthlyPaymentCents, i.name)
            XCTAssertEqual(info.currentPrincipalBalanceCents(asOf: asOf), e.currentPrincipalBalanceCents, i.name)
            XCTAssertEqual(info.currentEquityCents(asOf: asOf), e.currentEquityCents, i.name)
            XCTAssertEqual(info.equityFraction(asOf: asOf), e.equityFraction, accuracy: 1e-9, i.name)
            XCTAssertEqual(ymd(info.maturityDate), e.maturityDate, i.name)
            XCTAssertEqual(info.yearsRemaining(asOf: asOf), e.yearsRemaining, i.name)

            let amort = info.upcomingAmortization(months: 12, asOf: asOf)
                .map { Amort(principalCents: $0.principalCents, interestCents: $0.interestCents) }
            XCTAssertEqual(amort, e.amortization12, i.name)
        }
    }
}
