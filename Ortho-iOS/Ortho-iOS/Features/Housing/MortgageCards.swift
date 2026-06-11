import SwiftUI
import Charts

// MARK: - Monthly payment hero card

/// Big "$2,847.13 / Monthly payment" card with auto-pay caption.
struct MortgageMonthlyPaymentCard: View {
    let mortgage: MortgageInfo
    @Environment(AppState.self) private var appState

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Monthly payment")
                    .font(.lato(size: 13, weight: .semibold))
                    .kerning(0.6)
                    .textCase(.uppercase)
                    .foregroundStyle(AppTheme.text.opacity(0.58))
                Spacer()
                Image(systemName: "house")
                    .font(.lato(size: 16, weight: .medium))
                    .foregroundStyle(AppTheme.text2)
            }

            Text(appState.formatMoney(mortgage.monthlyPaymentCents))
                .font(.lato(size: 36, weight: .bold))
                .tracking(-0.6)
                .monospacedDigit()
                .foregroundStyle(AppTheme.text)
                .lineLimit(1)
                .minimumScaleFactor(0.5)

            if let source = mortgage.autoPaySource {
                Text("Auto-pays on the 1st · \(source)")
                    .font(.lato(size: 13))
                    .foregroundStyle(AppTheme.text.opacity(0.58))
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

// MARK: - Details card (principal, rate, maturity)

struct MortgageDetailsCard: View {
    let mortgage: MortgageInfo
    @Environment(AppState.self) private var appState

    var body: some View {
        VStack(spacing: 0) {
            row(
                label: "Principal balance",
                sublabel: Localizer.tr("Original loan · \(appState.formatMoney(mortgage.originalLoan))"),
                value: appState.formatMoney(mortgage.currentPrincipalBalanceCents())
            )
            divider
            row(
                label: "Interest rate",
                sublabel: Localizer.tr("Fixed · \(mortgage.loanTermYears)-year"),
                value: percentString(mortgage.annualInterestRatePercent)
            )
            divider
            row(
                label: "Maturity",
                sublabel: Localizer.tr("\(mortgage.yearsRemaining()) years remaining"),
                value: dateLabel(mortgage.maturityDate)
            )
        }
        .background(AppTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func row(label: LocalizedStringKey, sublabel: String, value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 3) {
                Text(label)
                    .font(.lato(size: 15, weight: .medium))
                    .foregroundStyle(AppTheme.text)
                Text(sublabel)
                    .font(.lato(size: 12))
                    .foregroundStyle(AppTheme.text3)
            }
            Spacer()
            Text(value)
                .font(.lato(size: 17, weight: .semibold))
                .tracking(-0.2)
                .monospacedDigit()
                .foregroundStyle(AppTheme.text)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    private var divider: some View {
        Rectangle()
            .fill(AppTheme.hairline)
            .frame(height: 0.5)
            .padding(.leading, 16)
    }

    private func percentString(_ d: Decimal) -> String {
        String(format: "%.2f%%", NSDecimalNumber(decimal: d).doubleValue)
    }

    private func dateLabel(_ date: Date) -> String {
        DateFormatter.localized(pattern: "MMM d, yyyy", locale: Localizer.currentLocale).string(from: date)
    }
}

// MARK: - Equity progress card

struct EquityProgressCard: View {
    let mortgage: MortgageInfo
    @Environment(AppState.self) private var appState

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Equity")
                .font(.lato(size: 13, weight: .semibold))
                .kerning(0.6)
                .textCase(.uppercase)
                .foregroundStyle(AppTheme.text.opacity(0.58))

            HStack(alignment: .firstTextBaseline) {
                Text(appState.formatMoney(mortgage.currentEquityCents()))
                    .font(.lato(size: 28, weight: .bold))
                    .tracking(-0.4)
                    .monospacedDigit()
                    .foregroundStyle(AppTheme.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Spacer()
                Text("of \(appState.formatMoney(mortgage.purchasePrice)) · \(equityPercentLabel)")
                    .font(.lato(size: 12))
                    .foregroundStyle(AppTheme.text3)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(AppTheme.text.opacity(0.05))
                    Capsule().fill(AppTheme.positive)
                        .frame(width: geo.size.width * CGFloat(mortgage.equityFraction()))
                }
            }
            .frame(height: 6)
            .padding(.top, 2)

            Text("Built since closing · \(closingMonthYear)")
                .font(.lato(size: 13))
                .foregroundStyle(AppTheme.text.opacity(0.58))
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var equityPercentLabel: String {
        String(format: "%.1f%%", mortgage.equityFraction() * 100)
    }

    private var closingMonthYear: String {
        DateFormatter.localized(pattern: "MMM yyyy", locale: Localizer.currentLocale).string(from: mortgage.closingDate)
    }
}

// MARK: - Amortization chart card

/// 12-month stacked bar chart of upcoming principal vs interest. Uses
/// Apple's built-in `Charts` framework (iOS 16+).
struct AmortizationCard: View {
    let mortgage: MortgageInfo

    private var schedule: [MortgageInfo.MonthlyBreakdown] {
        mortgage.upcomingAmortization(months: 12)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Amortization")
                    .font(.lato(size: 13, weight: .semibold))
                    .kerning(0.6)
                    .textCase(.uppercase)
                    .foregroundStyle(AppTheme.text.opacity(0.58))
                Spacer()
                Text("Next 12 months")
                    .font(.lato(size: 12))
                    .foregroundStyle(AppTheme.text3)
            }

            Chart {
                ForEach(schedule, id: \.month) { item in
                    BarMark(
                        x: .value("Month", monthInitial(item.month)),
                        y: .value("Principal", Double(item.principalCents) / 100)
                    )
                    .foregroundStyle(AppTheme.positive)
                    .position(by: .value("Component", "Principal"))

                    BarMark(
                        x: .value("Month", monthInitial(item.month)),
                        y: .value("Interest", Double(item.interestCents) / 100)
                    )
                    .foregroundStyle(AppTheme.text.opacity(0.18))
                    .position(by: .value("Component", "Interest"))
                }
            }
            .chartLegend(.hidden)
            .chartYAxis(.hidden)
            .chartXAxis {
                AxisMarks(values: .automatic(desiredCount: 12)) { _ in
                    AxisValueLabel()
                        .font(.lato(size: 11))
                        .foregroundStyle(AppTheme.text3)
                }
            }
            .frame(height: 140)

            HStack(spacing: 16) {
                legend(color: AppTheme.positive, label: Localizer.tr("Principal"))
                legend(color: AppTheme.text.opacity(0.18), label: Localizer.tr("Interest"))
                Spacer()
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func monthInitial(_ d: Date) -> String {
        // Narrow month — "J", "F", "M" in EN; "জা", "ফে" in BN.
        DateFormatter.localized(pattern: "LLLLL", locale: Localizer.currentLocale).string(from: d)
    }

    private func legend(color: Color, label: String) -> some View {
        HStack(spacing: 6) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(label)
                .font(.lato(size: 12))
                .foregroundStyle(AppTheme.text2)
        }
    }
}
