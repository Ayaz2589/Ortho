import SwiftUI

/// Sheet for setting / editing / clearing a budget for one category.
/// Reuses the visual grammar of `AddCardSheet` (Cancel · title · Save).
/// The DB enforces `UNIQUE (household_id, category)`, so set-vs-edit is a
/// single `upsert` call — UI just shows a Delete row when a budget already
/// exists.
struct EditBudgetSheet: View {
    let category: TransactionCategory
    let onDone: () -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var amountText: String = ""
    @FocusState private var amountFocused: Bool

    init(category: TransactionCategory, onDone: @escaping () -> Void) {
        self.category = category
        self.onDone = onDone
    }

    /// Existing budget for this category, if any. Resolved fresh from
    /// AppState every render so the sheet picks up the latest server state.
    private var existingBudget: Budget? { appState.budget(for: category) }

    private var parsedAmount: Decimal? {
        let trimmed = amountText
            .replacingOccurrences(of: ",", with: "")
            .trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return nil }
        return Decimal(string: trimmed)
    }

    private var canSave: Bool { parsedAmount != nil }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            sheetNav

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    sectionLabel("Monthly limit")
                    amountField
                        .padding(.bottom, 16)

                    Text("Spending in \(category.displayName.string) is tracked from the 1st of each calendar month. Insights compare actual spend against this limit.")
                        .font(.lato(size: 13))
                        .foregroundStyle(AppTheme.text.opacity(0.36))
                        .lineSpacing(2)
                        .padding(.horizontal, 24)
                        .padding(.bottom, 24)

                    if let existing = existingBudget {
                        Button(role: .destructive) {
                            appState.deleteBudget(existing)
                            onDone()
                            dismiss()
                        } label: {
                            HStack {
                                Image(systemName: "minus.circle.fill")
                                    .font(.lato(size: 16, weight: .medium))
                                    .foregroundStyle(AppTheme.destructive)
                                Text("Remove budget")
                                    .font(.lato(size: 17, weight: .medium))
                                    .foregroundStyle(AppTheme.destructive)
                                Spacer()
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 14)
                            .background(AppTheme.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .padding(.horizontal, 16)
                        }
                        .buttonStyle(.plain)
                        .padding(.bottom, 24)
                    }
                }
                .padding(.top, 8)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(AppTheme.bg)
        .onAppear {
            if let existing = existingBudget {
                amountText = Self.formatAmount(existing.monthlyLimitCents,
                                               currency: appState.currency,
                                               rate: appState.rate(for: appState.currency))
            }
            amountFocused = true
        }
    }

    // MARK: - Nav

    private var sheetNav: some View {
        ZStack {
            Text("\(category.displayName.string) budget")
                .font(.lato(size: 17, weight: .semibold))
                .foregroundStyle(AppTheme.text)
                .tracking(-0.3)

            HStack {
                Button("Cancel") {
                    onDone()
                    dismiss()
                }
                .font(.lato(size: 17, weight: .medium))
                .foregroundStyle(AppTheme.accent)
                .buttonStyle(.plain)
                Spacer()
                Button("Save") { save() }
                    .font(.lato(size: 17, weight: .semibold))
                    .foregroundStyle(canSave ? AppTheme.accent : AppTheme.text.opacity(0.36))
                    .disabled(!canSave)
                    .buttonStyle(.plain)
                    .animation(.easeOut(duration: 0.12), value: canSave)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 20)
    }

    private var amountField: some View {
        HStack(spacing: 4) {
            Text(Money.symbol(for: appState.currency))
                .font(.lato(size: 17, weight: .medium))
                .foregroundStyle(AppTheme.text2)
            TextField("0.00", text: $amountText)
                .font(.lato(size: 17, weight: .medium))
                .tracking(-0.2)
                .foregroundStyle(AppTheme.text)
                .keyboardType(.decimalPad)
                .focused($amountFocused)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(AppTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .padding(.horizontal, 16)
    }

    private func sectionLabel(_ key: LocalizedStringKey) -> some View {
        Text(key)
            .font(.lato(size: 13, weight: .semibold))
            .kerning(0.6)
            .textCase(.uppercase)
            .foregroundStyle(AppTheme.text.opacity(0.58))
            .padding(.horizontal, 24)
            .padding(.bottom, 8)
    }

    // MARK: - Save

    private func save() {
        guard let parsed = parsedAmount,
              let householdID = appState.currentHouseholdID
        else { return }

        let cents = Money.toUSDCents(parsed,
                                     from: appState.currency,
                                     rate: appState.rate(for: appState.currency))
        // Reuse the existing budget's id so upsert hits the same row.
        let id = existingBudget?.id ?? UUID()
        let budget = Budget(
            id: id,
            householdID: householdID,
            category: category,
            monthlyLimitCents: cents
        )
        appState.addOrUpdateBudget(budget)
        onDone()
        dismiss()
    }

    // MARK: - Formatting

    private static func formatAmount(_ cents: Int64,
                                     currency: Currency,
                                     rate: Decimal) -> String {
        let display = Money.toDisplayAmount(cents: cents, in: currency, rate: rate)
        return String(format: "%.2f", NSDecimalNumber(decimal: display).doubleValue)
    }
}
