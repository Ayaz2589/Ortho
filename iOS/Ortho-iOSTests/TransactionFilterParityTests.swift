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

    // Not covered by the shared vector: `monthBounds` STRICT `^\d{4}-\d{2}$`
    // validation. Web THROWS INVALID_MONTH; the Swift call sites use `if let`,
    // so the mirrored strictness surfaces as `nil` for a malformed month.
    func testMonthBoundsStrictValidation() {
        XCTAssertNotNil(monthBounds("2026-05"), "a well-formed month must parse")
        XCTAssertNotNil(monthBounds("2026-12"))
        XCTAssertNotNil(monthBounds("2026-01"))
        for bad in ["2026-5", "26-5", "2026-005", "2026--5", "2026-13", "2026-00", "2026/05", "2026-5a", "", "2026-05 "] {
            XCTAssertNil(monthBounds(bad), "must reject malformed month \(bad.debugDescription)")
        }
    }

    // Not covered by the shared vector: `availableSources` uses a LOCALIZED,
    // case-insensitive order (mirrors web `localeCompare`), NOT Swift's default
    // Unicode code-point `sorted()` (which would put "Chase"/"TD" before "apple").
    func testAvailableSourcesLocalizedOrder() {
        let txs = [
            makeTx(source: "TD Bank"),
            makeTx(source: "apple"),
            makeTx(source: "Chase"),
            makeTx(source: "  "),        // blank → dropped
            makeTx(source: "apple"),     // duplicate → deduped
        ]
        XCTAssertEqual(availableSources(txs), ["apple", "Chase", "TD Bank"])
    }

    private func makeTx(source: String) -> Transaction {
        Transaction(
            merchant: "M", category: .groceries, kind: .expense, amount: 0,
            ownerIDs: [], source: source, date: Date(), createdBy: UUID()
        )
    }
}

// Regression: a single row whose `kind`/`category` the installed build doesn't
// recognize (a server/data shape ahead of the client) must NOT make the whole
// transactions decode throw and empty the list. `Lenient` tolerates the unknown
// value so the row is dropped and every other row survives. (The "no
// transactions, again" bug after the `transfer` kind/category shipped.)
final class TransactionDecodeResilienceTests: XCTestCase {

    func testLenientDecodesKnownAndUnknownRawValues() throws {
        let dec = JSONDecoder()
        let known = try dec.decode(Lenient<TransactionKind>.self, from: Data("\"expense\"".utf8))
        XCTAssertEqual(known.value, .expense)
        let unknown = try dec.decode(Lenient<TransactionKind>.self, from: Data("\"frobnicate\"".utf8))
        XCTAssertNil(unknown.value, "an unrecognized raw value must decode to .unknown, not throw")
    }

    func testOneUnknownValueDoesNotFailTheWholeArrayDecode() throws {
        // The crux of the bug: a strict [enum] decode throws on the bad element and
        // loses ALL of them. With Lenient the array decodes and good rows survive.
        let json = Data("[\"expense\",\"frobnicate\",\"income\",\"transfer\"]".utf8)
        let arr = try JSONDecoder().decode([Lenient<TransactionKind>].self, from: json)
        XCTAssertEqual(arr.count, 4)
        XCTAssertEqual(arr.compactMap(\.value), [.expense, .income, .transfer])
    }

    func testLenientEncodesBackToRawValue() throws {
        let data = try JSONEncoder().encode(Lenient<TransactionCategory>.known(.transfer))
        XCTAssertEqual(String(decoding: data, as: UTF8.self), "\"transfer\"")
    }
}
