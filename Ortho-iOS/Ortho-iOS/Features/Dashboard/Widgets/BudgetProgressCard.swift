import SwiftUI

/// Dashboard widget — one row per category with a budget set, showing
/// month-to-date spend vs the monthly limit. Bar color goes sage →
/// accent → destructive as spending approaches and exceeds the limit.
///
/// Hides itself entirely when no budgets are set (matches the empty-card
/// behavior of `InsightsCardStack`). Reads `AppState.budgets` directly so
/// edits in `BudgetsView` flow through `@Observable`.
struct BudgetProgressCard: View {
    @Environment(AppState.self) private var appState

    private var monthInterval: DateInterval {
        Calendar.current.dateInterval(of: .month, for: .now)
            ?? DateInterval(start: .now, duration: 0)
    }

    /// Budgets with a positive limit, sorted by % spent descending so the
    /// most pressing budgets sit at the top.
    private var rows: [BudgetProgress] {
        appState.budgets
            .filter { $0.monthlyLimitCents > 0 }
            .map { budget in
                let spent = appState.categoryExpenseTotal(budget.category,
                                                           in: monthInterval)
                return BudgetProgress(
                    budget: budget,
                    spentCents: spent,
                    fraction: Double(spent) / Double(budget.monthlyLimitCents)
                )
            }
            .sorted { $0.fraction > $1.fraction }
    }

    var body: some View {
        if rows.isEmpty {
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Budgets")
                        .font(.lato(size: 13, weight: .semibold))
                        .kerning(0.6)
                        .textCase(.uppercase)
                        .foregroundStyle(AppTheme.text.opacity(0.58))
                    Spacer()
                    Text("This month")
                        .font(.lato(size: 12))
                        .foregroundStyle(AppTheme.text3)
                }

                VStack(spacing: 14) {
                    ForEach(rows, id: \.budget.id) { row in
                        budgetProgressRow(row)
                    }
                }
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }

    private func budgetProgressRow(_ row: BudgetProgress) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                HStack(spacing: 8) {
                    Image(systemName: row.budget.category.symbol)
                        .font(.lato(size: 12, weight: .medium))
                        .foregroundStyle(row.budget.category.tint)
                    Text(row.budget.category.displayName.string)
                        .font(.lato(size: 14, weight: .medium))
                        .foregroundStyle(AppTheme.text)
                }
                Spacer()
                Text("\(appState.formatMoney(row.spentCents)) / \(appState.formatMoney(row.budget.monthlyLimitCents))")
                    .font(.lato(size: 12, weight: .medium))
                    .monospacedDigit()
                    .foregroundStyle(barColor(for: row.fraction))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(AppTheme.text.opacity(0.05))
                    Capsule()
                        .fill(barColor(for: row.fraction))
                        .frame(width: geo.size.width * CGFloat(min(1, row.fraction)))
                }
            }
            .frame(height: 6)
        }
    }

    /// Sage when comfortably under, accent in the warning band, destructive
    /// when at or over the limit.
    private func barColor(for fraction: Double) -> Color {
        if fraction >= 1.0 { return AppTheme.destructive }
        if fraction >= 0.85 { return AppTheme.accent }
        return AppTheme.positive
    }
}

private struct BudgetProgress {
    let budget: Budget
    let spentCents: Int64
    let fraction: Double
}
