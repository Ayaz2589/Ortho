import Foundation

/// Is this a *test* build, as opposed to a shipping App Store release?
///
/// Gates the Settings → Feature Flags section and every code path the flags
/// gate (spec 015). It is the iOS mirror of web's `isTestBuild()`:
///   - `#if DEBUG` — any Debug build (simulator, `xcodebuild test`, Xcode-run).
///   - TestFlight — a Release build installed via TestFlight carries a
///     `sandboxReceipt`, so testers on real devices see the section.
///   - App Store — a shipping Release build has neither, so `isTestBuild` is
///     `false` and the whole feature is inert (FR-002/FR-003).
enum TestBuild {
    static var isTestBuild: Bool {
        #if DEBUG
        return true
        #else
        return Bundle.main.appStoreReceiptURL?.lastPathComponent == "sandboxReceipt"
        #endif
    }
}
