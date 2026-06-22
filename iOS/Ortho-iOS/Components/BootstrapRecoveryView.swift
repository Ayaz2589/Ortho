import SwiftUI

/// Shown when the signed-in user's bootstrap (upsert user → find/create
/// household → load data) failed and left us with no usable household.
/// Rather than dropping the user into an empty, half-broken tab shell, we
/// offer a calm, explicit "Retry" (Constitution IV: short, never alarmist —
/// no red panel, no shimmer). Retry re-runs `bootstrapUserSession`; on
/// success `bootstrapDidFail` clears and the app gate swaps in `RootTabView`.
struct BootstrapRecoveryView: View {
    @Environment(AppState.self) private var appState
    @State private var isRetrying = false

    var body: some View {
        ZStack {
            AppTheme.bg.ignoresSafeArea()

            VStack(spacing: 16) {
                Text("ORTHO")
                    .font(.lato(size: 24, weight: .regular))
                    .tracking(7)
                    .foregroundStyle(AppTheme.text)
                    .padding(.bottom, 8)

                Text("Couldn't finish setup")
                    .font(.lato(size: 19, weight: .semibold))
                    .foregroundStyle(AppTheme.text)

                Text("We couldn't load your household. Check your connection and try again.")
                    .font(.lato(size: 15))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(AppTheme.text2)
                    .padding(.horizontal, 32)
                    .lineSpacing(2)

                Button {
                    Task {
                        isRetrying = true
                        await appState.retryBootstrap()
                        isRetrying = false
                    }
                } label: {
                    Text(isRetrying ? "Retrying…" : "Retry")
                        .font(.lato(size: 17, weight: .semibold))
                        .foregroundStyle(AppTheme.bg)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .fill(AppTheme.accent)
                        )
                }
                .buttonStyle(.plain)
                .disabled(isRetrying)
                .padding(.horizontal, 40)
                .padding(.top, 8)

                Button {
                    Task { await appState.signOut() }
                } label: {
                    Text("Sign out")
                        .font(.lato(size: 15, weight: .medium))
                        .foregroundStyle(AppTheme.text3)
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 40)
            }
        }
    }
}

#Preview {
    BootstrapRecoveryView()
        .environment(AppState())
}
