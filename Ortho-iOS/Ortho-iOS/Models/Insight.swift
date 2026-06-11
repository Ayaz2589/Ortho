import SwiftUI

/// A single recommendation card produced by `InsightEngine`. Pure value
/// type — never persisted; recomputed on every render.
///
/// `id` is intentionally period-scoped (e.g.
/// `"category-overbudget-dining-2026-05"`) so a future dismissal /
/// snooze layer can address the same logical insight across renders
/// without a model change.
struct Insight: Identifiable, Hashable {
    let id: String
    let title: String
    let body: String
    let severity: InsightSeverity
    let icon: String
    /// Optional category for tint / drill-down. `nil` for cross-category
    /// insights (cashflow, savings rate, mortgage affordability).
    let category: TransactionCategory?

    /// Magnitude in USD cents. Drives secondary sort within a severity
    /// tier — bigger dollar-impact insights surface first.
    let magnitudeCents: Int64
}

enum InsightSeverity: Int, Hashable, Comparable {
    case critical = 0
    case warning  = 1
    case info     = 2
    case positive = 3

    static func < (lhs: InsightSeverity, rhs: InsightSeverity) -> Bool {
        lhs.rawValue < rhs.rawValue
    }

    /// SwiftUI tint used by `InsightCard` to color the icon + accent strip.
    var tint: Color {
        switch self {
        case .critical: AppTheme.destructive
        case .warning:  AppTheme.accent
        case .info:     AppTheme.text2
        case .positive: AppTheme.positive
        }
    }
}
