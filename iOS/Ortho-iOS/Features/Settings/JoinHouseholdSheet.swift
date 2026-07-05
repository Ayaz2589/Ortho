import SwiftUI

/// Spec 017 US2/US3 — join a household with an invite code, then claim your
/// roster identity. Reached from Settings → Household → "Join a household"
/// (iOS deliberately keeps its first-run sequence — joining is post-hoc; the
/// pre-bootstrap choice is web-only, see PARITY.md). Also presented directly
/// in `.claim` phase by the root shell when a member still needs their
/// identity claim (FR-016 re-presentation).
struct JoinHouseholdSheet: View {
    enum Phase {
        case enterCode
        case claim
    }

    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var phase: Phase
    @State private var code = ""
    @State private var busy = false
    @State private var outcome: AppState.JoinOutcome?
    @State private var claimTaken = false
    @State private var newPersonMode = false
    @State private var newName = ""
    @FocusState private var codeFocused: Bool

    init(phase: Phase = .enterCode) {
        _phase = State(initialValue: phase)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            sheetNav

            ScrollView {
                switch phase {
                case .enterCode: enterCodeBody
                case .claim: claimBody
                }
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(AppTheme.bg)
        .onAppear { if phase == .enterCode { codeFocused = true } }
    }

    private var title: LocalizedStringKey {
        phase == .enterCode ? "Join a household" : "Who are you in this household?"
    }

    private var sheetNav: some View {
        ZStack {
            Text(title)
                .font(.lato(size: 17, weight: .semibold))
                .foregroundStyle(AppTheme.text)
                .tracking(-0.3)
                .lineLimit(1)
                .padding(.horizontal, 76)
            HStack {
                // The claim phase is a required step — no cancel there; the
                // sheet completes when a person is linked (FR-016).
                if phase == .enterCode {
                    Button("Cancel") { dismiss() }
                        .font(.lato(size: 17, weight: .medium))
                        .foregroundStyle(AppTheme.accent)
                        .buttonStyle(.plain)
                }
                Spacer()
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 20)
    }

    // MARK: - Enter code

    private var enterCodeBody: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Ask your partner for an invite code.")
                .font(.lato(size: 15))
                .foregroundStyle(AppTheme.text.opacity(0.58))
                .padding(.horizontal, 24)
                .padding(.bottom, 16)

            TextField("ABCDE-23456", text: $code)
                .font(.system(size: 20, design: .monospaced))
                .tracking(2)
                .multilineTextAlignment(.center)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .focused($codeFocused)
                .submitLabel(.join)
                .onSubmit { join() }
                .padding(.vertical, 14)
                .background(AppTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .padding(.horizontal, 16)
                .padding(.bottom, 12)
                .accessibilityLabel("Invite code")

            if let failure = failureCopy {
                Text(failure)
                    .font(.lato(size: 13))
                    .foregroundStyle(AppTheme.text.opacity(0.58))
                    .padding(.horizontal, 24)
                    .padding(.bottom, 12)
            }

            Button {
                join()
            } label: {
                Text(busy ? "Joining…" : "Join")
                    .font(.lato(size: 17, weight: .semibold))
                    .foregroundStyle(canJoin ? AppTheme.bg : AppTheme.text.opacity(0.36))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(canJoin ? AnyShapeStyle(AppTheme.text) : AnyShapeStyle(AppTheme.surface))
                    )
            }
            .buttonStyle(.plain)
            .disabled(!canJoin)
            .padding(.horizontal, 16)
            .padding(.bottom, 16)

            Text("Joining a household switches this device to its shared ledger. Your own data stays put.")
                .font(.lato(size: 13))
                .foregroundStyle(AppTheme.text.opacity(0.36))
                .lineSpacing(2)
                .padding(.horizontal, 24)
                .padding(.bottom, 24)
        }
    }

    private var canJoin: Bool {
        !busy && !code.trimmingCharacters(in: .whitespaces).isEmpty
    }

    private var failureCopy: LocalizedStringKey? {
        switch outcome {
        case .invalid: return "That code is invalid, already used, or expired."
        case .alreadyMember: return "You're already a member of this household."
        case .loadFailed: return "You've joined, but loading failed. Try signing in again."
        case .joined, nil: return nil
        }
    }

    private func join() {
        guard canJoin else { return }
        busy = true
        outcome = nil
        Task {
            let result = await appState.joinHousehold(code: code)
            await MainActor.run {
                busy = false
                outcome = result
                if result == .joined {
                    if appState.needsPersonClaim {
                        phase = .claim
                    } else {
                        dismiss()
                    }
                }
            }
        }
    }

    // MARK: - Claim

    private var claimBody: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Pick your name and everything already recorded for it — splits, balances, history — becomes yours.")
                .font(.lato(size: 15))
                .foregroundStyle(AppTheme.text.opacity(0.58))
                .lineSpacing(2)
                .padding(.horizontal, 24)
                .padding(.bottom, 16)

            VStack(spacing: 0) {
                ForEach(Array(appState.claimablePeople.enumerated()), id: \.element.id) { idx, person in
                    claimRow(person)
                    if idx < appState.claimablePeople.count - 1 {
                        RowSeparator(density: .comfortable)
                    }
                }
            }
            .background(AppTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .padding(.horizontal, 16)
            .padding(.bottom, 12)

            if claimTaken {
                Text("Someone else just claimed that name. Pick another.")
                    .font(.lato(size: 13))
                    .foregroundStyle(AppTheme.text.opacity(0.58))
                    .padding(.horizontal, 24)
                    .padding(.bottom, 12)
            }

            if newPersonMode {
                TextField("Your name", text: $newName)
                    .font(.lato(size: 17, weight: .medium))
                    .tracking(-0.2)
                    .foregroundStyle(AppTheme.text)
                    .submitLabel(.done)
                    .onSubmit { claimNew() }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .background(AppTheme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)

                Button {
                    claimNew()
                } label: {
                    Text("Continue")
                        .font(.lato(size: 17, weight: .semibold))
                        .foregroundStyle(canContinueNew ? AppTheme.bg : AppTheme.text.opacity(0.36))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .fill(canContinueNew ? AnyShapeStyle(AppTheme.text) : AnyShapeStyle(AppTheme.surface))
                        )
                }
                .buttonStyle(.plain)
                .disabled(!canContinueNew)
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            } else {
                Button {
                    newPersonMode = true
                } label: {
                    Text("Continue as a new person")
                        .font(.lato(size: 15, weight: .medium))
                        .foregroundStyle(AppTheme.accent)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(busy)
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
        }
    }

    private var canContinueNew: Bool {
        !busy && !newName.trimmingCharacters(in: .whitespaces).isEmpty
    }

    private func claimRow(_ person: Person) -> some View {
        Button {
            guard !busy else { return }
            busy = true
            claimTaken = false
            Task {
                let result = await appState.claimPerson(person.id)
                await MainActor.run {
                    busy = false
                    switch result {
                    case .claimed: dismiss()
                    case .taken: claimTaken = true
                    case .failed: break // dataError alert handles it
                    }
                }
            }
        } label: {
            HStack(spacing: 12) {
                Text(person.initial)
                    .font(.lato(size: person.initial.count > 1 ? 12 : 15, weight: .semibold))
                    .foregroundStyle(person.palette.fg)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(person.palette.bg))
                Text(person.name)
                    .font(.lato(size: 17, weight: .medium))
                    .tracking(-0.2)
                    .foregroundStyle(AppTheme.text)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.lato(size: 13, weight: .semibold))
                    .foregroundStyle(AppTheme.text.opacity(0.36))
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(minHeight: 56)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(busy)
    }

    private func claimNew() {
        guard canContinueNew else { return }
        busy = true
        Task {
            let ok = await appState.claimNewPerson(name: newName)
            await MainActor.run {
                busy = false
                if ok { dismiss() }
            }
        }
    }
}

#Preview("Join · Light") {
    Color.gray.opacity(0.2)
        .ignoresSafeArea()
        .sheet(isPresented: .constant(true)) {
            JoinHouseholdSheet()
                .environment(AppState())
                .presentationBackground(AppTheme.bg)
        }
}
