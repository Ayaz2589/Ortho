import XCTest
@testable import Ortho_iOS

/// spec 015 — test-build feature flags + the refreshed sample dataset.
///
/// These assert against the pure flag registry and the model `*.sample` statics
/// (and the free `balanceBetween`), never a live `AppState`/`SupabaseClient` —
/// matching the existing parity suites. The test-data *isolation* guarantee
/// (mutators skip the network when `testDataEnabled`) is a guard on every
/// `AppState` mutator, verified by code review and by the web equivalent
/// (`web/test/store/test-data-isolation.test.tsx`); it can't be unit-tested here
/// without constructing a network-backed `AppState`.
@MainActor
final class FeatureFlagsTests: XCTestCase {

    private func freshDefaults() -> UserDefaults {
        let name = "spec015-ff-\(UUID().uuidString)"
        let d = UserDefaults(suiteName: name)!
        d.removePersistentDomain(forName: name)
        return d
    }

    // MARK: - Flag registry (C-FF-1, C-FF-4, C-FF-5)

    func test_flagsDefaultOff() {
        let d = freshDefaults()
        XCTAssertFalse(FeatureFlags.useTestData(isTestBuild: true, defaults: d))
        XCTAssertFalse(FeatureFlags.bypassAuth(isTestBuild: true, defaults: d))
        XCTAssertFalse(FeatureFlags.effectiveUseTestData(isTestBuild: true, defaults: d))
    }

    func test_persistenceRoundTrip() {
        let d = freshDefaults()
        d.set(true, forKey: FeatureFlags.useTestDataKey)
        XCTAssertTrue(FeatureFlags.useTestData(isTestBuild: true, defaults: d))
        d.set(false, forKey: FeatureFlags.useTestDataKey)
        XCTAssertFalse(FeatureFlags.useTestData(isTestBuild: true, defaults: d))
    }

    func test_bypassImpliesTestData() {
        let d = freshDefaults()
        d.set(true, forKey: FeatureFlags.bypassAuthKey) // only bypass set
        XCTAssertFalse(FeatureFlags.useTestData(isTestBuild: true, defaults: d))
        XCTAssertTrue(FeatureFlags.effectiveUseTestData(isTestBuild: true, defaults: d))
    }

    /// FR-003 / SC-004: off a test build, a persisted "on" value is ignored.
    func test_productionForceOff() {
        let d = freshDefaults()
        d.set(true, forKey: FeatureFlags.useTestDataKey)
        d.set(true, forKey: FeatureFlags.bypassAuthKey)
        XCTAssertFalse(FeatureFlags.useTestData(isTestBuild: false, defaults: d))
        XCTAssertFalse(FeatureFlags.bypassAuth(isTestBuild: false, defaults: d))
        XCTAssertFalse(FeatureFlags.effectiveUseTestData(isTestBuild: false, defaults: d))
    }

    // MARK: - Refreshed sample dataset (FR-009..012, SC-003)

    func test_sampleOwnersResolveToPeople() {
        let personIDs = Set(Person.sample.map(\.id))
        XCTAssertFalse(Transaction.sample.isEmpty)
        for tx in Transaction.sample {
            for owner in tx.ownerIDs {
                XCTAssertTrue(personIDs.contains(owner),
                              "owner \(owner) is not a sample Person (would render as Removed)")
            }
        }
    }

    func test_sampleExpensesCarryPayerAndIncludeTransfer() {
        for tx in Transaction.sample where tx.kind == .expense {
            XCTAssertNotNil(tx.paidBy, "expense \(tx.merchant) has no paidBy")
        }
        XCTAssertTrue(Transaction.sample.contains { $0.kind == .transfer },
                      "sample has no reimbursement transfer")
    }

    func test_sampleSpansMultipleMonths() {
        let dates = Transaction.sample.map(\.date)
        let span = dates.max()!.timeIntervalSince(dates.min()!)
        XCTAssertGreaterThan(span, 60 * 24 * 60 * 60, "sample spans < ~2 months")
    }

    func test_sampleMemberBalancesAreNonZero() {
        let net = balanceBetween(
            viewer: Person.mayaSample.id,
            other: Person.jordanSample.id,
            transactions: Transaction.sample
        )
        XCTAssertNotEqual(net, 0, "sample produces a zero balance between the two members")
    }

    func test_sampleIncludesBudgetsAndRentalPayments() {
        XCTAssertFalse(Budget.sample.isEmpty)
        XCTAssertFalse(RentalPayment.sample.isEmpty)
    }
}
