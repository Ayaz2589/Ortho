import SwiftUI

// MARK: - Units list card

struct MultifamilyUnitsCard: View {
    let property: Property
    @Environment(AppState.self) private var appState

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Units & tenants")
                    .font(.lato(size: 13, weight: .semibold))
                    .kerning(0.6)
                    .textCase(.uppercase)
                    .foregroundStyle(AppTheme.text.opacity(0.58))
                Spacer()
                Text("\(property.units.count) unit\(property.units.count == 1 ? "" : "s")")
                    .font(.lato(size: 12))
                    .foregroundStyle(AppTheme.text3)
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
            .padding(.bottom, 10)

            if property.units.isEmpty {
                Text("No units yet — edit this property to add them.")
                    .font(.lato(size: 13))
                    .foregroundStyle(AppTheme.text3)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
            } else {
                ForEach(Array(property.units.enumerated()), id: \.element.id) { idx, unit in
                    unitRow(unit)
                    if idx < property.units.count - 1 { divider }
                }
                .padding(.bottom, 4)
            }
        }
        .background(AppTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func unitRow(_ unit: Unit) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(unit.name)
                    .font(.lato(size: 15, weight: .medium))
                    .foregroundStyle(AppTheme.text)
                Text(unit.isVacant ? "Vacant" : (unit.tenantName ?? "—"))
                    .font(.lato(size: 12))
                    .foregroundStyle(unit.isVacant ? AppTheme.destructive : AppTheme.text3)
            }
            Spacer()
            Text(appState.formatMoney(unit.monthlyRent))
                .font(.lato(size: 17, weight: .semibold))
                .tracking(-0.2)
                .monospacedDigit()
                .foregroundStyle(AppTheme.text)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(minHeight: 56)
    }

    private var divider: some View {
        Rectangle()
            .fill(AppTheme.hairline)
            .frame(height: 0.5)
            .padding(.leading, 16)
    }
}

// MARK: - Net balance card

/// Compares **collected** rental income (occupied units only) against the
/// mortgage's principal + interest payment. Positive = property generates
/// cashflow; negative = landlord is subsidizing it. Math lives on
/// `Property` so this view stays a pure renderer.
struct MultifamilyNetBalanceCard: View {
    let property: Property
    @Environment(AppState.self) private var appState

    private var totalIncomeCents: Int64 { property.occupiedMonthlyRentCents }
    private var mortgageCents: Int64 { property.mortgage?.monthlyPaymentCents ?? 0 }
    private var netCents: Int64 { property.netMonthlyBalanceCents }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Net balance")
                .font(.lato(size: 13, weight: .semibold))
                .kerning(0.6)
                .textCase(.uppercase)
                .foregroundStyle(AppTheme.text.opacity(0.58))

            HStack(alignment: .firstTextBaseline) {
                Text(netSignedString)
                    .font(.lato(size: 28, weight: .bold))
                    .tracking(-0.4)
                    .monospacedDigit()
                    .foregroundStyle(netCents >= 0 ? AppTheme.positive : AppTheme.destructive)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Spacer()
            }

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("Rental income")
                        .font(.lato(size: 13))
                        .foregroundStyle(AppTheme.text2)
                    Spacer()
                    Text(appState.formatMoney(totalIncomeCents))
                        .font(.lato(size: 13, weight: .medium))
                        .monospacedDigit()
                        .foregroundStyle(AppTheme.text)
                }
                HStack {
                    Text("Mortgage payment")
                        .font(.lato(size: 13))
                        .foregroundStyle(AppTheme.text2)
                    Spacer()
                    Text("−" + appState.formatMoney(mortgageCents))
                        .font(.lato(size: 13, weight: .medium))
                        .monospacedDigit()
                        .foregroundStyle(AppTheme.text)
                }
            }
            .padding(.top, 4)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var netSignedString: String {
        let abs = appState.formatMoney(netCents < 0 ? -netCents : netCents)
        if netCents > 0 { return "+\(abs)" }
        if netCents < 0 { return "−\(abs)" }
        return abs
    }
}
