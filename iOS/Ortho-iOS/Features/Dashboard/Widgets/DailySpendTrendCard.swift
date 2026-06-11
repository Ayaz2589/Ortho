import SwiftUI
import Charts

/// 30-day sparkline of daily expense totals plus an average-per-day
/// readout and a delta vs. the prior 30 days.
struct DailySpendTrendCard: View {
    @Environment(AppState.self) private var appState

    /// 60 days of daily expense cents — index 0 oldest, last newest.
    private var allDays: [Int64] {
        appState.dailyExpenseCents(days: 60)
    }

    private var recent: [Int64] { Array(allDays.suffix(30)) }
    private var prior: [Int64] { Array(allDays.prefix(30)) }

    private var avgPerDayCents: Int64 {
        guard !recent.isEmpty else { return 0 }
        let total = recent.reduce(0, +)
        return Int64((Double(total) / Double(recent.count)).rounded())
    }

    /// Percent change in trailing 30-day total vs the prior 30 days.
    /// Returns nil when prior is zero (no baseline to compare against).
    private var trendDelta: Double? {
        let recentTotal = Double(recent.reduce(0, +))
        let priorTotal = Double(prior.reduce(0, +))
        guard priorTotal > 0 else { return nil }
        return (recentTotal - priorTotal) / priorTotal * 100
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Daily trend")
                    .font(.lato(size: 13, weight: .semibold))
                    .kerning(0.6)
                    .textCase(.uppercase)
                    .foregroundStyle(AppTheme.text.opacity(0.58))
                Spacer()
                Text("Last 30 days")
                    .font(.lato(size: 12))
                    .foregroundStyle(AppTheme.text3)
            }

            if recent.allSatisfy({ $0 == 0 }) {
                Text("No expenses in the last 30 days.")
                    .font(.lato(size: 13))
                    .foregroundStyle(AppTheme.text3)
                    .padding(.vertical, 20)
            } else {
                sparkline
                    .frame(height: 80)

                HStack(alignment: .firstTextBaseline) {
                    statColumn(label: "Avg / day",
                               value: appState.formatMoney(avgPerDayCents))
                    Spacer()
                    if let delta = trendDelta {
                        statColumn(label: "vs. prior 30",
                                   value: deltaString(delta),
                                   tint: delta >= 0 ? AppTheme.destructive : AppTheme.positive)
                    }
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var sparkline: some View {
        Chart {
            ForEach(Array(recent.enumerated()), id: \.offset) { idx, cents in
                AreaMark(
                    x: .value("Day", idx),
                    y: .value("Spend", Double(cents) / 100)
                )
                .foregroundStyle(AppTheme.positive.opacity(0.18))
                .interpolationMethod(.monotone)

                LineMark(
                    x: .value("Day", idx),
                    y: .value("Spend", Double(cents) / 100)
                )
                .foregroundStyle(AppTheme.positive)
                .interpolationMethod(.monotone)
                .lineStyle(StrokeStyle(lineWidth: 1.6))
            }
        }
        .chartLegend(.hidden)
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
    }

    private func statColumn(label: LocalizedStringKey, value: String,
                            tint: Color = AppTheme.text) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label)
                .font(.lato(size: 12))
                .foregroundStyle(AppTheme.text.opacity(0.58))
            Text(value)
                .font(.lato(size: 17, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(tint)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
    }

    private func deltaString(_ delta: Double) -> String {
        let sign = delta >= 0 ? "+" : "−"
        return String(format: "%@%.0f%%", sign, abs(delta))
    }
}
