import SwiftUI

/// Dashboard tab — a scrollable column of widgets summarizing the
/// household's finances. A segmented picker at the top selects the time
/// range; range-aware widgets recompute against it. Two widgets ignore
/// the range:
///   • HousingSnapshotCard renders a current snapshot (monthly cost,
///     equity) — not period-dependent.
///   • DailySpendTrendCard is always a trailing 30-day trend by design.
///
/// The picker only offers ranges that the existing data fully spans
/// (`appState.availableRanges`), so a fresh install with one day of
/// data sees just "This month" and nothing else.
struct DashboardView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.colorScheme) private var colorScheme

    private var availableRanges: [DashboardRange] {
        appState.availableRanges
    }

    private var availableMonths: [String] {
        appState.dashboardAvailableMonths
    }

    /// The active window for every month-aware card — the selected month's
    /// UTC bounds, or the relative range. Single source: `AppState`.
    private var activeInterval: DateInterval {
        appState.activeInterval
    }

    /// Header caption for the scoped cards — the selected month's name
    /// ("June 2026") or the relative range's long label.
    private var scopedTitle: LocalizedStringResource {
        if let month = appState.dashboardSelectedMonth {
            return LocalizedStringResource(stringLiteral: FilterSheet.monthLabel(month))
        }
        return appState.dashboardRange.longLabel
    }

    /// True only for the live current month (no selection + `.thisMonth`).
    private var isLiveMonth: Bool {
        appState.dashboardSelectedMonth == nil && appState.dashboardRange == .thisMonth
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                if availableRanges.count > 1 || !availableMonths.isEmpty {
                    scopeControls
                }
                MonthSummaryCard(title: scopedTitle,
                                 interval: activeInterval,
                                 isLiveMonth: isLiveMonth,
                                 isSpecificMonth: appState.dashboardSelectedMonth != nil)
                // Insights sit just below the month summary so the user
                // first sees the headline number ("+$X this month"), then
                // the prescriptive cards (over-budget, savings rate, top
                // category) explaining what's driving it. Stack hides
                // itself when the engine returns nothing.
                InsightsCardStack()
                // Budget progress sits with the rest of this-month
                // context. Card hides itself when no budgets are set.
                BudgetProgressCard()
                SpendByCategoryCard(title: scopedTitle, interval: activeInterval)
                PerOwnerBreakdownCard(title: scopedTitle, interval: activeInterval)
                TopMerchantsCard(title: scopedTitle, interval: activeInterval)
                HousingSnapshotCard()
                DailySpendTrendCard()
                Color.clear.frame(height: 60)
            }
            .padding(.horizontal, 16)
        }
        .background(AppTheme.bg)
        .safeAreaInset(edge: .top, spacing: 0) {
            HStack {
                Text("Dashboard")
                    .font(.lato(size: 32, weight: .bold))
                    .tracking(-0.6)
                    .foregroundStyle(AppTheme.text)
                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.top, 4)
            .padding(.bottom, 5)
            .background(colorScheme == .dark ? AnyShapeStyle(AppTheme.bg) : AnyShapeStyle(.regularMaterial))
        }
        .onChange(of: availableRanges) { _, newValue in
            // If the active range goes away (e.g. all transactions deleted
            // so only `.thisMonth` is left), fall back to a valid one.
            if !newValue.contains(appState.dashboardRange), let fallback = newValue.first {
                appState.dashboardRange = fallback
            }
        }
        .onChange(of: availableMonths) { _, newValue in
            // If the selected month no longer has data (its transactions were
            // deleted), drop the override and return to the relative view.
            if let selected = appState.dashboardSelectedMonth,
               !newValue.contains(selected) {
                appState.clearDashboardMonth()
            }
        }
    }

    /// The dashboard's time-scope row: the relative range picker plus the
    /// specific-month control beside it. The month control overrides the
    /// relative range (transiently) until cleared via "Latest".
    @ViewBuilder
    private var scopeControls: some View {
        VStack(spacing: 8) {
            if availableRanges.count > 1 {
                rangePicker
            }
            if !availableMonths.isEmpty {
                HStack {
                    MonthPicker(
                        months: availableMonths,
                        selectedMonth: appState.dashboardSelectedMonth,
                        onSelect: { appState.selectDashboardMonth($0) },
                        onClear: { appState.clearDashboardMonth() }
                    )
                    Spacer(minLength: 0)
                }
            }
        }
    }

    /// Custom segmented control — matches the Personal | Shared toggle
    /// pattern used in AddTransactionSheet. Only renders the ranges that
    /// `availableRanges` includes.
    private var rangePicker: some View {
        HStack(spacing: 4) {
            ForEach(availableRanges) { option in
                Button {
                    appState.dashboardRange = option
                } label: {
                    Text(option.shortLabel)
                        .font(.lato(size: 14, weight: .semibold))
                        .tracking(-0.1)
                        .foregroundStyle(appState.dashboardRange == option
                                         ? AppTheme.text
                                         : AppTheme.text.opacity(0.58))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .fill(appState.dashboardRange == option ? AppTheme.surface : .clear)
                                .shadow(color: appState.dashboardRange == option
                                        ? .black.opacity(0.06) : .clear,
                                        radius: 2, y: 1)
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(AppTheme.text.opacity(0.05))
        )
        .animation(.easeOut(duration: 0.15), value: appState.dashboardRange)
    }
}

#Preview("Dashboard · Light") {
    DashboardView()
        .environment(AppState())
        .preferredColorScheme(.light)
}

#Preview("Dashboard · Dark") {
    DashboardView()
        .environment(AppState())
        .preferredColorScheme(.dark)
}
