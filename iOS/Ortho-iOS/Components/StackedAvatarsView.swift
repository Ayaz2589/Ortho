import SwiftUI

/// Overlapping owner avatars — the iOS mirror of web's `StackedAvatars`.
/// Shows up to `max` real member avatars (each ringed so the overlap reads
/// as separation), then a "+N" overflow chip. Used for multi-owner (split)
/// transactions so the row shows the actual people, not a synthetic
/// "Shared" circle.
struct StackedAvatarsView: View {
    let users: [User]
    var size: CGFloat = 20
    var ring: Color = .white
    var max: Int = 4

    var body: some View {
        let shown = Array(users.prefix(max))
        let overflow = users.count - shown.count
        HStack(spacing: -size * 0.34) {
            ForEach(Array(shown.enumerated()), id: \.offset) { _, user in
                UserAvatarView(user: user, size: size, ring: true, ringColor: ring)
            }
            if overflow > 0 {
                Text("+\(overflow)")
                    .font(.lato(size: size * 0.40, weight: .semibold))
                    .foregroundStyle(AppTheme.text2)
                    .frame(width: size, height: size)
                    .background(Circle().fill(AppTheme.hairline))
                    .overlay(Circle().strokeBorder(ring, lineWidth: 2))
            }
        }
    }
}
