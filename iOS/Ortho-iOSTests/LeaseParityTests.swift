import XCTest
@testable import Ortho_iOS

/// Asserts `LeaseInfo`'s rent-date math against the shared golden vector
/// `shared/test-vectors/lease.json` — the same file the web Vitest suite
/// asserts against `web/components/housing/lease.ts`. In particular this pins
/// the due-day clamp: a due day of 31 resolves to the target month's last day
/// (June 30, Feb 28), never overflowing into the next month.
///
/// SETUP: add `lease.json` to this test target's "Copy Bundle Resources" so
/// `Bundle(for:).url(forResource:)` resolves it. (Mirrors MortgageParityTests.)
final class LeaseParityTests: XCTestCase {

    private struct Vector: Decodable { let input: Input; let expected: Expected }
    private struct Input: Decodable { let name: String; let lease: LeaseJSON; let asOf: String }
    private struct LeaseJSON: Decodable {
        let monthlyRentCents: Int64
        let leaseStart: String
        let leaseEnd: String
        let securityDepositCents: Int64?
        let paidWithSource: String?
    }
    private struct Expected: Decodable {
        let rentDueDay: Int
        let daysUntilNextRent: Int
        let daysUntilEnd: Int
        let isRenewalSoon: Bool
    }

    /// Parse `YYYY-MM-DD` as a local calendar date (matches the TS test and the
    /// Swift lease code, which use `Calendar.current`).
    private func localDate(_ s: String) -> Date {
        let p = s.split(separator: "-").compactMap { Int($0) }
        var c = DateComponents(); c.year = p[0]; c.month = p[1]; c.day = p[2]
        return Calendar.current.date(from: c)!
    }

    func testLeaseVectors() throws {
        let url = try XCTUnwrap(
            Bundle(for: Self.self).url(forResource: "lease", withExtension: "json"),
            "Add shared/test-vectors/lease.json to this test target's Copy Bundle Resources"
        )
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let vectors = try decoder.decode([Vector].self, from: Data(contentsOf: url))
        XCTAssertFalse(vectors.isEmpty)

        for v in vectors {
            let i = v.input, e = v.expected
            let asOf = localDate(i.asOf)
            let info = LeaseInfo(
                monthlyRent: i.lease.monthlyRentCents,
                leaseStart: localDate(i.lease.leaseStart),
                leaseEnd: localDate(i.lease.leaseEnd),
                securityDepositCents: i.lease.securityDepositCents,
                paidWithSource: i.lease.paidWithSource
            )

            XCTAssertEqual(info.rentDueDay, e.rentDueDay, i.name)
            XCTAssertEqual(info.daysUntilNextRent(asOf: asOf), e.daysUntilNextRent, i.name)
            XCTAssertEqual(info.daysUntilEnd(asOf: asOf), e.daysUntilEnd, i.name)
            XCTAssertEqual(info.isRenewalSoon(asOf: asOf), e.isRenewalSoon, i.name)
        }
    }
}
