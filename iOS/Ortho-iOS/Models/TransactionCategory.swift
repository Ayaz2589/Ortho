import SwiftUI

enum TransactionCategory: String, CaseIterable, Hashable, Codable, Identifiable {
    case coffee, groceries, dining, subs, fuel
    case rent, health, income, transit, utilities, entertainment

    var id: String { rawValue }

    /// Localized display name. `rawValue` is the wire-format (snake_case
    /// match to the Postgres `transaction_category` enum) and must never
    /// be shown in the UI.
    var displayName: LocalizedStringResource {
        switch self {
        case .coffee:        "Coffee"
        case .groceries:     "Groceries"
        case .dining:        "Dining"
        case .subs:          "Subscriptions"
        case .fuel:          "Fuel"
        case .rent:          "Rent"
        case .health:        "Health"
        case .income:        "Income"
        case .transit:       "Transit"
        case .utilities:     "Utilities"
        case .entertainment: "Entertainment"
        }
    }

    /// SF Symbol used in the category tile.
    var symbol: String {
        switch self {
        case .coffee:        "cup.and.saucer.fill"
        case .groceries:     "basket.fill"
        case .dining:        "fork.knife"
        case .subs:          "arrow.triangle.2.circlepath"
        case .fuel:          "fuelpump.fill"
        case .rent:          "house.fill"
        case .health:        "cross.case.fill"
        case .income:        "arrow.down.to.line"
        case .transit:       "tram.fill"
        case .utilities:     "bolt.fill"
        case .entertainment: "theatermasks.fill"
        }
    }

    /// Muted tint for the rounded-square icon tile.
    var tint: Color {
        switch self {
        case .coffee:        Color(red: 0.796, green: 0.647, blue: 0.518)
        case .groceries:     Color(red: 0.612, green: 0.698, blue: 0.565)
        case .dining:        Color(red: 0.831, green: 0.596, blue: 0.486)
        case .subs:          Color(red: 0.659, green: 0.659, blue: 0.722)
        case .fuel:          Color(red: 0.722, green: 0.612, blue: 0.659)
        case .rent:          Color(red: 0.565, green: 0.635, blue: 0.698)
        case .health:        Color(red: 0.800, green: 0.565, blue: 0.565)
        case .income:        Color(red: 0.565, green: 0.722, blue: 0.612)
        case .transit:       Color(red: 0.706, green: 0.659, blue: 0.565)
        case .utilities:     Color(red: 0.753, green: 0.690, blue: 0.502)
        case .entertainment: Color(red: 0.498, green: 0.612, blue: 0.722)
        }
    }
}
