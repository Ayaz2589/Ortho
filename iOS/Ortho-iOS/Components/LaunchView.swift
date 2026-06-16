import SwiftUI

/// Neutral launch screen shown while auth is resolving at cold start
/// (`AppState.AuthPhase.launching`). It exists so a returning user with a
/// valid stored session never sees the sign-in screen flash before the
/// SDK's first auth event arrives. Calm by design (Constitution IV): just
/// the wordmark on the app background — no spinner shimmer, no alarmist copy.
struct LaunchView: View {
    var body: some View {
        ZStack {
            AppTheme.bg.ignoresSafeArea()
            Text("ORTHO")
                .font(.lato(size: 28, weight: .regular))
                .tracking(8)
                .foregroundStyle(AppTheme.text)
        }
    }
}

#Preview { LaunchView() }
