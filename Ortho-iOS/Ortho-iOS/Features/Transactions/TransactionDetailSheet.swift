import SwiftUI

/// Read-only detail sheet shown when the user taps a row in the activity
/// list. Visual grammar mirrors `AddTransactionSheet` — same nav, same
/// amount hero, same inset cards.
///
/// The sheet takes `txID` (not the Transaction struct) so it can re-read the
/// latest value from `AppState` after edits. When the transaction is deleted
/// (`tx` becomes `nil`), the sheet dismisses itself.
struct TransactionDetailSheet: View {
    let txID: Transaction.ID

    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var appState

    @State private var editing: Transaction?
    @State private var showingDeleteConfirm = false

    private var tx: Transaction? {
        appState.transactions.first(where: { $0.id == txID })
    }

    var body: some View {
        Group {
            if let tx {
                content(for: tx)
            } else {
                // Transaction was deleted (or never existed) — dismiss.
                Color.clear.onAppear { dismiss() }
            }
        }
        .sheet(item: $editing) { tx in
            AddTransactionSheet(editing: tx) { updated, _ in
                // Edit mode ignores keepOpen — it's a single-tx flow.
                appState.updateTransaction(updated)
                editing = nil
            }
            .environment(appState)
            .presentationDetents([.large])
            .presentationBackground(AppTheme.bg)
        }
        .alert("Delete this transaction?", isPresented: $showingDeleteConfirm) {
            Button("Cancel", role: .cancel) { }
            Button("Delete", role: .destructive) {
                if let tx { appState.deleteTransaction(tx) }
                // Sheet auto-dismisses once tx is nil (Color.clear's onAppear).
            }
        } message: {
            Text("This can't be undone.")
        }
    }

    @ViewBuilder
    private func content(for tx: Transaction) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            sheetNav(for: tx)

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    amountHero(for: tx)
                    merchantCard(for: tx)
                    ownersCard(for: tx)
                    metaCard(for: tx)
                    deleteButton
                }
                .padding(.top, 8)
                .padding(.bottom, 24)
            }
        }
        .background(AppTheme.bg)
    }

    // MARK: - Sheet nav

    private func sheetNav(for tx: Transaction) -> some View {
        ZStack {
            Text(navTitle(for: tx))
                .font(.lato(size: 17, weight: .semibold))
                .foregroundStyle(AppTheme.text)
                .tracking(-0.3)

            HStack {
                Button("Done") { dismiss() }
                    .font(.lato(size: 17, weight: .medium))
                    .foregroundStyle(AppTheme.accent)
                    .buttonStyle(.plain)
                Spacer()
                Button("Edit") { editing = tx }
                    .font(.lato(size: 17, weight: .semibold))
                    .foregroundStyle(AppTheme.accent)
                    .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 8)
    }

    // MARK: - Amount hero

    private func amountHero(for tx: Transaction) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            Spacer()
            Text(appState.formatMoney(tx.amount, leadingPlus: tx.isIncome))
                .font(.lato(size: 40, weight: .semibold))
                .tracking(-0.6)
                .monospacedDigit()
                .foregroundStyle(tx.isIncome ? AppTheme.positive : AppTheme.text)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .padding(.horizontal, 16)
            Spacer()
        }
        .padding(.vertical, 8)
    }

    // MARK: - Cards

    private func merchantCard(for tx: Transaction) -> some View {
        formGroup {
            staticRow(label: tx.kind == .income ? "Source" : "Merchant", value: tx.merchant)
            if tx.kind == .expense {
                divider
                HStack(spacing: 12) {
                    Text("Category")
                        .font(.lato(size: 15))
                        .foregroundStyle(AppTheme.text.opacity(0.58))
                        .frame(width: 96, alignment: .leading)
                    Spacer()
                    HStack(spacing: 6) {
                        Image(systemName: tx.category.symbol)
                            .font(.lato(size: 13, weight: .semibold))
                        Text(tx.category.displayName.string)
                            .font(.lato(size: 17, weight: .medium))
                            .tracking(-0.2)
                    }
                    .foregroundStyle(AppTheme.text)
                }
                .padding(.horizontal, 16)
                .frame(minHeight: 52)
            }
        }
    }

    private func ownersCard(for tx: Transaction) -> some View {
        let owners = appState.resolveOwners(of: tx)
        let splits = tx.effectiveSplits
        return formGroup {
            ForEach(Array(owners.enumerated()), id: \.element.id) { idx, u in
                HStack(spacing: 12) {
                    UserAvatarView(user: u, size: 28)
                    Text(u.name)
                        .font(.lato(size: 17, weight: .medium))
                        .tracking(-0.2)
                        .foregroundStyle(AppTheme.text)
                    Spacer()
                    if owners.count > 1 {
                        Text("\(formatPercent(splits[u.id] ?? 0))%")
                            .font(.lato(size: 17, weight: .medium))
                            .monospacedDigit()
                            .foregroundStyle(AppTheme.text.opacity(0.58))
                    }
                }
                .padding(.horizontal, 16)
                .frame(minHeight: 52)
                if idx < owners.count - 1 { divider }
            }
        }
    }

    private func metaCard(for tx: Transaction) -> some View {
        formGroup {
            staticRow(
                label: tx.kind == .income ? "Deposit to" : "Paid with",
                value: tx.source
            )
            divider
            staticRow(label: "Date", value: Self.dateFormatter.string(from: tx.date))
        }
    }

    private var deleteButton: some View {
        Button {
            showingDeleteConfirm = true
        } label: {
            HStack {
                Spacer()
                Text("Delete transaction")
                    .font(.lato(size: 17, weight: .medium))
                    .foregroundStyle(AppTheme.destructive)
                Spacer()
            }
            .padding(.vertical, 14)
            .background(AppTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .padding(.horizontal, 16)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Helpers

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

    private func staticRow(label: LocalizedStringKey, value: String) -> some View {
        HStack(spacing: 12) {
            Text(label)
                .font(.lato(size: 15))
                .foregroundStyle(AppTheme.text.opacity(0.58))
                .frame(width: 96, alignment: .leading)
            Spacer()
            Text(value)
                .font(.lato(size: 17, weight: .medium))
                .tracking(-0.2)
                .foregroundStyle(AppTheme.text)
                .multilineTextAlignment(.trailing)
                .lineLimit(2)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 52)
    }

    private func formatPercent(_ d: Decimal) -> String {
        let ns = NSDecimalNumber(decimal: d)
        return String(format: "%.2f", ns.doubleValue)
    }

    /// Locale-aware medium-style date formatter. Built fresh on access
    /// so it picks up `Localizer.currentLocale` after a language change.
    private static var dateFormatter: DateFormatter {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .none
        f.locale = Localizer.currentLocale
        return f
    }

    /// Nav title that surfaces the scope ("Personal expense", "Expense · Home").
    private func navTitle(for tx: Transaction) -> String {
        let kindLabel = Localizer.tr(tx.kind == .income ? "Income" : "Expense")
        if tx.householdID == nil {
            return "Personal \(kindLabel.lowercased())"
        }
        if let h = appState.households.first(where: { $0.id == tx.householdID }) {
            return "\(kindLabel) · \(h.name)"
        }
        return kindLabel
    }
}

#Preview("Detail · Solo expense") {
    Color.gray.opacity(0.2)
        .ignoresSafeArea()
        .sheet(isPresented: .constant(true)) {
            TransactionDetailSheet(txID: Transaction.sample[0].id)
                .environment(AppState())
                .presentationBackground(AppTheme.bg)
        }
}

#Preview("Detail · Joint expense") {
    Color.gray.opacity(0.2)
        .ignoresSafeArea()
        .sheet(isPresented: .constant(true)) {
            TransactionDetailSheet(
                txID: Transaction.sample.first(where: { $0.ownerIDs.count > 1 })?.id
                    ?? Transaction.sample[0].id
            )
            .environment(AppState())
            .presentationBackground(AppTheme.bg)
        }
}

#Preview("Detail · Income") {
    Color.gray.opacity(0.2)
        .ignoresSafeArea()
        .sheet(isPresented: .constant(true)) {
            TransactionDetailSheet(
                txID: Transaction.sample.first(where: { $0.kind == .income })?.id
                    ?? Transaction.sample[0].id
            )
            .environment(AppState())
            .presentationBackground(AppTheme.bg)
        }
}
