import SwiftUI

/// Initial-in-circle avatar for a household user. `ring` paints a contrasting
/// outline so it reads cleanly when overlapped on another tile (the category
/// tile in a transaction row).
struct UserAvatarView: View {
    let user: User
    var size: CGFloat = 32
    var ring: Bool = false
    var ringColor: Color = .white

    var body: some View {
        let palette = user.palette
        let multiGlyph = user.initial.count > 1
        Text(user.initial)
            .font(.lato(size: multiGlyph ? size * 0.30 : size * 0.42,
                          weight: .semibold))
            .foregroundStyle(palette.fg)
            .frame(width: size, height: size)
            .background(Circle().fill(palette.bg))
            .overlay(
                Circle().strokeBorder(ring ? ringColor : .clear, lineWidth: 2)
            )
    }
}
