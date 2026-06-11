import SwiftUI

/// Dashboard summary of the household's properties.
///
/// - **0 properties:** empty-state caption pointing to the Housing tab.
/// - **1 property:** two-column aggregate (Monthly cost + Equity built).
/// - **2+ properties:** per-property rows with kind icon, title, subtitle
///   (kind + equity / unit count / days-until-renewal), and the property's
///   monthly cost. A compact total caption sits below the rows.
struct HousingSnapshotCard: View {
    @Environment(AppState.self) private var appState

    private var monthlyCostCents: Int64 {
        appState.properties.reduce(0) { acc, p in
            acc + (p.mortgage?.monthlyPaymentCents ?? 0)
                + (p.lease?.monthlyRent ?? 0)
        }
    }

    private var totalEquityCents: Int64 {
        appState.properties.reduce(0) { acc, p in
            acc + (p.mortgage?.currentEquityCents() ?? 0)
        }
    }

    /// Sum across multifamily properties: configured unit rent − the
    /// property's mortgage payment. nil when no multifamily exists.
    private var netRentalIncomeCents: Int64? {
        let multifamilies = appState.properties.filter { $0.kind == .multifamily }
        guard !multifamilies.isEmpty else { return nil }
        return multifamilies.reduce(0) { acc, p in
            let income = p.units.reduce(Int64(0)) { $0 + $1.monthlyRent }
            let cost = p.mortgage?.monthlyPaymentCents ?? 0
            return acc + (income - cost)
        }
    }

    private var propertyCount: Int { appState.properties.count }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Housing")
                    .font(.lato(size: 13, weight: .semibold))
                    .kerning(0.6)
                    .textCase(.uppercase)
                    .foregroundStyle(AppTheme.text.opacity(0.58))
                Spacer()
                Text(propertyCountLabel)
                    .font(.lato(size: 12))
                    .foregroundStyle(AppTheme.text3)
            }

            switch propertyCount {
            case 0:        emptyState
            case 1:        aggregateView
            default:       perPropertyList
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    // MARK: - Subviews

    private var emptyState: some View {
        Text("No properties yet. Add one from the Housing tab.")
            .font(.lato(size: 13))
            .foregroundStyle(AppTheme.text3)
            .padding(.vertical, 8)
    }

    /// Single-property aggregate — the original card layout.
    private var aggregateView: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 24) {
                statColumn(label: "Monthly cost",
                           value: appState.formatMoney(monthlyCostCents))
                statColumn(label: "Equity built",
                           value: appState.formatMoney(totalEquityCents),
                           valueTint: AppTheme.positive)
            }

            if let netCents = netRentalIncomeCents {
                HStack {
                    Text("Net rental income")
                        .font(.lato(size: 13))
                        .foregroundStyle(AppTheme.text2)
                    Spacer()
                    Text(signed(netCents))
                        .font(.lato(size: 13, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(netCents >= 0 ? AppTheme.positive : AppTheme.destructive)
                }
                .padding(.top, 2)
            }
        }
    }

    /// Multi-property breakdown — one row per property.
    private var perPropertyList: some View {
        VStack(spacing: 0) {
            ForEach(Array(appState.properties.enumerated()), id: \.element.id) { idx, property in
                propertyRow(property)
                if idx < appState.properties.count - 1 {
                    Rectangle()
                        .fill(AppTheme.hairline)
                        .frame(height: 0.5)
                }
            }

            Rectangle()
                .fill(AppTheme.hairline)
                .frame(height: 0.5)
                .padding(.top, 4)

            footerSummary
                .padding(.top, 10)
        }
    }

    private func propertyRow(_ p: Property) -> some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(AppTheme.text.opacity(0.05))
                    .frame(width: 36, height: 36)
                Image(systemName: p.kind.symbol)
                    .font(.lato(size: 16, weight: .medium))
                    .foregroundStyle(AppTheme.text2)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(p.title)
                    .font(.lato(size: 15, weight: .semibold))
                    .foregroundStyle(AppTheme.text)
                    .lineLimit(1)
                Text(subtitle(for: p))
                    .font(.lato(size: 12))
                    .foregroundStyle(AppTheme.text3)
                    .lineLimit(1)
            }
            Spacer()
            Text(appState.formatMoney(headlineCents(for: p)))
                .font(.lato(size: 15, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(AppTheme.text)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .padding(.vertical, 10)
    }

    private var footerSummary: some View {
        HStack(spacing: 8) {
            Text("Total")
                .font(.lato(size: 13))
                .foregroundStyle(AppTheme.text2)
            Spacer()
            Text("\(appState.formatMoney(monthlyCostCents)) / mo")
                .font(.lato(size: 13, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(AppTheme.text)
            if totalEquityCents > 0 {
                Text("·")
                    .font(.lato(size: 13))
                    .foregroundStyle(AppTheme.text3)
                Text("\(appState.formatMoney(totalEquityCents)) equity")
                    .font(.lato(size: 13, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(AppTheme.positive)
            }
        }
    }

    // MARK: - Helpers

    private func statColumn(label: LocalizedStringKey, value: String,
                            valueTint: Color = .primary) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label)
                .font(.lato(size: 12))
                .foregroundStyle(AppTheme.text.opacity(0.58))
            Text(value)
                .font(.lato(size: 22, weight: .bold))
                .tracking(-0.4)
                .monospacedDigit()
                .foregroundStyle(valueTint == .primary ? AppTheme.text : valueTint)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
    }

    private var propertyCountLabel: String {
        // Plural-aware via String Catalog variations.plural.
        Localizer.tr("\(propertyCount) properties")
    }

    private func headlineCents(for p: Property) -> Int64 {
        if let m = p.mortgage { return m.monthlyPaymentCents }
        if let l = p.lease    { return l.monthlyRent }
        return 0
    }

    private func subtitle(for p: Property) -> String {
        switch p.kind {
        case .primaryHome:
            let equity = appState.formatMoney(p.mortgage?.currentEquityCents() ?? 0)
            return "Primary home · \(equity) equity"
        case .multifamily:
            let count = p.units.count
            let unitsLabel = "\(count) unit\(count == 1 ? "" : "s")"
            let equity = appState.formatMoney(p.mortgage?.currentEquityCents() ?? 0)
            return "Multifamily · \(unitsLabel) · \(equity) equity"
        case .rental:
            if let days = p.lease?.daysUntilEnd(), days >= 0 {
                let unit = days == 1 ? "day" : "days"
                return "Rental · \(days) \(unit) left"
            }
            return "Rental"
        }
    }

    private func signed(_ cents: Int64) -> String {
        let body = appState.formatMoney(cents < 0 ? -cents : cents)
        if cents > 0 { return "+\(body)" }
        if cents < 0 { return "−\(body)" }
        return body
    }
}
