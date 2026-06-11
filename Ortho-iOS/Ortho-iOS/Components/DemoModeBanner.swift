import SwiftUI

/// Slim banner shown across the top of every tab when `AppState.isInDemoMode`
/// is true. Signals that the data on screen is local-only and provides an
/// Exit button that calls `AppState.exitDemoMode()` to restore real
/// server-backed state.
///
/// Visual treatment matches the existing accent-tinted callouts (lease
/// renewal banner, etc.) — light accent fill, leading flask icon, trailing
/// pill button.
struct DemoModeBanner: View {
    let onExit: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "flask.fill")
                .font(.lato(size: 13, weight: .semibold))
                .foregroundStyle(AppTheme.accent)
            VStack(alignment: .leading, spacing: 1) {
                Text("Demo mode")
                    .font(.lato(size: 13, weight: .semibold))
                    .foregroundStyle(AppTheme.text)
                Text("Changes aren't saved")
                    .font(.lato(size: 11))
                    .foregroundStyle(AppTheme.text2)
            }
            Spacer()
            Button(action: onExit) {
                Text("Exit")
                    .font(.lato(size: 13, weight: .semibold))
                    .foregroundStyle(AppTheme.accent)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 6)
                    .background(Capsule().fill(AppTheme.text.opacity(0.05)))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(AppTheme.accent.opacity(0.10))
    }
}

#Preview("DemoModeBanner") {
    VStack(spacing: 0) {
        DemoModeBanner(onExit: { })
        Spacer()
    }
    .background(AppTheme.bg)
}
