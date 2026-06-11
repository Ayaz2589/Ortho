import SwiftUI

/// Modal sheet for adding a **local** user — a device-only person the
/// primary user can split personal expenses with (partner, roommate,
/// family member without an Ortho account). Emits a `LocalUser` —
/// never written to Supabase. See `LocalUser` for the invariant that
/// local users can only participate in personal-scope transactions.
/// Initial is auto-derived from the name; color picker uses only
/// `OrthoColorOption.all`.
struct AddUserSheet: View {
    let onAdd: (LocalUser) -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var name: String = ""
    @State private var colorKey: String = OrthoColorOption.all[0].key
    @FocusState private var nameFocused: Bool

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

                    Text("Local users stay on this device. Use them to split personal expenses with people who don't have Ortho.")
                        .font(.lato(size: 13))
                        .foregroundStyle(AppTheme.text.opacity(0.36))
                        .lineSpacing(2)
                        .padding(.horizontal, 24)
                        .padding(.bottom, 24)
                        .frame(maxWidth: 320, alignment: .leading)
                }
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(AppTheme.bg)
        .onAppear { nameFocused = true }
    }

    private var sheetNav: some View {
        ZStack {
            Text("New local user")
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
                    onAdd(LocalUser(
                        name: name.trimmingCharacters(in: .whitespaces),
                        initial: derivedInitial,
                        colorKey: colorKey
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
            AddUserSheet { _ in }
                .presentationBackground(AppTheme.bg)
        }
}

#Preview("Add User · Dark") {
    Color.gray.opacity(0.2)
        .ignoresSafeArea()
        .sheet(isPresented: .constant(true)) {
            AddUserSheet { _ in }
                .presentationBackground(AppTheme.bg)
        }
        .preferredColorScheme(.dark)
}
