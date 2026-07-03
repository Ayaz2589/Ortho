import XCTest
@testable import Ortho_iOS

/// spec 015 — test-build feature flags, the refreshed sample dataset, and
/// test-data isolation. Covers contracts feature-flags.md and test-data-store.md.
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
        let app = AppState(testDataEnabled: true)
        XCTAssertFalse(app.transactions.isEmpty)
        for tx in app.transactions {
            for owner in tx.ownerIDs {
                XCTAssertTrue(app.people.contains { $0.id == owner },
                              "owner \(owner) is not a sample Person")
                XCTAssertNotEqual(app.user(owner).id, User.placeholder.id,
                                  "owner \(owner) resolved to the Removed placeholder")
            }
        }
    }

    func test_sampleExpensesCarryPayerAndIncludeTransfer() {
        let app = AppState(testDataEnabled: true)
        for tx in app.transactions where tx.kind == .expense {
            XCTAssertNotNil(tx.paidBy, "expense \(tx.merchant) has no paidBy")
        }
        XCTAssertTrue(app.transactions.contains { $0.kind == .transfer },
                      "sample has no reimbursement transfer")
    }

    func test_sampleSpansMultipleMonths() {
        let app = AppState(testDataEnabled: true)
        let dates = app.transactions.map(\.date)
        let span = dates.max()!.timeIntervalSince(dates.min()!)
        XCTAssertGreaterThan(span, 60 * 24 * 60 * 60, "sample spans < ~2 months")
    }

    func test_sampleMemberBalancesNonEmpty() {
        let app = AppState(testDataEnabled: true)
        XCTAssertFalse(app.memberBalances.isEmpty, "member balances are empty in the seed")
    }

    func test_sampleIncludesBudgetsAndRentalPayments() {
        let app = AppState(testDataEnabled: true)
        XCTAssertFalse(app.budgets.isEmpty)
        XCTAssertFalse(app.rentalPayments.isEmpty)
    }

    // MARK: - Test-data isolation (C-TD-1)

    func test_mutatorSkipsNetworkInTestDataMode() async {
        let app = AppState(testDataEnabled: true)
        let before = app.transactions.count
        let tx = Transaction(
            merchant: "Test Coffee",
            category: .coffee,
            kind: .expense,
            amount: 500,
            ownerIDs: [Person.mayaSample.id],
            source: "Amex Gold",
            date: Date(),
            householdID: Household.homeSample.id,
            createdBy: User.mayaSample.id,
            paidBy: Person.mayaSample.id
        )
        app.addTransaction(tx)
        // The guard skips the network Task entirely, so this is synchronous and
        // there is no rollback: the row stays and no dataError is set.
        await Task.yield()
        XCTAssertEqual(app.transactions.count, before + 1)
        XCTAssertTrue(app.transactions.contains { $0.id == tx.id })
        XCTAssertNil(app.dataError, "a network attempt rolled the row back — isolation broke")
    }
}
