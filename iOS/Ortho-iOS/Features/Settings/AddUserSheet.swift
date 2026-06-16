import SwiftUI

/// Modal sheet for adding OR editing a household **person** — anyone you
/// split transactions with (partner, roommate, family). No Ortho account
/// needed. Emits `(name, colorKey)`; the caller persists via
/// `AppState.addPerson` (add) or `renamePerson` + `setPersonColor` (edit).
/// Initial is auto-derived from the name; color picker uses `OrthoColorOption.all`.
/// Seed `initialName` / `initialColorKey` (and a `title` / `actionLabel`) to
/// reuse it as the edit sheet.
struct AddUserSheet: View {
    let title: String
    let actionLabel: String
    let onAdd: (_ name: String, _ colorKey: String) -> Void
    /// When set (edit mode for a removable person), a destructive Remove
    /// action appears at the bottom of the sheet — mirroring web's person
    /// editor which combines rename + recolor + remove.
    let onRemove: (() -> Void)?

    @Environment(\.dismiss) private var dismiss

    @State private var name: String
    @State private var colorKey: String
    @State private var showingRemoveConfirm = false
    @FocusState private var nameFocused: Bool

    init(initialName: String = "",
         initialColorKey: String = OrthoColorOption.all[0].key,
         title: String = "Add person",
         actionLabel: String = "Add",
         onRemove: (() -> Void)? = nil,
         onAdd: @escaping (_ name: String, _ colorKey: String) -> Void) {
        _name = State(initialValue: initialName)
        _colorKey = State(initialValue: initialColorKey)
        self.title = title
        self.actionLabel = actionLabel
        self.onRemove = onRemove
        self.onAdd = onAdd
    }

    private var derivedInitial: String { Self.deriveInitial(from: name) }
    private var canAdd: Bool { !name.trimmingCharacters(in: .whitespaces).isEmpty }
    private var color: OrthoColorOption { OrthoColorOption.find(colorKey) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            sheetNav

            HStack {
                Spacer()
                previewAvatar
                Spacer()
            }
            .padding(.top, 4)
            .padding(.bottom, 24)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    sectionLabel("Name")
                    nameField
                        .padding(.bottom, 20)

                    sectionLabel("Color")
                    colorPicker
                        .padding(.bottom, 16)

                    Text("Initial is set automatically from the name. Joint accounts get two initials joined with +.")
                        .font(.lato(size: 13))
                        .foregroundStyle(AppTheme.text.opacity(0.36))
                        .lineSpacing(2)
                        .padding(.horizontal, 24)
                        .padding(.bottom, 8)
                        .frame(maxWidth: 320, alignment: .leading)

                    Text("People you add can own and split any transaction — no Ortho account needed.")
                        .font(.lato(size: 13))
                        .foregroundStyle(AppTheme.text.opacity(0.36))
                        .lineSpacing(2)
                        .padding(.horizontal, 24)
                        .padding(.bottom, 24)
                        .frame(maxWidth: 320, alignment: .leading)

                    if onRemove != nil {
                        Button { showingRemoveConfirm = true } label: {
                            Text("Remove from household")
                                .font(.lato(size: 17, weight: .medium))
                                .foregroundStyle(AppTheme.destructive)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(AppTheme.surface)
                                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .padding(.horizontal, 16)
                        .padding(.bottom, 24)
                    }
                }
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(AppTheme.bg)
        .onAppear { nameFocused = true }
        .alert("Remove \(name.trimmingCharacters(in: .whitespaces)) from this household?",
               isPresented: $showingRemoveConfirm) {
            Button("Cancel", role: .cancel) { }
            Button("Remove", role: .destructive) { onRemove?() }
        } message: {
            Text("Existing transactions keep this person as the owner.")
        }
    }

    private var sheetNav: some View {
        ZStack {
            Text(title)
                .font(.lato(size: 17, weight: .semibold))
                .foregroundStyle(AppTheme.text)
                .tracking(-0.3)

            HStack {
                Button("Cancel") { dismiss() }
                    .font(.lato(size: 17, weight: .medium))
                    .foregroundStyle(AppTheme.accent)
                    .buttonStyle(.plain)
                Spacer()
                Button(actionLabel) {
                    onAdd(name.trimmingCharacters(in: .whitespaces), colorKey)
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

    private var previewAvatar: some View {
        Text(derivedInitial)
            .font(.lato(size: derivedInitial.count > 1 ? 18 : 26,
                          weight: .semibold))
            .tracking(derivedInitial.count > 1 ? 0 : -0.5)
            .foregroundStyle(color.fg)
            .frame(width: 64, height: 64)
            .background(Circle().fill(color.bg))
            .animation(.easeOut(duration: 0.15), value: colorKey)
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
        TextField("e.g. Alex", text: $name)
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

    private var colorPicker: some View {
        VStack {
            LazyVGrid(
                columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 6),
                spacing: 12
            ) {
                ForEach(OrthoColorOption.all) { opt in
                    ColorSwatchButton(option: opt,
                                      selected: colorKey == opt.key) {
                        colorKey = opt.key
                    }
                }
            }
            .padding(16)
        }
        .background(AppTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .padding(.horizontal, 16)
    }

    /// "Alex" → "A". "M + J" / "Maya & Jordan" → "M+J". Empty → "·".
    static func deriveInitial(from name: String) -> String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "·" }

        let pattern = #"^([A-Za-z])\s*[\+\&]\s*([A-Za-z])"#
        if let regex = try? NSRegularExpression(pattern: pattern),
           let match = regex.firstMatch(
                in: trimmed,
                range: NSRange(trimmed.startIndex..., in: trimmed)),
           let r1 = Range(match.range(at: 1), in: trimmed),
           let r2 = Range(match.range(at: 2), in: trimmed) {
            return "\(trimmed[r1].uppercased())+\(trimmed[r2].uppercased())"
        }
        return String(trimmed.first!).uppercased()
    }
}

#Preview("Add User · Light") {
    Color.gray.opacity(0.2)
        .ignoresSafeArea()
        .sheet(isPresented: .constant(true)) {
            AddUserSheet { _, _ in }
                .presentationBackground(AppTheme.bg)
        }
}

#Preview("Add User · Dark") {
    Color.gray.opacity(0.2)
        .ignoresSafeArea()
        .sheet(isPresented: .constant(true)) {
            AddUserSheet { _, _ in }
                .presentationBackground(AppTheme.bg)
        }
        .preferredColorScheme(.dark)
}
