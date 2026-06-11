import Foundation

extension DateFormatter {
    /// One-line construction of a locale-aware DateFormatter with a
    /// pattern. For non-view code, pass `Localizer.currentLocale`. For
    /// view-body usage, prefer `@Environment(\.locale)`.
    ///
    /// Patterns used in this app: "MMM d", "MMM d, yyyy", "MMM yyyy",
    /// "EEEE", "LLLLL". CLDR locale handles month and day-of-week
    /// translation automatically (e.g. "May" → "মে" in `bn_BD`).
    static func localized(pattern: String, locale: Locale) -> DateFormatter {
        let f = DateFormatter()
        f.dateFormat = pattern
        f.locale = locale
        return f
    }
}
