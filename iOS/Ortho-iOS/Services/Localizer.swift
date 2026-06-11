import Foundation

/// Bridge between SwiftUI's environment locale and non-view code that
/// constructs `DateFormatter` / `NumberFormatter` imperatively.
///
/// SwiftUI's `.environment(\.locale, …)` propagates to `Text`,
/// `.formatted`, and `Date.FormatStyle` automatically — but it does
/// NOT reach formatters built outside view bodies (e.g. cached statics
/// in `Money.swift`, formatters in `InsightEngine.swift`, the
/// `TransactionGroup.dayLabel` formatter). Those read
/// `Localizer.currentLocale` instead of `Locale.current` so they
/// respect the in-app language override.
///
/// **Files that MUST KEEP reading `Locale.current` or `en_US_POSIX`:**
///   • `Services/SupabaseAPI.swift` (`SupabaseDateFormatters` — locked
///     to `en_US_POSIX` for wire-format `yyyy-MM-dd` round-trips with
///     Postgres `date` columns).
///   • Any other `Services/*.swift` date encoder that serializes to
///     Supabase.
///
/// Everywhere else in the app, read `Localizer.currentLocale`. The
/// value is pushed from `Ortho_iOSApp.swift` whenever the user's
/// `AppLanguage` selection changes.
enum Localizer {
    /// Current effective locale for non-view formatters. Defaults to
    /// `.autoupdatingCurrent` so the app behaves correctly before the
    /// first `.onChange` fires (e.g. very first render after launch).
    static var currentLocale: Locale = .autoupdatingCurrent

    /// Bundle to use for catalog lookup. The `locale:` parameter on
    /// `String(localized:locale:)` only controls number/date formatting
    /// in interpolation slots — it does NOT switch which `.lproj`
    /// Localizable.strings is consulted. To get a real translation in
    /// non-view code we have to point Foundation at the right
    /// language-specific bundle ourselves.
    ///
    /// Returns `Bundle.main` when in `.system` mode (Foundation then uses
    /// `Bundle.preferredLocalizations` against iOS Settings — the
    /// behavior we want for the system option). For `.en` / `.bn` we
    /// return the matching `xx.lproj` subbundle, forcing the chosen
    /// language regardless of the OS setting.
    static var currentBundle: Bundle {
        let identifier = currentLocale.identifier
        if let cached = bundleCache[identifier] { return cached }
        let languageCode = currentLocale.language.languageCode?.identifier ?? "en"
        guard let path = Bundle.main.path(forResource: languageCode, ofType: "lproj"),
              let bundle = Bundle(path: path) else {
            return Bundle.main
        }
        bundleCache[identifier] = bundle
        return bundle
    }

    private static var bundleCache: [String: Bundle] = [:]

    /// Resolve a `String.LocalizationValue` against the active in-app
    /// language. Required for non-view code (InsightEngine,
    /// TransactionGroup, enum displayName resolution) — SwiftUI's
    /// `Text(_:)` reads `\.locale` from the environment and handles
    /// this automatically, but `String(localized:)` does not.
    static func tr(_ value: String.LocalizationValue) -> String {
        String(localized: value, bundle: currentBundle, locale: currentLocale)
    }
}

extension LocalizedStringResource {
    /// Resolve to a plain `String` against the active in-app language.
    /// Uses `Localizer.currentBundle` for catalog lookup so the right
    /// `lproj` table is consulted regardless of the OS locale.
    /// `LocalizedStringResource.bundle` is get-only, so we go through
    /// `Bundle.localizedString(forKey:value:table:)` directly — bypasses
    /// the resource's bundle binding entirely.
    var string: String {
        Localizer.currentBundle.localizedString(
            forKey: self.key,
            value: self.key,
            table: nil  // default Localizable table
        )
    }
}
