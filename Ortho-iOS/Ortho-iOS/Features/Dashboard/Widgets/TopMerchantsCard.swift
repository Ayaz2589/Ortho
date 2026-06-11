import SwiftUI

/// Top 5 merchants by spend over the selected `DashboardRange`. Each row
/// shows merchant name, visit count badge, and total. "Which places are
/// eating the money?"
struct TopMerchantsCard: View {
    let range: DashboardRange
    @Environment(AppState.self) private var appState

    private var entries: [(merchant: String, cents: Int64, count: Int)] {
        appState.topMerchantsByExpense(in: range.interval(), limit: 5)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Top merchants")
                    .font(.lato(size: 13, weight: .semibold))
                    .kerning(0.6)
                    .textCase(.uppercase)
                    .foregroundStyle(AppTheme.text.opacity(0.58))
                Spacer()
                Text(range.longLabel)
                    .font(.lato(size: 12))
                    .foregroundStyle(AppTheme.text3)
            }

            if entries.isEmpty {
                Text("No expenses in this period yet.")
                    .font(.lato(size: 13))
                    .foregroundStyle(AppTheme.text3)
                    .padding(.vertical, 8)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(entries.enumerated()), id: \.offset) { idx, entry in
                        row(entry)
                        if idx < entries.count - 1 {
                            Rectangle()
                                .fill(AppTheme.hairline)
                                .frame(height: 0.5)
                        }
                    }
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func row(_ entry: (merchant: String, cents: Int64, count: Int)) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(entry.merchant)
                    .font(.lato(size: 15, weight: .medium))
                    .foregroundStyle(AppTheme.text)
                    .lineLimit(1)
                Text(Localizer.tr("\(entry.count) visits"))
                    .font(.lato(size: 12))
                    .foregroundStyle(AppTheme.text3)
            }
            Spacer()
            Text(appState.formatMoney(entry.cents))
                .font(.lato(size: 15, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(AppTheme.text)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .padding(.vertical, 10)
    }
}
