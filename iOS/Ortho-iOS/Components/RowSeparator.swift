import SwiftUI

/// Hairline divider, inset to start past the avatar — matches the inset
/// grouped style of the activity list.
struct RowSeparator: View {
    let density: Density
    var body: some View {
        Rectangle()
            .fill(AppTheme.hairline)
            .frame(height: 0.5)
            .padding(.leading, density.pad + density.avatar + 16)
    }
}
