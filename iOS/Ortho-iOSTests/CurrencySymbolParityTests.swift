import XCTest
@testable import Ortho_iOS

/// Asserts the Swift per-currency SYMBOL against the shared golden vector
/// `shared/test-vectors/currency-symbols.json` — the same file the web Vitest
/// suite (`currency-symbols.parity.test.ts`) asserts. Both clients read a FIXED
/// table (no locale derivation): CNY was locale-derived "¥" on iOS and now is
/// "CN¥", so it never collides with JPY "¥".
///
/// SETUP: add `currency-symbols.json` to this test target's "Copy Bundle
/// Resources" so `Bundle(for:).url(forResource:)` resolves it.
final class CurrencySymbolParityTests: XCTestCase {

    func testCurrencySymbolsMatchVector() throws {
        let url = try XCTUnwrap(
            Bundle(for: Self.self).url(forResource: "currency-symbols", withExtension: "json"),
            "Add shared/test-vectors/currency-symbols.json to this test target's Copy Bundle Resources"
        )
        let symbols = try JSONDecoder().decode([String: String].self, from: Data(contentsOf: url))
        XCTAssertEqual(symbols.count, 7, "expected all 7 currencies in the vector")

        for c in Currency.allCases {
            let expected = try XCTUnwrap(symbols[c.rawValue], "vector missing \(c.rawValue)")
            XCTAssertEqual(Money.symbol(for: c), expected, "symbol mismatch for \(c.rawValue)")
        }

        // CNY must stay disambiguated from JPY (the whole point of the fixed table).
        XCTAssertEqual(Money.symbol(for: .cny), "CN¥")
        XCTAssertNotEqual(Money.symbol(for: .cny), Money.symbol(for: .jpy))
    }
}
