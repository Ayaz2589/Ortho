import SwiftUI

/// One option in the Appearance section. Mirrors the visual rhythm of
/// `UserRowView`: a 40pt leading tile, a label, and a trailing affordance —
/// here a checkmark on the selected mode (instead of a chevron).
struct AppearanceRowView: View {
    let mode: AppearanceMode
    let selected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 14) {
                ZStack {
                    Circle().fill(AppTheme.text.opacity(0.05))
                        .frame(width: 40, height: 40)
                    Image(systemName: mode.symbol)
                        .font(.lato(size: 16, weight: .medium))
                        .foregroundStyle(AppTheme.text2)
                }
                Text(mode.label)
                    .font(.lato(size: 17, weight: .medium))
                    .tracking(-0.2)
                    .foregroundStyle(AppTheme.text)
                Spacer()
                if selected {
                    Image(systemName: "checkmark")
                        .font(.lato(size: 14, weight: .semibold))
                        .foregroundStyle(AppTheme.accent)
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
