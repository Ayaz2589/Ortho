import XCTest
@testable import Ortho_iOS

// Parity: the Swift `filterTransactions` must match the shared golden vectors
// (web-generated). Add `shared/test-vectors/transaction-filters.json` to this test
// target's "Copy Bundle Resources" so it loads from the test bundle.
// Mirror of web/test/transaction-filters.parity.test.ts. See specs/006-transaction-filters.
final class TransactionFilterParityTests: XCTestCase {

    // The vector JSON uses string-keyed objects / string arrays; decode loosely then
    // map to the strongly-typed FilterCriteria/FilterContext (UUID/enum) below.
    private struct CtxJSON: Decodable { let ownerNames: [String: String] }
    private struct CritJSON: Decodable {
        let query: String; let categories: [String]; let kind: String
        let sources: [String]; let owners: [String]; let dateFrom: String?; let dateTo: String?
    }
    private struct Case: Decodable {
        let name: String; let transactions: [Transaction]; let context: CtxJSON
        let criteria: CritJSON; let expectedIds: [UUID]
    }
    private struct Vectors: Decodable { let cases: [Case] }

    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private func makeDecoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { dec in
            let s = try dec.singleValueContainer().decode(String.self)
            guard let date = Self.iso.date(from: s) else {
                throw DecodingError.dataCorrupted(.init(codingPath: dec.codingPath, debugDescription: "bad ISO date \(s)"))
            }
            return date
        }
        return d
    }

    func testFilterParityVsGoldenVectors() throws {
        let url = try XCTUnwrap(
            Bundle(for: Self.self).url(forResource: "transaction-filters", withExtension: "json"),
            "Add shared/test-vectors/transaction-filters.json to this test target's Copy Bundle Resources"
        )
        let data = try Data(contentsOf: url)
        let vectors = try makeDecoder().decode(Vectors.self, from: data)
        XCTAssertFalse(vectors.cases.isEmpty)

        for c in vectors.cases {
            let ctx = FilterContext(
                ownerNames: Dictionary(uniqueKeysWithValues: c.context.ownerNames.compactMap { key, val in
                    UUID(uuidString: key).map { ($0, val) }
                })
            )
            let criteria = FilterCriteria(
                query: c.criteria.query,
                categories: Set(c.criteria.categories.compactMap(TransactionCategory.init(rawValue:))),
                kind: FilterCriteria.Kind(rawValue: c.criteria.kind) ?? .all,
                sources: Set(c.criteria.sources),
                owners: Set(c.criteria.owners.compactMap(UUID.init(uuidString:))),
                dateFrom: c.criteria.dateFrom.flatMap(Self.iso.date(from:)),
                dateTo: c.criteria.dateTo.flatMap(Self.iso.date(from:))
            )
            let got = filterTransactions(c.transactions, criteria, ctx).map(\.id)
            XCTAssertEqual(got, c.expectedIds, "case: \(c.name)")
        }
    }
}
