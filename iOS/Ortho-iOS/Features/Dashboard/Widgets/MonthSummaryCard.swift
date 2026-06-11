import SwiftUI

/// Hero card at the top of the Dashboard. Shows net income over the
/// selected `DashboardRange`, with sub-rows for total income (sage) and
/// total expenses (graphite). For `.thisMonth` we add a muted progress
/// bar showing days-into-month elapsed (decorative — not a budget burn).
struct MonthSummaryCard: View {
    let range: DashboardRange
    @Environment(AppState.self) private var appState

    private var interval: DateInterval { range.interval() }
    private var income: Int64 { appState.incomeTotal(in: interval) }
    private var expenses: Int64 { appState.expenseTotal(in: interval) }
    private var net: Int64 { income - expenses }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(range.longLabel)
                    .textCase(.uppercase)
                    .font(.lato(size: 13, weight: .semibold))
                    .kerning(0.6)
                    .foregroundStyle(AppTheme.text.opacity(0.58))
                Spacer()
                Text(rightCaption)
                    .font(.lato(size: 12))
                    .foregroundStyle(AppTheme.text3)
            }

            Text(netDisplay)
                .font(.lato(size: 36, weight: .bold))
                .tracking(-0.6)
                .monospacedDigit()
                .foregroundStyle(net >= 0 ? AppTheme.positive : AppTheme.text)
                .lineLimit(1)
                .minimumScaleFactor(0.5)

            HStack(spacing: 16) {
                statColumn(label: "Income",
                           amount: appState.formatMoney(income),
                           tint: AppTheme.positive)
                statColumn(label: "Expenses",
                           amount: appState.formatMoney(expenses),
                           tint: AppTheme.text)
                Spacer()
            }
            .padding(.top, 2)

            if range == .thisMonth {
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(AppTheme.text.opacity(0.05))
                        Capsule().fill(AppTheme.text.opacity(0.20))
                            .frame(width: geo.size.width * monthProgress)
                    }
                }
                .frame(height: 4)
                .padding(.top, 6)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func statColumn(label: LocalizedStringKey, amount: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.lato(size: 12))
                .foregroundStyle(AppTheme.text.opacity(0.58))
            Text(amount)
                .font(.lato(size: 15, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(tint)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
    }

    private var netDisplay: String {
        let prefix = net > 0 ? "+" : (net < 0 ? "−" : "")
        let body = appState.formatMoney(net < 0 ? -net : net)
        return "\(prefix)\(body)"
    }

    /// Right side of the header. For .thisMonth shows "Day X of Y";
    /// otherwise the date range as "Mar 1 – May 31".
    private var rightCaption: String {
        switch range {
        case .thisMonth:
            let cal = Calendar.current
            let day = cal.component(.day, from: .now)
            let range = cal.range(of: .day, in: .month, for: .now)?.count ?? 30
            return Localizer.tr("Day \(day) of \(range)")
        case .last3Months, .last6Months, .last12Months:
            let f = DateFormatter.localized(pattern: "MMM d", locale: Localizer.currentLocale)
            let endDate = Calendar.current.date(byAdding: .day, value: -1, to: interval.end) ?? interval.end
            return "\(f.string(from: interval.start)) – \(f.string(from: endDate))"
        }
    }

    private var monthProgress: CGFloat {
        let cal = Calendar.current
        let day = cal.component(.day, from: .now)
        let range = cal.range(of: .day, in: .month, for: .now)?.count ?? 30
        return CGFloat(day) / CGFloat(range)
    }
}
