import XCTest
@testable import Ortho_iOS

/// Asserts the Swift net-rental math against `shared/test-vectors/housing-net-rental.json`
/// — the same canonical vectors the web Vitest suite (`housing-net-rental.parity.test.ts`)
/// asserts. If Swift and TypeScript ever disagree on how the Dashboard summary and the
/// property-detail net balance are computed, one of these suites fails.
///
/// The vector JSON is bundled into the test target via a "Copy Bundle Resources"
/// entry in `project.pbxproj` (mirroring `mortgage.json` / `member-balance.json`).
final class HousingNetRentalParityTests: XCTestCase {
    private struct Vector: Decodable { let input: Input; let expected: Expected }
    private struct Input: Decodable { let name: String; let units: [VUnit]; let mortgagePaymentCents: Int64 }
    private struct VUnit: Decodable { let rentCents: Int64; let occupied: Bool }
    private struct Expected: Decodable { let occupiedRentCents: Int64; let netRentalCents: Int64 }

    func testHousingNetRentalVectors() throws {
        let url = Bundle(for: type(of: self)).url(forResource: "housing-net-rental", withExtension: "json")!
        let vectors = try JSONDecoder().decode([Vector].self, from: Data(contentsOf: url))
        XCTAssertFalse(vectors.isEmpty)

        for v in vectors {
            let units = v.input.units.map { HousingMath.RentUnit(rentCents: $0.rentCents, occupied: $0.occupied) }
            XCTAssertEqual(
                HousingMath.occupiedRentCents(units),
                v.expected.occupiedRentCents,
                "occupiedRentCents — \(v.input.name)"
            )
            XCTAssertEqual(
                HousingMath.netRentalCents(units, mortgagePaymentCents: v.input.mortgagePaymentCents),
                v.expected.netRentalCents,
                "netRentalCents — \(v.input.name)"
            )
        }
    }
}
