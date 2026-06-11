import SwiftUI

/// Single circular swatch in the AddUserSheet color picker. The selected
/// state uses a two-stop ring (warm bg "spacer" + text-color outline) so the
/// halo reads cleanly against the warm sheet background.
struct ColorSwatchButton: View {
    let option: OrthoColorOption
    let selected: Bool
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            ZStack {
                Circle().fill(option.bg)
                if selected {
                    Image(systemName: "checkmark")
                        .font(.lato(size: 12, weight: .bold))
                        .foregroundStyle(option.fg)
                }
            }
            .frame(width: 36, height: 36)
            .overlay(
                Circle()
                    .strokeBorder(selected ? AppTheme.text : .clear, lineWidth: 2)
                    .padding(-4)
            )
            .overlay(
                Circle()
                    .strokeBorder(selected ? AppTheme.bg : .clear, lineWidth: 2)
                    .padding(-2)
            )
            .animation(.easeOut(duration: 0.15), value: selected)
        }
        .buttonStyle(.plain)
        .contentShape(Rectangle())
    }
}
