import XCTest
@testable import Ortho_iOS

/// spec 018 — the shell's paywall decision (FR-006…FR-009), tested through
/// the pure seam `EntitlementLogic.shouldShowPaywall` (the exact expression
/// `Ortho_iOSApp` gates on), never a live `AppState`/`SupabaseClient` —
/// matching the existing parity suites' approach.
@MainActor
final class EntitlementGateTests: XCTestCase {

    /// Only a genuinely lapsed gate blocks the app.
    func test_lapsedShowsPaywall() {
        XCTAssertTrue(EntitlementLogic.shouldShowPaywall(gate: .lapsed))
    }

    /// Every non-lapsed state keeps full access — grace deliberately included
    /// (FR-026: full access + calm Settings notice, never a takeover).
    func test_nonLapsedStatesNeverGate() {
        for gate in [GateState.admin, .trialing, .active, .grace] {
            XCTAssertFalse(EntitlementLogic.shouldShowPaywall(gate: gate),
                           "\(gate.rawValue) must not show the paywall")
        }
    }

    /// A nil gate — entitlement not loaded yet, load failed (recovery path
    /// owns that), or seeded/test-data mode — NEVER gates (FR-008/009).
    func test_nilGateNeverGates() {
        XCTAssertFalse(EntitlementLogic.shouldShowPaywall(gate: nil))
    }

    /// End-to-end shape: a freshly derived state drives the same decision the
    /// shell makes (derivation + gate selection composed, no UI involved).
    func test_derivedStateDrivesGate() {
        let now = EntitlementLogic.parseTimestamp("2026-07-05T12:00:00Z")!

        // Trial with time left → open.
        let trialing = EntitlementLogic.deriveGateState(
            status: .trialing,
            accessExpiresAt: EntitlementLogic.parseTimestamp("2026-07-20T00:00:00Z"),
            now: now
        )
        XCTAssertFalse(EntitlementLogic.shouldShowPaywall(gate: trialing))

        // Trial expired beyond leeway → blocked.
        let lapsed = EntitlementLogic.deriveGateState(
            status: .trialing,
            accessExpiresAt: EntitlementLogic.parseTimestamp("2026-07-01T00:00:00Z"),
            now: now
        )
        XCTAssertTrue(EntitlementLogic.shouldShowPaywall(gate: lapsed))
    }
}
