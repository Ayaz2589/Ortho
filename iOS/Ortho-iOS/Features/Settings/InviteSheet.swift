import SwiftUI
import UIKit // UIPasteboard for "Copy code"

/// Spec 017 US1/US5 — the owner's partner-invite sheet (Settings → Household →
/// "Invite your partner"). Creates a one-time invite (the code is revealed
/// exactly once, straight from `AppState.createInvite()` — it exists nowhere
/// else and is unrecoverable after dismissal), lists the household's invites
/// with calm text statuses, and revokes pending ones behind a confirm.
/// Mirrors web `components/settings/InviteCard.tsx`.
struct InviteSheet: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var revealedCode: String?
    @State private var creating = false
    @State private var copied = false
    @State private var confirmRevoke: PendingInvite?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            sheetNav

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if let code = revealedCode {
                        revealPanel(code)
                            .padding(.bottom, 20)
                    } else {
                        createRow
                            .padding(.bottom, 20)
                    }

                    if !appState.invites.isEmpty {
                        inviteList
                            .padding(.bottom, 16)
                    }

                    Text("Your partner signs in with their own email, then enters this code to join your household.")
                        .font(.lato(size: 13))
                        .foregroundStyle(AppTheme.text.opacity(0.36))
                        .lineSpacing(2)
                        .padding(.horizontal, 24)
                        .padding(.bottom, 24)
                }
            }
        }
        .background(AppTheme.bg)
        .alert(
            "Revoke this invite?",
            isPresented: Binding(
                get: { confirmRevoke != nil },
                set: { if !$0 { confirmRevoke = nil } }
            ),
            presenting: confirmRevoke
        ) { invite in
            Button("Cancel", role: .cancel) { confirmRevoke = nil }
            Button("Revoke invite", role: .destructive) {
                appState.revokeInvite(invite.id)
                confirmRevoke = nil
            }
        } message: { _ in
            Text("The code stops working immediately. You can always create a new one.")
        }
    }

    private var sheetNav: some View {
        ZStack {
            Text("Invite your partner")
                .font(.lato(size: 17, weight: .semibold))
                .foregroundStyle(AppTheme.text)
                .tracking(-0.3)
            HStack {
                Spacer()
                Button("Done") { dismiss() }
                    .font(.lato(size: 17, weight: .semibold))
                    .foregroundStyle(AppTheme.accent)
                    .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 20)
    }

    private var createRow: some View {
        Button {
            guard !creating else { return }
            creating = true
            copied = false
            Task {
                let code = await appState.createInvite()
                await MainActor.run {
                    creating = false
                    // Reveal only after the row is durably persisted — a failed
                    // insert surfaces via the dataError alert, never a dead code.
                    if let code { revealedCode = code }
                }
            }
        } label: {
            HStack {
                Text(creating ? "Creating…" : "Create invite")
                    .font(.lato(size: 17, weight: .medium))
                    .tracking(-0.2)
                    .foregroundStyle(creating ? AppTheme.text.opacity(0.36) : AppTheme.accent)
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 16)
            .background(AppTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(creating)
        .padding(.horizontal, 16)
    }

    private func revealPanel(_ code: String) -> some View {
        VStack(spacing: 14) {
            Text(verbatim: code)
                .font(.system(size: 24, design: .monospaced))
                .tracking(2)
                .foregroundStyle(AppTheme.text)
                .accessibilityLabel("Invite code")

            Text("This code is shown only once — copy or share it now.")
                .font(.lato(size: 13))
                .foregroundStyle(AppTheme.text.opacity(0.36))
                .multilineTextAlignment(.center)

            HStack(spacing: 10) {
                Button {
                    UIPasteboard.general.string = code
                    copied = true
                } label: {
                    Text(copied ? "Code copied" : "Copy code")
                        .font(.lato(size: 14, weight: .medium))
                        .foregroundStyle(AppTheme.text.opacity(0.58))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(Capsule().fill(AppTheme.text.opacity(0.05)))
                }
                .buttonStyle(.plain)

                ShareLink(item: code) {
                    Text("Share")
                        .font(.lato(size: 14, weight: .medium))
                        .foregroundStyle(AppTheme.text.opacity(0.58))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(Capsule().fill(AppTheme.text.opacity(0.05)))
                }

                Button {
                    revealedCode = nil
                    copied = false
                } label: {
                    Text("Done")
                        .font(.lato(size: 14, weight: .semibold))
                        .foregroundStyle(AppTheme.accent)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
        .padding(.horizontal, 16)
        .background(AppTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .padding(.horizontal, 16)
    }

    private var inviteList: some View {
        VStack(spacing: 0) {
            ForEach(Array(appState.invites.enumerated()), id: \.element.id) { idx, invite in
                inviteRow(invite)
                if idx < appState.invites.count - 1 {
                    RowSeparator(density: .comfortable)
                }
            }
        }
        .background(AppTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .padding(.horizontal, 16)
    }

    @ViewBuilder
    private func inviteRow(_ invite: PendingInvite) -> some View {
        let status = invite.status()
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                statusText(status)
                    .font(.lato(size: 15, weight: .medium))
                    .foregroundStyle(AppTheme.text)
                if status == .pending {
                    expiryText(invite)
                        .font(.lato(size: 13))
                        .foregroundStyle(AppTheme.text.opacity(0.36))
                }
            }
            Spacer()
            if status == .pending {
                Button {
                    confirmRevoke = invite
                } label: {
                    Text("Revoke")
                        .font(.lato(size: 14, weight: .medium))
                        .foregroundStyle(AppTheme.text.opacity(0.58))
                        // ≥44pt touch target.
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .frame(minHeight: 56)
    }

    private func statusText(_ status: InviteCodec.Status) -> Text {
        switch status {
        case .pending:  return Text("Pending")
        case .redeemed: return Text("Redeemed")
        case .expired:  return Text("Expired")
        }
    }

    private func expiryText(_ invite: PendingInvite) -> Text {
        // Same day math as web InviteCard: ceil of the remaining interval.
        let days = Int(ceil(invite.expiresAt.timeIntervalSinceNow / 86_400))
        if days <= 1 { return Text("Expires today") }
        return Text("Expires in \(days) days")
    }
}

#Preview("Invite · Light") {
    Color.gray.opacity(0.2)
        .ignoresSafeArea()
        .sheet(isPresented: .constant(true)) {
            InviteSheet()
                .environment(AppState())
                .presentationBackground(AppTheme.bg)
        }
}
