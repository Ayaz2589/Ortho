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

// MARK: - Specific-month selection (parity-locked)
//
// Mirror of the three pure helpers in `web/components/dashboard/range.ts`
// (`availableMonths`, `monthReferenceDate`, `stepMonth`). Golden-vectored by
// `shared/test-vectors/dashboard-month-scope.json` and asserted from both
// suites (iOS: DashboardScopeParityTests). The selected-month → window
// conversion itself reuses the already-vectored `monthBounds`
// (TransactionFilters.swift) — these stay window-math-free.

/// `'YYYY-MM'` key for a stored transaction instant. Web keys by slicing the
/// first 7 chars of the canonical stored ISO string; the canonical string is
/// UTC, so a UTC `yyyy-MM` of the same instant produces the identical key
/// (including for month-boundary timestamps). Used by `availableMonths`.
private let monthKeyFormatter: DateFormatter = {
    let f = DateFormatter()
    f.calendar = Calendar(identifier: .gregorian)
    f.timeZone = TimeZone(identifier: "UTC")
    f.dateFormat = "yyyy-MM"
    return f
}()

/// Distinct calendar months (`'YYYY-MM'`) present in the data, **newest first**.
/// The key is derived from each transaction's stored `date` via a UTC
/// `yyyy-MM` (matching web's first-7-chars string slice of the stored ISO
/// date), so web and iOS list the exact same months — including rows whose
/// timestamp sits on a month boundary. Empty in → empty out.
func availableMonths(_ transactions: [Transaction]) -> [String] {
    var set = Set<String>()
    for tx in transactions { set.insert(monthKeyFormatter.string(from: tx.date)) }
    return set.sorted { $0 > $1 }
}

/// A reference date safely inside `yyyymm` — the **15th at 12:00 UTC**. Feeds
/// the budget/insight engines when a month is selected so their calendar math
/// lands on that month (and its prior month) in every timezone. Returns `nil`
/// on malformed input (web throws; iOS prefers an optional at the call site).
func monthReferenceDate(_ yyyymm: String) -> Date? {
    let parts = yyyymm.split(separator: "-")
    guard parts.count == 2,
          parts[0].count == 4, let y = Int(parts[0]),
          parts[1].count == 2, let mo = Int(parts[1]), (1...12).contains(mo)
    else { return nil }
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = TimeZone(identifier: "UTC")!
    return cal.date(from: DateComponents(year: y, month: mo, day: 15,
                                         hour: 12, minute: 0, second: 0))
}

/// Step to the chronologically adjacent month within `months` (which is
/// newest-first), or `nil` at the data edge. `.prev` = older (index + 1),
/// `.next` = newer (index − 1). Mirrors web `stepMonth`.
enum MonthStep { case prev, next }

func stepMonth(_ months: [String], _ current: String, _ direction: MonthStep) -> String? {
    guard let i = months.firstIndex(of: current) else { return nil }
    let j = direction == .prev ? i + 1 : i - 1
    return (j >= 0 && j < months.count) ? months[j] : nil
}

/// Resolve the dashboard's active window from its scope. The selected month
/// wins (its UTC `monthBounds`); otherwise the relative range anchored to
/// `now`. Mirrors web `monthScopeInterval(scope, now)`. Pure — keeps the
/// resolution testable without constructing `AppState`.
func dashboardScopeInterval(range: DashboardRange,
                            selectedMonth: String?,
                            now: Date = .now) -> DateInterval {
    if let month = selectedMonth, let (from, to) = monthBounds(month) {
        return DateInterval(start: from, end: to)
    }
    return range.interval(on: now)
}

/// Resolve the reference date Budget/Insights compute against. The selected
/// month's 15th-noon-UTC when set (so calendar math lands on that month),
/// otherwise `now`. Pure counterpart of `dashboardScopeInterval`.
func dashboardScopeReferenceDate(selectedMonth: String?, now: Date = .now) -> Date {
    if let month = selectedMonth, let ref = monthReferenceDate(month) {
        return ref
    }
    return now
}
