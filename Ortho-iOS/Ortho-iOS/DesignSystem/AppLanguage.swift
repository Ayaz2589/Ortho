import SwiftUI

/// User-selected UI language. Mirrors `AppearanceMode`:
/// `.system` defers to the OS Settings → Language; `.en` and `.bn` force
/// a specific language app-wide.
///
/// **Self-naming convention** — the labels for explicit languages are
/// rendered in the language itself ("English", "বাংলা"), not localized.
/// This is Apple's own convention (Settings → General → Language &
/// Region) and ensures users can always find their language in the
/// picker even if the UI happens to be in a script they don't read.
/// Only the `.system` row gets a localized label.
///
/// **Bangla locale uses `bn_BD@numbers=latn`** — the ICU keyword forces
/// Western digits (0-9) instead of Bengali numerals (০-৯) for money,
/// percentages, and counts. Financial apps in Bangladesh commonly use
/// Latin digits for clarity. Month and day names still come from the
/// `bn_BD` locale (e.g. "মে" instead of "May").
enum AppLanguage: String, CaseIterable, Identifiable, Hashable {
    case system, en, bn, es, ja, zh, ko

    var id: String { rawValue }

    /// Picker row label as a `Text` so SwiftUI can re-resolve it on
    /// environment-locale change. The explicit languages use
    /// `Text(verbatim:)` to opt OUT of bundle lookup (self-naming
    /// convention — "English" must stay "English" in every UI language).
    /// `.system` goes through the catalog so it reads "System" in EN,
    /// "সিস্টেম" in BN, "Sistema" in ES, "システム" in JA, "系统" in ZH,
    /// "시스템" in KO.
    var labelText: Text {
        switch self {
        case .system: Text("System")               // LocalizedStringKey → catalog lookup
        case .en:     Text(verbatim: "English")    // raw, no lookup
        case .bn:     Text(verbatim: "বাংলা")       // raw, no lookup
        case .es:     Text(verbatim: "Español")    // raw, no lookup
        case .ja:     Text(verbatim: "日本語")      // raw, no lookup
        case .zh:     Text(verbatim: "简体中文")    // raw, no lookup
        case .ko:     Text(verbatim: "한국어")      // raw, no lookup
        }
    }

    /// SF Symbol shown in the row's leading tile.
    var symbol: String {
        switch self {
        case .system: "globe"
        case .en, .bn, .es, .ja, .zh, .ko: "character.bubble"
        }
    }

    /// `nil` means "follow the OS"; non-nil forces a specific locale.
    /// Bangla uses `@numbers=latn` to clamp digits to 0-9 (financial-
    /// app convention). Simplified Chinese uses `zh-Hans` (script-
    /// explicit, not region-locked); the lproj folder Xcode generates
    /// is `zh-Hans.lproj`. Korean uses `ko_KR`. Neither Chinese nor
    /// Korean has morphological plural, so catalog `one`/`other`
    /// variants are identical.
    var locale: Locale? {
        switch self {
        case .system: nil
        case .en:     Locale(identifier: "en_US")
        case .bn:     Locale(identifier: "bn_BD@numbers=latn")
        case .es:     Locale(identifier: "es_ES")
        case .ja:     Locale(identifier: "ja_JP")
        case .zh:     Locale(identifier: "zh-Hans")
        case .ko:     Locale(identifier: "ko_KR")
        }
    }
}
