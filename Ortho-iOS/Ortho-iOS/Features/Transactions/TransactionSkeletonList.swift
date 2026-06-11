import SwiftUI

/// Placeholder shown while the bootstrap fetch is in flight on first
/// sign-in. Mirrors the day-grouped card layout of the real activity
/// list so the transition into populated content doesn't jolt the eye.
///
/// Renders two fake day cards with three rows each — enough to fill the
/// fold without overpromising. A slow opacity pulse on the placeholder
/// bars signals "loading" without competing with the rest of the UI.
struct TransactionSkeletonList: View {
    var body: some View {
        VStack(spacing: 0) {
            skeletonDayCard(rowCount: 3)
            skeletonDayCard(rowCount: 3)
            Color.clear.frame(height: 60)
        }
        .padding(.top, 8)
        .allowsHitTesting(false)
        .accessibilityLabel("Loading your transactions")
    }

    private func skeletonDayCard(rowCount: Int) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            // Day header placeholder — two stacked bars approximating the
            // "Today / $X" header pair from DayHeader.
            HStack {
                placeholderBar(width: 64, height: 14)
                Spacer()
                placeholderBar(width: 56, height: 12)
            }
            .padding(.horizontal, 24)

            VStack(spacing: 0) {
                ForEach(0..<rowCount, id: \.self) { idx in
                    skeletonRow
                    if idx < rowCount - 1 {
                        Rectangle()
                            .fill(AppTheme.hairline)
                            .frame(height: 0.5)
                            .padding(.leading, 72)
                    }
                }
            }
            .background(AppTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .padding(.horizontal, 16)
        }
        .padding(.bottom, 16)
    }

    private var skeletonRow: some View {
        HStack(spacing: 12) {
            // Category tile (~44x44 rounded)
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(AppTheme.text.opacity(0.06))
                .frame(width: 44, height: 44)

            VStack(alignment: .leading, spacing: 6) {
                placeholderBar(width: 140, height: 13)
                placeholderBar(width: 96,  height: 11)
            }
            Spacer(minLength: 8)
            placeholderBar(width: 72, height: 14)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(minHeight: 64)
    }

    private func placeholderBar(width: CGFloat, height: CGFloat) -> some View {
        Capsule()
            .fill(AppTheme.text.opacity(0.08))
            .frame(width: width, height: height)
            .modifier(PulseOpacity())
    }
}

/// Slow opacity pulse — subtle enough to read as "in progress" without
/// distracting. Single shared animation curve across every placeholder.
private struct PulseOpacity: ViewModifier {
    @State private var isOn = false

    func body(content: Content) -> some View {
        content
            .opacity(isOn ? 1.0 : 0.55)
            .animation(
                .easeInOut(duration: 1.1).repeatForever(autoreverses: true),
                value: isOn
            )
            .onAppear { isOn = true }
    }
}

#Preview("Skeleton · Light") {
    TransactionSkeletonList()
        .background(AppTheme.bg)
        .preferredColorScheme(.light)
}

#Preview("Skeleton · Dark") {
    TransactionSkeletonList()
        .background(AppTheme.bg)
        .preferredColorScheme(.dark)
}
