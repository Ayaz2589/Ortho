import SwiftUI

/// Modal for logging a single rent payment against a `.rental` property.
/// Defaults the amount to the property's monthly rent so most logs are
/// one-tap.
struct AddRentalPaymentSheet: View {
    let property: Property
    let onAdd: (RentalPayment) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var appState

    @State private var amountText: String = ""
    @State private var date: Date = .now
    @State private var note: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            sheetNav

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    formGroup {
                        HStack(spacing: 12) {
                            Text("Amount")
                                .font(.lato(size: 15))
                                .foregroundStyle(AppTheme.text.opacity(0.58))
                                .frame(width: 96, alignment: .leading)
                            Spacer()
                            Text(Money.symbol(for: appState.currency))
                                .font(.lato(size: 15, weight: .medium))
                                .foregroundStyle(AppTheme.text.opacity(0.58))
                            TextField("0", text: $amountText)
                                .font(.lato(size: 17, weight: .medium))
                                .tracking(-0.2)
                                .foregroundStyle(AppTheme.text)
                                .keyboardType(.decimalPad)
                                .multilineTextAlignment(.trailing)
                        }
                        .padding(.horizontal, 16)
                        .frame(minHeight: 52)
                        divider
                        HStack(spacing: 12) {
                            Text("Date")
                                .font(.lato(size: 15))
                                .foregroundStyle(AppTheme.text.opacity(0.58))
                                .frame(width: 96, alignment: .leading)
                            Spacer()
                            DatePicker("", selection: $date, displayedComponents: [.date])
                                .labelsHidden()
                                .datePickerStyle(.compact)
                                .tint(AppTheme.accent)
                        }
                        .padding(.horizontal, 16)
                        .frame(minHeight: 52)
                        divider
                        HStack(spacing: 12) {
                            Text("Note")
                                .font(.lato(size: 15))
                                .foregroundStyle(AppTheme.text.opacity(0.58))
                                .frame(width: 96, alignment: .leading)
                            TextField("Optional", text: $note)
                                .font(.lato(size: 17, weight: .medium))
                                .tracking(-0.2)
                                .foregroundStyle(AppTheme.text)
                                .multilineTextAlignment(.trailing)
                        }
                        .padding(.horizontal, 16)
                        .frame(minHeight: 52)
                    }
                }
                .padding(.top, 8)
            }
        }
        .background(AppTheme.bg)
        .onAppear {
            if amountText.isEmpty, let lease = property.lease {
                let display = Money.toDisplayAmount(
                    cents: lease.monthlyRent,
                    in: appState.currency,
                    rate: appState.rate(for: appState.currency)
                )
                amountText = String(
                    format: "%.\(appState.currency.fractionDigits)f",
                    NSDecimalNumber(decimal: display).doubleValue
                )
            }
        }
    }

    private var canAdd: Bool {
        parsedAmount != nil
    }

    private var parsedAmount: Decimal? {
        let trimmed = amountText
            .replacingOccurrences(of: ",", with: "")
            .trimmingCharacters(in: .whitespaces)
        guard let d = Decimal(string: trimmed), d > 0 else { return nil }
        return d
    }

    private var sheetNav: some View {
        ZStack {
            Text("Log payment")
                .font(.lato(size: 17, weight: .semibold))
                .foregroundStyle(AppTheme.text)
                .tracking(-0.3)

            HStack {
                Button("Cancel") { dismiss() }
                    .font(.lato(size: 17, weight: .medium))
                    .foregroundStyle(AppTheme.accent)
                    .buttonStyle(.plain)
                Spacer()
                Button("Add") {
                    guard let parsed = parsedAmount else { return }
                    let cents = Money.toUSDCents(parsed,
                                                 from: appState.currency,
                                                 rate: appState.rate(for: appState.currency))
                    onAdd(RentalPayment(
                        propertyID: property.id,
                        amount: cents,
                        date: date,
                        note: note.isEmpty ? nil : note
                    ))
                }
                .font(.lato(size: 17, weight: .semibold))
                .foregroundStyle(canAdd ? AppTheme.accent : AppTheme.text.opacity(0.36))
                .disabled(!canAdd)
                .buttonStyle(.plain)
                .animation(.easeOut(duration: 0.12), value: canAdd)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 8)
    }

    @ViewBuilder
    private func formGroup<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(spacing: 0, content: content)
            .background(AppTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .padding(.horizontal, 16)
    }

    private var divider: some View {
        Rectangle()
            .fill(AppTheme.hairline)
            .frame(height: 0.5)
            .padding(.leading, 16)
    }
}
