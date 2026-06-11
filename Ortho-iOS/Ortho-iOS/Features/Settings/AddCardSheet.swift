import SwiftUI

/// Modal sheet for adding a payment card / source. Mirrors AddUserSheet's
/// nav grammar (Cancel · "New card" · Add) and minimal field set.
struct AddCardSheet: View {
    let onAdd: (Card) -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    @State private var name: String = ""
    @FocusState private var nameFocused: Bool

    private var canAdd: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            sheetNav

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    sectionLabel("Name")
                    nameField
                        .padding(.bottom, 20)

                    Text("This name will show up in the Paid with menu when you log a new expense.")
                        .font(.lato(size: 13))
                        .foregroundStyle(AppTheme.text.opacity(0.36))
                        .lineSpacing(2)
                        .padding(.horizontal, 24)
                        .padding(.bottom, 24)
                        .frame(maxWidth: 320, alignment: .leading)
                }
                .padding(.top, 8)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(AppTheme.bg)
        .onAppear { nameFocused = true }
    }

    private var sheetNav: some View {
        ZStack {
            Text("New card")
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
                    guard let hid = appState.currentHouseholdID else { return }
                    onAdd(Card(
                        householdID: hid,
                        name: name.trimmingCharacters(in: .whitespaces)
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
        .padding(.bottom, 20)
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

    private var nameField: some View {
        TextField("e.g. Chase Freedom", text: $name)
            .font(.lato(size: 17, weight: .medium))
            .tracking(-0.2)
            .foregroundStyle(AppTheme.text)
            .focused($nameFocused)
            .submitLabel(.done)
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(AppTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .padding(.horizontal, 16)
    }
}

#Preview("Add Card · Light") {
    Color.gray.opacity(0.2)
        .ignoresSafeArea()
        .sheet(isPresented: .constant(true)) {
            AddCardSheet { _ in }
                .presentationBackground(AppTheme.bg)
                .environment(AppState())
        }
}

#Preview("Add Card · Dark") {
    Color.gray.opacity(0.2)
        .ignoresSafeArea()
        .sheet(isPresented: .constant(true)) {
            AddCardSheet { _ in }
                .presentationBackground(AppTheme.bg)
                .environment(AppState())
        }
        .preferredColorScheme(.dark)
}
