import SwiftUI

/// Two-step magic-link sign-in: email entry → 6-digit code from the email.
/// Success drives `AppState.session` non-nil; the auth gate in
/// `Ortho_iOSApp` then swaps in `RootTabView`.
///
/// Layout: large `ORTHO` wordmark sits in the upper third on the bare
/// screen (no card), with the form anchored to the bottom — title +
/// subtitle + input + primary button + per-step fine-print footer.
/// Mirrors the polished onboarding mock and keeps the visual rhythm
/// close to other muted-fill capsule affordances throughout the app.
struct SignInView: View {
    @Environment(AppState.self) private var appState

    @State private var email: String = ""
    @State private var code: String = ""
    @FocusState private var focused: Field?

    private enum Field { case email, code }

    private var step: Step {
        appState.pendingSignInEmail == nil ? .email : .code
    }
    private enum Step { case email, code }

    var body: some View {
        ZStack {
            AppTheme.bg.ignoresSafeArea()

            // Ambient concentric rings tinted with `AppTheme.accent`. The
            // offset `(-50, 0)` puts the origin inside the first O of
            // "ORTHO" — at 28pt size with 8pt tracking, the leading O's
            // center is ~50pt left of the wordmark center, and absolute
            // points keeps that anchor stable across screen widths.
            AmbientRippleBackground(
                originOffset: CGSize(width: -50, height: 0),
                rippleColor:  AppTheme.accent
            )
            .ignoresSafeArea()

            // ORTHO floats in the upper portion of the screen, explicitly
            // centered horizontally. Two weighted spacers below push it
            // above the vertical midpoint (target: ~40% from top) so the
            // form has natural room to sit at the bottom without crowding
            // the wordmark.
            VStack(spacing: 0) {
                Spacer()
                Text("ORTHO")
                    .font(.lato(size: 28, weight: .regular))
                    .tracking(8)
                    .foregroundStyle(AppTheme.text)
                Spacer()
                Spacer()
            }
            .frame(maxWidth: .infinity)
        }
        // Pinning the form to the bottom safe area decouples it from the
        // ORTHO spacer layout — when the keyboard appears, iOS adjusts the
        // inset cleanly and the wordmark above stays in its column rather
        // than colliding with the form. The inset is intentionally
        // transparent so the ripple animation continues through the form
        // area — the field + button each carry their own muted-fill
        // background already, so the only thing the ripple passes through
        // is the empty space between them.
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 0) {
                form
                    .padding(.horizontal, 24)

                if let error = appState.authError {
                    Text(error)
                        .font(.lato(size: 13))
                        .foregroundStyle(AppTheme.destructive)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                        .padding(.top, 10)
                }

                footer
                    .padding(.horizontal, 24)
                    .padding(.top, 14)
                    .padding(.bottom, 8)
            }
        }
        // Tap anywhere outside the input or button to dismiss the keyboard.
        // SwiftUI hands taps consumed by TextField / Button to those views
        // first, so this gesture only fires for the empty background, the
        // wordmark, and the footer text.
        .contentShape(Rectangle())
        .onTapGesture { focused = nil }
        .onAppear { focused = step == .email ? .email : .code }
        .onChange(of: step) { _, newValue in
            focused = newValue == .email ? .email : .code
        }
    }

    // MARK: - Form

    @ViewBuilder
    private var form: some View {
        VStack(alignment: .leading, spacing: 14) {
            switch step {
            case .email: emailStep
            case .code:  codeStep
            }
        }
    }

    @ViewBuilder
    private var emailStep: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Sign in")
                .font(.lato(size: 24, weight: .bold))
                .tracking(-0.3)
                .foregroundStyle(AppTheme.text)
            Text("We'll email you a 6-digit code. No password, no fuss.")
                .font(.lato(size: 14))
                .foregroundStyle(AppTheme.text2)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.bottom, 4)

        TextField(
            "",
            text: $email,
            prompt: Text("you@example.com")
                .foregroundStyle(AppTheme.text.opacity(0.36))
        )
            .keyboardType(.emailAddress)
            .textContentType(.emailAddress)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .font(.lato(size: 16))
            .multilineTextAlignment(.center)
            .foregroundStyle(AppTheme.text)
            .padding(.vertical, 16)
            .padding(.horizontal, 16)
            .background(fieldFill)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .focused($focused, equals: .email)
            .submitLabel(.send)
            .onSubmit(sendCode)

        primaryButton(
            title: "Send code",
            disabled: !isValidEmail(email) || appState.isAuthLoading,
            action: sendCode
        )
    }

    @ViewBuilder
    private var codeStep: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Enter your code")
                .font(.lato(size: 24, weight: .bold))
                .tracking(-0.3)
                .foregroundStyle(AppTheme.text)
            Text("Sent to **\(appState.pendingSignInEmail ?? "")**.")
                .font(.lato(size: 14))
                .foregroundStyle(AppTheme.text2)
        }
        .padding(.bottom, 4)

        TextField(
            "",
            text: $code,
            prompt: Text("• • • • • • • •")
                .foregroundStyle(AppTheme.text.opacity(0.36))
        )
            .keyboardType(.numberPad)
            .textContentType(.oneTimeCode)
            // OTP input keeps the system monospaced font — Lato isn't a
            // monospaced family and digit positions matter for visual
            // verification of the 8-digit code.
            .font(.system(size: 22, weight: .semibold, design: .monospaced))
            .tracking(6)
            .multilineTextAlignment(.center)
            .foregroundStyle(AppTheme.text)
            .padding(.vertical, 16)
            .padding(.horizontal, 16)
            .background(fieldFill)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .focused($focused, equals: .code)
            .onChange(of: code) { _, newValue in
                code = String(newValue.filter(\.isNumber).prefix(8))
            }

        primaryButton(
            title: "Verify",
            disabled: code.count < 8 || appState.isAuthLoading,
            action: verifyCode
        )

        Button("Use a different email") {
            appState.resetSignInFlow()
            code = ""
        }
        .font(.lato(size: 14, weight: .medium))
        .foregroundStyle(AppTheme.text)
        .frame(maxWidth: .infinity)
        .padding(.top, 4)
    }

    // MARK: - Footer (per-step fine print)

    @ViewBuilder
    private var footer: some View {
        switch step {
        case .email:
            // Terms / Privacy aren't real URLs yet — render as bolded
            // inline copy via Markdown. Swap to `Link`s when the
            // marketing pages exist.
            Text("By continuing you agree to our **Terms** and **Privacy**.")
                .font(.lato(size: 12))
                .foregroundStyle(AppTheme.text3)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
        case .code:
            HStack(spacing: 4) {
                Text("Didn't receive it?")
                    .font(.lato(size: 12))
                    .foregroundStyle(AppTheme.text3)
                Button("Send again") {
                    if let pending = appState.pendingSignInEmail {
                        Task { await appState.requestSignInCode(email: pending) }
                    }
                }
                .font(.lato(size: 12, weight: .semibold))
                .foregroundStyle(AppTheme.text)
                .disabled(appState.isAuthLoading)
            }
            .frame(maxWidth: .infinity)
        }
    }

    // MARK: - Field + button styling

    /// Muted fill used by both the input field and the primary button so
    /// they read as paired siblings without competing with the empty
    /// screen background.
    private var fieldFill: Color {
        AppTheme.text.opacity(0.05)
    }

    @ViewBuilder
    private func primaryButton(title: String,
                               disabled: Bool,
                               action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                if appState.isAuthLoading {
                    ProgressView()
                        .tint(AppTheme.text)
                } else {
                    Text(title)
                        .font(.lato(size: 16, weight: .semibold))
                        .foregroundStyle(disabled
                                         ? AppTheme.text.opacity(0.36)
                                         : AppTheme.text)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(fieldFill)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(disabled)
    }

    // MARK: - Actions

    private func sendCode() {
        Task { await appState.requestSignInCode(email: email) }
    }

    private func verifyCode() {
        Task {
            await appState.verifyCode(
                email: appState.pendingSignInEmail ?? "",
                code: code
            )
        }
    }

    private func isValidEmail(_ s: String) -> Bool {
        let trimmed = s.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.contains("@") && trimmed.contains(".")
    }
}

#Preview("Sign in · Light") {
    SignInView()
        .environment(AppState())
        .preferredColorScheme(.light)
}

#Preview("Sign in · Dark") {
    SignInView()
        .environment(AppState())
        .preferredColorScheme(.dark)
}
