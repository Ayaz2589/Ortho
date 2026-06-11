import SwiftUI

/// User-selected appearance preference. `.system` defers to the OS setting;
/// `.light` / `.dark` force a specific scheme app-wide.
enum AppearanceMode: String, CaseIterable, Identifiable, Hashable {
    case system, light, dark

    var id: String { rawValue }

    var label: LocalizedStringResource {
        switch self {
        case .system: "System"
        case .light:  "Light"
        case .dark:   "Dark"
        }
    }

    /// SF Symbol shown in the row's leading tile.
    var symbol: String {
        switch self {
        case .system: "circle.lefthalf.filled"
        case .light:  "sun.max"
        case .dark:   "moon"
        }
    }

    /// `nil` means "follow the OS"; non-nil forces the scheme.
    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light:  .light
        case .dark:   .dark
        }
    }
}
