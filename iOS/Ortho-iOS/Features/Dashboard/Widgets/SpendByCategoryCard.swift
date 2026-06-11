import SwiftUI
import Charts

/// Donut chart of expense by `TransactionCategory` over the selected
/// `DashboardRange`. The legend below the chart lists the top 5
/// categories with their tint + symbol + total amount; everything past 5
/// collapses into a non-expandable "Other" entry. Tapping any of the top
/// categories expands the row to show its transactions in the range
/// (newest first, capped at 25).
struct SpendByCategoryCard: View {
    let range: DashboardRange
    @Environment(AppState.self) private var appState

    /// Accordion: at most one category expanded at a time. `nil` = none.
    @State private var expandedCategory: TransactionCategory?

    private let maxRowsWhenExpanded = 25

    /// All categories with non-zero spend in the range, sorted descending.
    /// Used both for the chart (all wedges) and the legend (top 5 + Other).
    private var entries: [(category: TransactionCategory, cents: Int64)] {
        appState.topCategoriesByExpense(in: range.interval(), limit: 99)
    }

    private var legendEntries: [LegendEntry] {
        let top = entries.prefix(5)
        let rest = entries.dropFirst(5)
        var out = top.map { LegendEntry(category: $0.category, cents: $0.cents) }
        let otherTotal = rest.reduce(Int64(0)) { $0 + $1.cents }
        if otherTotal > 0 {
            out.append(LegendEntry(category: nil, cents: otherTotal))
        }
        return out
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Spend by category")
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
                    .padding(.vertical, 20)
            } else {
                donut
                    .frame(height: 160)

                VStack(spacing: 0) {
                    ForEach(Array(legendEntries.enumerated()), id: \.element.id) { idx, entry in
                        legendSection(entry)
                        if idx < legendEntries.count - 1 {
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
        .animation(.easeOut(duration: 0.22), value: expandedCategory)
    }

    private var donut: some View {
        Chart {
            ForEach(legendEntries, id: \.id) { entry in
                SectorMark(
                    angle: .value("Spend", Double(entry.cents) / 100),
                    innerRadius: .ratio(0.62),
                    angularInset: 1.5
                )
                .foregroundStyle(entry.color)
            }
        }
        .chartLegend(.hidden)
    }

    // MARK: - Legend section (row + optional expansion)

    @ViewBuilder
    private func legendSection(_ entry: LegendEntry) -> some View {
        let isExpandable = entry.category != nil
        let isExpanded = isExpandable && expandedCategory == entry.category

        VStack(spacing: 0) {
            if isExpandable, let category = entry.category {
                Button {
                    expandedCategory = isExpanded ? nil : category
                } label: {
                    legendRow(entry, showChevron: true, isExpanded: isExpanded)
                }
                .buttonStyle(.plain)
            } else {
                legendRow(entry, showChevron: false, isExpanded: false)
            }

            if isExpanded, let category = entry.category {
                expandedTransactions(for: category, tint: entry.color)
                    .padding(.bottom, 8)
            }
        }
    }

    private func legendRow(_ entry: LegendEntry,
                           showChevron: Bool,
                           isExpanded: Bool) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(entry.color.opacity(0.92))
                    .frame(width: 28, height: 28)
                Image(systemName: entry.symbol)
                    .font(.lato(size: 13, weight: .semibold))
                    .foregroundStyle(.white)
            }
            Text(entry.label)
                .font(.lato(size: 15, weight: .medium))
                .foregroundStyle(AppTheme.text)
            Spacer()
            Text(appState.formatMoney(entry.cents))
                .font(.lato(size: 15, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(AppTheme.text)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            if showChevron {
                Image(systemName: "chevron.down")
                    .font(.lato(size: 11, weight: .semibold))
                    .foregroundStyle(AppTheme.text3)
                    .rotationEffect(.degrees(isExpanded ? 180 : 0))
            }
        }
        .padding(.vertical, 10)
        .contentShape(Rectangle())
    }

    // MARK: - Expanded transactions

    @ViewBuilder
    private func expandedTransactions(for category: TransactionCategory,
                                      tint: Color) -> some View {
        let all = appState.categoryExpenses(category, in: range.interval())
        let displayed = Array(all.prefix(maxRowsWhenExpanded))
        let remaining = max(0, all.count - displayed.count)

        VStack(spacing: 0) {
            if all.isEmpty {
                Text("No transactions in this period.")
                    .font(.lato(size: 13))
                    .foregroundStyle(AppTheme.text3)
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                ForEach(Array(displayed.enumerated()), id: \.element.id) { idx, tx in
                    transactionRow(tx)
                    if idx < displayed.count - 1 {
                        Rectangle()
                            .fill(AppTheme.hairline)
                            .frame(height: 0.5)
                    }
                }
                if remaining > 0 {
                    Text("+\(remaining) more")
                        .font(.lato(size: 12))
                        .foregroundStyle(AppTheme.text3)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.top, 10)
                }
            }
        }
        .padding(.leading, 40) // indent under the icon tile
    }

    private func transactionRow(_ tx: Transaction) -> some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(tx.merchant)
                    .font(.lato(size: 14, weight: .medium))
                    .foregroundStyle(AppTheme.text)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Text(shortDate(tx.date))
                    Text("·").opacity(0.45)
                    Text(appState.ownersDisplay(of: tx).label)
                        .lineLimit(1)
                }
                .font(.lato(size: 11))
                .foregroundStyle(AppTheme.text3)
            }
            Spacer()
            Text(appState.formatMoney(tx.amount))
                .font(.lato(size: 14, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(AppTheme.text)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .padding(.vertical, 8)
    }

    private func shortDate(_ d: Date) -> String {
        DateFormatter.localized(pattern: "MMM d", locale: Localizer.currentLocale).string(from: d)
    }
}

// MARK: - Legend entry

private struct LegendEntry: Identifiable {
    let id = UUID()
    /// `nil` represents the "Other" bucket aggregating non-top categories.
    let category: TransactionCategory?
    let cents: Int64

    var color: Color {
        category?.tint ?? AppTheme.text.opacity(0.25)
    }

    var label: String {
        category?.displayName.string ?? Localizer.tr("Other")
    }

    var symbol: String {
        category?.symbol ?? "ellipsis"
    }
}
