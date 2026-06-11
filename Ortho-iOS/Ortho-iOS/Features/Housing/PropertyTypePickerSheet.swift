import SwiftUI

/// First step of adding a property — pick the kind. Each row matches a
/// `PropertyKind` and dismisses the sheet with that kind, which the parent
/// then uses to present the right `AddPropertySheet` variant.
struct PropertyTypePickerSheet: View {
    let onPick: (PropertyKind) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            sheetNav

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("What kind of home is this? Choose one — we'll ask only the questions that fit.")
                        .font(.lato(size: 14))
                        .foregroundStyle(AppTheme.text.opacity(0.58))
                        .lineSpacing(2)
                        .padding(.horizontal, 24)
                        .padding(.bottom, 16)

                    VStack(spacing: 12) {
                        ForEach(PropertyKind.allCases) { kind in
                            row(for: kind)
                        }
                    }
                    .padding(.horizontal, 16)

                    Text("You can change type later from the property's settings, but a few fields will reset (e.g. lease dates become closing date).")
                        .font(.lato(size: 13))
                        .foregroundStyle(AppTheme.text.opacity(0.36))
                        .lineSpacing(2)
                        .padding(.horizontal, 24)
                        .padding(.top, 16)
                        .padding(.bottom, 24)
                }
            }
        }
        .background(AppTheme.bg)
    }

    private var sheetNav: some View {
        ZStack {
            Text("New property")
                .font(.lato(size: 17, weight: .semibold))
                .foregroundStyle(AppTheme.text)
                .tracking(-0.3)

            HStack {
                Button("Cancel") { dismiss() }
                    .font(.lato(size: 17, weight: .medium))
                    .foregroundStyle(AppTheme.accent)
                    .buttonStyle(.plain)
                Spacer()
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 20)
    }

    private func row(for kind: PropertyKind) -> some View {
        Button {
            onPick(kind)
        } label: {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 11, style: .continuous)
                        .fill(AppTheme.text.opacity(0.05))
                        .frame(width: 44, height: 44)
                    Image(systemName: kind.symbol)
                        .font(.lato(size: 19, weight: .medium))
                        .foregroundStyle(AppTheme.text2)
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text(kind.displayName)
                        .font(.lato(size: 17, weight: .semibold))
                        .tracking(-0.3)
                        .foregroundStyle(AppTheme.text)
                    Text(kind.subtitle)
                        .font(.lato(size: 13))
                        .foregroundStyle(AppTheme.text2)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.lato(size: 13, weight: .semibold))
                    .foregroundStyle(AppTheme.text.opacity(0.36))
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(AppTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

#Preview("Type picker · Light") {
    Color.gray.opacity(0.2)
        .ignoresSafeArea()
        .sheet(isPresented: .constant(true)) {
            PropertyTypePickerSheet { _ in }
                .presentationBackground(AppTheme.bg)
        }
}

#Preview("Type picker · Dark") {
    Color.gray.opacity(0.2)
        .ignoresSafeArea()
        .sheet(isPresented: .constant(true)) {
            PropertyTypePickerSheet { _ in }
                .presentationBackground(AppTheme.bg)
        }
        .preferredColorScheme(.dark)
}
