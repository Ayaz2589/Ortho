import Foundation

/// Time window the Dashboard's range-aware widgets compute over. Each
/// case has a calendar-month-aligned `DateInterval`: `.thisMonth` covers
/// the current calendar month; the others cover the trailing N calendar
/// months ending in the current month (inclusive). For example with
/// today = May 18, `.last3Months` = March 1 → end of May.
enum DashboardRange: String, CaseIterable, Hashable, Identifiable, Codable {
    case thisMonth
    case last3Months
    case last6Months
    case last12Months

    var id: String { rawValue }

    /// Compact label for the segmented picker — "Month / 3M / 6M / 1Y".
    var shortLabel: LocalizedStringResource {
        switch self {
        case .thisMonth:    "Month"
        case .last3Months:  "3M"
        case .last6Months:  "6M"
        case .last12Months: "1Y"
        }
    }

    /// Longer label used in widget headers (uppercased at the call site).
    var longLabel: LocalizedStringResource {
        switch self {
        case .thisMonth:    "This month"
        case .last3Months:  "Last 3 months"
        case .last6Months:  "Last 6 months"
        case .last12Months: "Last 12 months"
        }
    }

    /// Number of calendar months the range covers (1 / 3 / 6 / 12).
    var monthCount: Int {
        switch self {
        case .thisMonth:    1
        case .last3Months:  3
        case .last6Months:  6
        case .last12Months: 12
        }
    }

    /// Calendar interval ending at the end of the month containing
    /// `referenceDate`. For `.thisMonth` it's just that month; for longer
    /// ranges, the start is `monthCount - 1` months earlier.
    func interval(on referenceDate: Date = .now,
                  calendar: Calendar = .current) -> DateInterval {
        let thisMonth = calendar.dateInterval(of: .month, for: referenceDate)
            ?? DateInterval(start: referenceDate, end: referenceDate)
        guard monthCount > 1 else { return thisMonth }
        let start = calendar.date(byAdding: .month,
                                   value: -(monthCount - 1),
                                   to: thisMonth.start) ?? thisMonth.start
        return DateInterval(start: start, end: thisMonth.end)
    }
}
