import XCTest
@testable import Ortho_iOS

/// Asserts the Swift per-currency DISPLAY NAME against the shared golden vector
/// `shared/test-vectors/currency-names.json` — the same file the web Vitest
/// suite (`currency-names.parity.test.ts`) asserts. The two clients must name
/// every currency identically (GBP was "British Pound" on web vs "UK Pound" on
/// iOS; both are now "UK Pound").
///
/// SETUP: add `currency-names.json` to this test target's "Copy Bundle
/// Resources" so `Bundle(for:).url(forResource:)` resolves it.
final class CurrencyNameParityTests: XCTestCase {

    /// Resolve `displayName` to its English string so the comparison is stable
    /// regardless of the test host's locale (the vector values are English).
    private func englishName(_ c: Currency) -> String {
        var res = c.displayName
        res.locale = Locale(identifier: "en")
        return String(localized: res)
    }

    func testCurrencyNamesMatchVector() throws {
        let url = try XCTUnwrap(
            Bundle(for: Self.self).url(forResource: "currency-names", withExtension: "json"),
            "Add shared/test-vectors/currency-names.json to this test target's Copy Bundle Resources"
        )
        let names = try JSONDecoder().decode([String: String].self, from: Data(contentsOf: url))
        XCTAssertEqual(names.count, 7, "expected all 7 currencies in the vector")

        for c in Currency.allCases {
            let expected = try XCTUnwrap(names[c.rawValue], "vector missing \(c.rawValue)")
            XCTAssertEqual(englishName(c), expected, "display name mismatch for \(c.rawValue)")
        }
    }
}
