import SwiftUI

/// Compact card shown on the Housing list for one property. The headline
/// flex value is the property's defining number — monthly payment for
/// mortgaged properties, monthly rent for rentals.
struct PropertyCard: View {
    let property: Property

    @Environment(AppState.self) private var appState

    var body: some View {
        HStack(spacing: 14) {
            kindTile

            VStack(alignment: .leading, spacing: 4) {
                Text(property.title)
                    .font(.lato(size: 17, weight: .semibold))
                    .tracking(-0.3)
                    .foregroundStyle(AppTheme.text)
                    .lineLimit(1)
                Text(subtitle)
                    .font(.lato(size: 13))
                    .foregroundStyle(AppTheme.text2)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 4) {
                Text(headlineAmount)
                    .font(.lato(size: 17, weight: .semibold))
                    .tracking(-0.3)
                    .monospacedDigit()
                    .foregroundStyle(AppTheme.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Text(headlineCaption)
                    .font(.lato(size: 12))
                    .foregroundStyle(AppTheme.text3)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(AppTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var kindTile: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .fill(AppTheme.text.opacity(0.05))
                .frame(width: 44, height: 44)
            Image(systemName: property.kind.symbol)
                .font(.lato(size: 19, weight: .medium))
                .foregroundStyle(AppTheme.text2)
        }
    }

    private var subtitle: String {
        switch property.kind {
        case .primaryHome:
            return Localizer.tr("Primary home")
        case .multifamily:
            let count = property.units.count
            return Localizer.tr("Multifamily · \(count) units")
        case .rental:
            return Localizer.tr("Rental")
        }
    }

    private var headlineAmount: String {
        switch property.kind {
        case .primaryHome, .multifamily:
            return appState.formatMoney(property.mortgage?.monthlyPaymentCents ?? 0)
        case .rental:
            return appState.formatMoney(property.lease?.monthlyRent ?? 0)
        }
    }

    private var headlineCaption: String {
        switch property.kind {
        case .primaryHome, .multifamily: Localizer.tr("Monthly payment")
        case .rental:                    Localizer.tr("Monthly rent")
        }
    }
}
