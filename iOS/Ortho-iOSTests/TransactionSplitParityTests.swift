import XCTest
@testable import Ortho_iOS

// Asserts the Swift split math matches the shared golden vectors that the web
// Vitest suite also asserts (shared/test-vectors/transaction-splits.json).
//
// SETUP: add `transaction-splits.json` to this test target's
// "Copy Bundle Resources" so `Bundle(for:).url(forResource:)` resolves it.

private struct SplitJSON: Decodable {
    let method: String
    let percents: [String: Double]?
    let values: [String: Int64]?
    func toInput() -> SplitInput<String> {
        switch method {
        case "percent": return .percent(percents ?? [:])
        case "value":   return .value(values ?? [:])
        default:        return .even
        }
    }
}

private struct SplitCaseJSON: Decodable {
    let name: String
    let amountCents: Int64
    let owners: [String]
    let split: SplitJSON
    let expected: [String: Int64]
}

private struct ValResultJSON: Decodable {
    let ok: Bool
    let reason: String?
}

private struct ValCaseJSON: Decodable {
    let name: String
    let amountCents: Int64
    let owners: [String]
    let split: SplitJSON
    let result: ValResultJSON
}

private struct SeedJSON: Decodable {
    let method: String
    let values: [String: Int64]?
}

private struct SeedCaseJSON: Decodable {
    let name: String
    let amountCents: Int64
    let owners: [String]
    let storedCents: [String: Int64]
    let expected: SeedJSON
    let roundTrip: [String: Int64]
}

private struct SplitVectors: Decodable {
    let cases: [SplitCaseJSON]
    let validations: [ValCaseJSON]
    let seeds: [SeedCaseJSON]
}

final class TransactionSplitParityTests: XCTestCase {
    private func loadVectors() throws -> SplitVectors {
        let bundle = Bundle(for: type(of: self))
        guard let url = bundle.url(forResource: "transaction-splits", withExtension: "json") else {
            XCTFail("transaction-splits.json missing from the test bundle (add it to Copy Bundle Resources)")
            throw NSError(domain: "vectors", code: 1)
        }
        return try JSONDecoder().decode(SplitVectors.self, from: Data(contentsOf: url))
    }

    func testComputeSharesParity() throws {
        let vectors = try loadVectors()
        for c in vectors.cases {
            let shares = computeShares(c.amountCents, c.owners, c.split.toInput())
            XCTAssertEqual(shares, c.expected, "computeShares case: \(c.name)")
            if c.split.method != "value" && !c.owners.isEmpty {
                XCTAssertEqual(shares.values.reduce(0, +), c.amountCents, "sum case: \(c.name)")
            }
        }
    }

    func testValidateSplitParity() throws {
        let vectors = try loadVectors()
        for c in vectors.validations {
            let result = validateSplit(c.amountCents, c.owners, c.split.toInput())
            let expected: SplitValidation = c.result.ok ? .ok : .invalid(reason: c.result.reason ?? "")
            XCTAssertEqual(result, expected, "validateSplit case: \(c.name)")
        }
    }

    /// Locks the lossless custom-split edit-prefill: a non-even stored split
    /// seeds as `.value` with the exact cents, and applying the seed re-derives
    /// the stored cents (no silent re-even-split on save).
    func testSeedSplitParity() throws {
        let vectors = try loadVectors()
        for c in vectors.seeds {
            let seed = seedSplit(c.amountCents, c.owners, c.storedCents)
            switch seed {
            case .even:
                XCTAssertEqual(c.expected.method, "even", "seedSplit method: \(c.name)")
            case .value(let values):
                XCTAssertEqual(c.expected.method, "value", "seedSplit method: \(c.name)")
                XCTAssertEqual(values, c.expected.values, "seedSplit values: \(c.name)")
            case .percent:
                XCTFail("seedSplit must never return .percent (\(c.name))")
            }
            let rt = computeShares(c.amountCents, c.owners, seed)
            XCTAssertEqual(rt, c.roundTrip, "seedSplit round-trip: \(c.name)")
            XCTAssertEqual(rt, c.storedCents, "seedSplit lossless: \(c.name)")
        }
    }
}
