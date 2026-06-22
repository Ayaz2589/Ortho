import SwiftUI

/// Standalone household-management screen. Pushed from `SettingsView` via
/// `NavigationLink`. Carries its own custom large-title header (32pt bold +
/// back chevron) so the chrome stays consistent with the rest of the app's
/// hand-rolled top bars.
struct HouseholdView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var showingRenameHousehold = false
    @State private var pendingHouseholdName: String = ""
    @State private var showingAddPerson = false
    @State private var editingUser: User?

    private var householdMembers: [User] { appState.householdMembers }

    /// Whether a person is removable: not the account holder, and not the last one.
    private func canRemove(_ u: User) -> Bool {
        u.id != appState.currentPersonID && householdMembers.count > 1
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                VStack(spacing: 0) {
                    householdNameRow
                    RowSeparator(density: .comfortable)
                    // Everyone in the household is a person — the account holder
                    // plus anyone added by name. People you add need no Ortho
                    // account; they can own and split any transaction.
                    ForEach(Array(householdMembers.enumerated()), id: \.element.id) { idx, u in
                        UserRowView(
                            user: u,
                            detail: detail(for: u),
                            isCurrentUser: u.id == appState.currentPersonID,
                            onTap: { editingUser = u }
                        )
                        if idx < householdMembers.count - 1 {
                            RowSeparator(density: .comfortable)
                        }
                    }

                    RowSeparator(density: .comfortable)
                    AddUserRowView { showingAddPerson = true }
                }
                .background(AppTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .padding(.horizontal, 16)
                .padding(.bottom, 12)

                Text("Everyone in your household can own a transaction. People you add need no Ortho account; you can split any transaction between them.")
                    .font(.lato(size: 13))
                    .foregroundStyle(AppTheme.text.opacity(0.36))
                    .lineSpacing(2)
                    .padding(.horizontal, 24)
                    .padding(.bottom, 24)
            }
        }
        .sheet(isPresented: $showingAddPerson) {
            AddUserSheet { name, colorKey in
                appState.addPerson(name: name, colorKey: colorKey)
                showingAddPerson = false
            }
            .presentationDetents([.large])
            .presentationBackground(AppTheme.bg)
        }
        .sheet(item: $editingUser) { u in
            // Tap a person to edit name + color (and remove, if removable) —
            // reuses AddUserSheet seeded from the existing person, bringing
            // iOS to parity with web's person editor.
            AddUserSheet(
                initialName: u.name,
                initialColorKey: u.colorKey,
                title: "Edit person",
                actionLabel: "Save",
                onRemove: canRemove(u) ? {
                    appState.removePerson(u.id)
                    editingUser = nil
                } : nil
            ) { name, colorKey in
                appState.renamePerson(u.id, name: name)
                appState.setPersonColor(u.id, colorKey: colorKey)
                editingUser = nil
            }
            .presentationDetents([.large])
            .presentationBackground(AppTheme.bg)
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
                    // ≥44pt touch target around the 36pt visual circle.
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Back")

                Text("Household")
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
        .alert("Rename household", isPresented: $showingRenameHousehold) {
            TextField("Household name", text: $pendingHouseholdName)
            Button("Cancel", role: .cancel) { }
            Button("Save") {
                let trimmed = pendingHouseholdName.trimmingCharacters(in: .whitespaces)
                if !trimmed.isEmpty { appState.updateHouseholdName(trimmed) }
            }
        }
    }

    private func detail(for u: User) -> String {
        "\(appState.formatMoney(appState.monthlySpent(by: u.id))) this month"
    }

    // MARK: - Rows

    private var householdNameRow: some View {
        Button {
            pendingHouseholdName = appState.currentHousehold?.name ?? ""
            showingRenameHousehold = true
        } label: {
            HStack(spacing: 12) {
                Text("Name")
                    .font(.lato(size: 17, weight: .medium))
                    .tracking(-0.2)
                    .foregroundStyle(AppTheme.text)
                Spacer()
                HStack(spacing: 6) {
                    Text(appState.currentHousehold?.name ?? "Untitled")
                        .font(.lato(size: 17, weight: .medium))
                        .tracking(-0.2)
                        .foregroundStyle(AppTheme.text2)
                    Image(systemName: "chevron.right")
                        .font(.lato(size: 13, weight: .semibold))
                        .foregroundStyle(AppTheme.text.opacity(0.36))
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(minHeight: 64)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

}

#Preview("Household · Light") {
    NavigationStack {
        HouseholdView()
            .environment(AppState())
    }
    .preferredColorScheme(.light)
}

#Preview("Household · Dark") {
    NavigationStack {
        HouseholdView()
            .environment(AppState())
    }
    .preferredColorScheme(.dark)
}
