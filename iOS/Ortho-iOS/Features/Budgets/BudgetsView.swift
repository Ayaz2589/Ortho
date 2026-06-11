import SwiftUI

/// Standalone budgets-management screen. Pushed from `SettingsView` via
/// `NavigationLink`. Lists every `TransactionCategory` (except `.income`)
/// with its current monthly limit, or "Not set" if none exists. Tapping a
/// row opens `EditBudgetSheet` for set / edit / delete.
struct BudgetsView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    /// Sheet state — non-nil means edit-or-set sheet is open for this category.
    @State private var editingCategory: TransactionCategory?

    /// Every spend category, in a stable order matching the picker / icons.
    private var spendCategories: [TransactionCategory] {
        TransactionCategory.allCases.filter { $0 != .income }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                VStack(spacing: 0) {
                    ForEach(Array(spendCategories.enumerated()), id: \.element) { idx, cat in
                        budgetRow(cat)
                        if idx < spendCategories.count - 1 {
                            RowSeparator(density: .comfortable)
                        }
                    }
                }
                .background(AppTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .padding(.horizontal, 16)
                .padding(.bottom, 12)

                Text("Budgets drive the spending insights on your dashboard. Set a monthly limit for any category and you'll see progress + alerts when you're close to or over the limit.")
                    .font(.lato(size: 13))
                    .foregroundStyle(AppTheme.text.opacity(0.36))
                    .lineSpacing(2)
                    .padding(.horizontal, 24)
                    .padding(.bottom, 24)
            }
        }
        .background(AppTheme.bg)
        .toolbar(.hidden, for: .navigationBar)
        .hidesTabBar()
        .safeAreaInset(edge: .top, spacing: 0) {
            HStack(spacing: 12) {
                Button { dismiss() } label: {
                    ZStack {
                        Circle().fill(AppTheme.text.opacity(0.05))
                            .frame(width: 36, height: 36)
                        Image(systemName: "chevron.left")
                            .font(.lato(size: 16, weight: .semibold))
                            .foregroundStyle(AppTheme.accent)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Back")

                Text("Budgets")
                    .font(.lato(size: 32, weight: .bold))
                    .tracking(-0.6)
                    .foregroundStyle(AppTheme.text)
                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.top, 4)
            .padding(.bottom, 24)
            .background(AppTheme.bg)
        }
        .sheet(item: $editingCategory) { cat in
            EditBudgetSheet(category: cat) { editingCategory = nil }
                .environment(appState)
                .presentationDetents([.medium])
                .presentationBackground(AppTheme.bg)
        }
    }

    // MARK: - Rows

    private func budgetRow(_ category: TransactionCategory) -> some View {
        let budget = appState.budget(for: category)
        return Button {
            editingCategory = category
        } label: {
            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(category.tint.opacity(0.92))
                        .frame(width: 32, height: 32)
                    Image(systemName: category.symbol)
                        .font(.lato(size: 14, weight: .medium))
                        .foregroundStyle(.white)
                }
                Text(category.displayName.string)
                    .font(.lato(size: 17, weight: .medium))
                    .tracking(-0.2)
                    .foregroundStyle(AppTheme.text)
                Spacer()
                HStack(spacing: 6) {
                    Text(budget.map { appState.formatMoney($0.monthlyLimitCents) + " /mo" }
                         ?? "Not set")
                        .font(.lato(size: 15, weight: .medium))
                        .tracking(-0.2)
                        .foregroundStyle(budget == nil ? AppTheme.text3 : AppTheme.text2)
                    Image(systemName: "chevron.right")
                        .font(.lato(size: 13, weight: .semibold))
                        .foregroundStyle(AppTheme.text.opacity(0.36))
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(minHeight: 56)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

#Preview("Budgets · Light") {
    NavigationStack {
        BudgetsView()
            .environment(AppState())
    }
    .preferredColorScheme(.light)
}

#Preview("Budgets · Dark") {
    NavigationStack {
        BudgetsView()
            .environment(AppState())
    }
    .preferredColorScheme(.dark)
}
