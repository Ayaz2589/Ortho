import Foundation

/// Test-build feature flags (spec 015). Two disposable, per-device toggles that
/// only take effect on test builds and are forced OFF in production. The Settings
/// UI binds the same UserDefaults keys via `@AppStorage`; these accessors are the
/// launch-time reads used by `Ortho_iOSApp` to decide seeding + the auth gate.
///
/// Safety invariant (FR-003): off a test build every accessor returns `false`
/// regardless of any persisted value — so a value written on a Debug/TestFlight
/// install can never flip behavior in a shipping App Store build. The
/// `isTestBuild` / `defaults` parameters default to the real values and exist so
/// the force-off and persistence behavior is unit-testable.
enum FeatureFlags {
    static let useTestDataKey = "ff_useTestData"
    static let bypassAuthKey = "ff_bypassAuth"

    static func useTestData(
        isTestBuild: Bool = TestBuild.isTestBuild,
        defaults: UserDefaults = .standard
    ) -> Bool {
        isTestBuild && defaults.bool(forKey: useTestDataKey)
    }

    static func bypassAuth(
        isTestBuild: Bool = TestBuild.isTestBuild,
        defaults: UserDefaults = .standard
    ) -> Bool {
        isTestBuild && defaults.bool(forKey: bypassAuthKey)
    }

    /// The data layer keys off this: bypassing auth always implies test data
    /// (there is no real session behind bypass to read live data from).
    static func effectiveUseTestData(
        isTestBuild: Bool = TestBuild.isTestBuild,
        defaults: UserDefaults = .standard
    ) -> Bool {
        useTestData(isTestBuild: isTestBuild, defaults: defaults)
            || bypassAuth(isTestBuild: isTestBuild, defaults: defaults)
    }
}
