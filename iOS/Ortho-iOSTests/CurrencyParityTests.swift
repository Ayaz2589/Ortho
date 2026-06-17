import XCTest
@testable import Ortho_iOS

// Asserts the Swift currency conversion (`Money.toDisplayAmount` /
// `Money.toUSDCents`) matches the shared golden vectors that the web Vitest
// suite also asserts (shared/test-vectors/currency.json). Money is always stored
// as USD cents; both clients must convert identically (same rounding, the same
// zero-fraction handling) across every supported currency.
//
// SETUP: add `currency.json` to this test target's "Copy Bundle Resources" so
// `Bundle(for:).url(forResource:)` resolves it.

private struct ToDisplayCaseJSON: Decodable {
    let name: String
    let cents: Int64
    let currency: String
    let rate: Double
    let expected: Double
}

private struct ToUsdCaseJSON: Decodable {
    let name: String
    let amount: Double
    let currency: String
    let rate: Double
    let expected: Int64
}

private struct CurrencyVectors: Decodable {
    let toDisplay: [ToDisplayCaseJSON]
    let toUsdCents: [ToUsdCaseJSON]
}

final class CurrencyParityTests: XCTestCase {
    private func loadVectors() throws -> CurrencyVectors {
        let bundle = Bundle(for: type(of: self))
        guard let url = bundle.url(forResource: "currency", withExtension: "json") else {
            XCTFail("currency.json missing from the test bundle (add it to Copy Bundle Resources)")
            throw NSError(domain: "vectors", code: 1)
        }
        return try JSONDecoder().decode(CurrencyVectors.self, from: Data(contentsOf: url))
    }

    func testToDisplayAmountParity() throws {
        let vectors = try loadVectors()
        for c in vectors.toDisplay {
            guard let cur = Currency(rawValue: c.currency) else { XCTFail("unknown currency \(c.currency)"); continue }
            // Rate parity: the iOS fallback rate must equal the vector's (TS) rate.
            XCTAssertEqual(NSDecimalNumber(decimal: cur.fallbackRateFromUSD).doubleValue, c.rate, accuracy: 1e-9, "rate parity: \(c.name)")
            let result = Money.toDisplayAmount(cents: c.cents, in: cur, rate: cur.fallbackRateFromUSD)
            XCTAssertEqual(NSDecimalNumber(decimal: result).doubleValue, c.expected, accuracy: 1e-6, "toDisplayAmount: \(c.name)")
        }
    }

    func testToUSDCentsParity() throws {
        let vectors = try loadVectors()
        for c in vectors.toUsdCents {
            guard let cur = Currency(rawValue: c.currency) else { XCTFail("unknown currency \(c.currency)"); continue }
            let result = Money.toUSDCents(Decimal(c.amount), from: cur, rate: cur.fallbackRateFromUSD)
            XCTAssertEqual(result, c.expected, "toUSDCents: \(c.name)")
        }
    }
}
