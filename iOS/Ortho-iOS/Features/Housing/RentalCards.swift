import SwiftUI

// MARK: - Monthly rent hero

struct RentalMonthlyRentCard: View {
    let lease: LeaseInfo
    @Environment(AppState.self) private var appState

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Monthly rent")
                    .font(.lato(size: 13, weight: .semibold))
                    .kerning(0.6)
                    .textCase(.uppercase)
                    .foregroundStyle(AppTheme.text.opacity(0.58))
                Spacer()
                Image(systemName: "key")
                    .font(.lato(size: 16, weight: .medium))
                    .foregroundStyle(AppTheme.text2)
            }

            Text(appState.formatMoney(lease.monthlyRent))
                .font(.lato(size: 36, weight: .bold))
                .tracking(-0.6)
                .monospacedDigit()
                .foregroundStyle(AppTheme.text)
                .lineLimit(1)
                .minimumScaleFactor(0.5)

            Text(nextRentCaption)
                .font(.lato(size: 13))
                .foregroundStyle(AppTheme.text.opacity(0.58))
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var nextRentCaption: String {
        let days = lease.daysUntilNextRent()
        if days == 0 { return Localizer.tr("Due today") }
        if days == 1 { return Localizer.tr("Due tomorrow") }
        return Localizer.tr("Due in \(days) days")
    }
}

// MARK: - Lease renewal banner

/// Soft warning shown when the lease ends within 60 days. Uses the accent
/// rather than destructive — this is a heads-up, not an alarm.
struct LeaseRenewalBanner: View {
    let lease: LeaseInfo

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "calendar.badge.exclamationmark")
                .font(.lato(size: 18, weight: .medium))
                .foregroundStyle(AppTheme.accent)
            VStack(alignment: .leading, spacing: 2) {
                Text("Lease ends in \(lease.daysUntilEnd()) days")
                    .font(.lato(size: 15, weight: .semibold))
                    .foregroundStyle(AppTheme.text)
                Text("Time to renew or plan a move.")
                    .font(.lato(size: 13))
                    .foregroundStyle(AppTheme.text2)
            }
            Spacer()
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(AppTheme.accent.opacity(0.12))
        )
    }
}

// MARK: - Lease info card

struct LeaseInfoCard: View {
    let lease: LeaseInfo
    @Environment(AppState.self) private var appState

    var body: some View {
        VStack(spacing: 0) {
            row(label: "Lease start", value: dateLabel(lease.leaseStart))
            divider
            row(label: "Lease end", value: dateLabel(lease.leaseEnd))
            if let deposit = lease.securityDepositCents {
                divider
                row(label: "Security deposit",
                    value: appState.formatMoney(deposit))
            }
            if let source = lease.paidWithSource {
                divider
                row(label: "Paid with", value: source)
            }
        }
        .background(AppTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func row(label: LocalizedStringKey, value: String) -> some View {
        HStack {
            Text(label)
                .font(.lato(size: 15))
                .foregroundStyle(AppTheme.text.opacity(0.58))
            Spacer()
            Text(value)
                .font(.lato(size: 17, weight: .medium))
                .tracking(-0.2)
                .monospacedDigit()
                .foregroundStyle(AppTheme.text)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
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

    private func dateLabel(_ d: Date) -> String {
        DateFormatter.localized(pattern: "MMM d, yyyy", locale: Localizer.currentLocale).string(from: d)
    }
}

// MARK: - Payment history

struct RentalPaymentsCard: View {
    let propertyID: Property.ID
    let onAddPayment: () -> Void

    @Environment(AppState.self) private var appState

    private var payments: [RentalPayment] {
        appState.payments(for: propertyID)
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Payment history")
                    .font(.lato(size: 13, weight: .semibold))
                    .kerning(0.6)
                    .textCase(.uppercase)
                    .foregroundStyle(AppTheme.text.opacity(0.58))
                Spacer()
                Button {
                    onAddPayment()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "plus")
                            .font(.lato(size: 11, weight: .semibold))
                        Text("Log payment")
                            .font(.lato(size: 13, weight: .semibold))
                    }
                    .foregroundStyle(AppTheme.accent)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
            .padding(.bottom, 10)

            if payments.isEmpty {
                Text("No payments logged yet. Tap Log payment to add one.")
                    .font(.lato(size: 13))
                    .foregroundStyle(AppTheme.text3)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
            } else {
                ForEach(Array(payments.enumerated()), id: \.element.id) { idx, payment in
                    paymentRow(payment)
                    if idx < payments.count - 1 { divider }
                }
                .padding(.bottom, 4)
            }
        }
        .background(AppTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func paymentRow(_ payment: RentalPayment) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(dateLabel(payment.date))
                    .font(.lato(size: 15, weight: .medium))
                    .foregroundStyle(AppTheme.text)
                if let note = payment.note, !note.isEmpty {
                    Text(note)
                        .font(.lato(size: 12))
                        .foregroundStyle(AppTheme.text3)
                        .lineLimit(1)
                }
            }
            Spacer()
            Text(appState.formatMoney(payment.amount))
                .font(.lato(size: 17, weight: .semibold))
                .tracking(-0.2)
                .monospacedDigit()
                .foregroundStyle(AppTheme.text)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Button {
                appState.deleteRentalPayment(payment)
            } label: {
                Image(systemName: "minus.circle.fill")
                    .font(.lato(size: 18))
                    .foregroundStyle(AppTheme.destructive)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Delete payment")
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

    private func dateLabel(_ d: Date) -> String {
        DateFormatter.localized(pattern: "MMM d, yyyy", locale: Localizer.currentLocale).string(from: d)
    }
}
