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

private struct SplitVectors: Decodable {
    let cases: [SplitCaseJSON]
    let validations: [ValCaseJSON]
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
}
