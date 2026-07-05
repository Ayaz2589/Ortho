import SwiftUI
import UIKit

/// The blocking gate for lapsed users (spec 018, FR-006/007). Swapped in by
/// `Ortho_iOSApp` INSTEAD of `RootTabView` when the derived gate is
/// `.lapsed` — no tab bypasses it. Visual shape mirrors
/// `BootstrapRecoveryView` (Constitution IV: calm, short, never alarmist —
/// no red, no shadows). Prices come exclusively from the operator's Stripe
/// configuration via billing-plans (FR-011); the app never collects payment —
/// checkout opens in the external browser. Web sibling:
/// `web/components/Paywall.tsx` (same keys, same behavior).
struct PaywallView: View {
    @Environment(AppState.self) private var appState

    private enum Busy: Equatable {
        case plans
        case checkout(String)
        case check
    }

    @State private var plans: PlansDTO?
    @State private var plansFailed = false
    @State private var busy: Busy? = .plans
    @State private var notice: String?

    private var api: EntitlementsAPI {
        EntitlementsAPI(client: appState.supabase)
    }

    var body: some View {
        ZStack {
            AppTheme.bg.ignoresSafeArea()

            VStack(spacing: 16) {
                Text("ORTHO")
                    .font(.lato(size: 24, weight: .regular))
                    .tracking(7)
                    .foregroundStyle(AppTheme.text)
                    .padding(.bottom, 8)

                Text("Your free month has ended")
                    .font(.lato(size: 19, weight: .semibold))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(AppTheme.text)

                Text("Keep using Ortho with a subscription. Everything you added is safe and waiting.")
                    .font(.lato(size: 15))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(AppTheme.text2)
                    .padding(.horizontal, 32)
                    .lineSpacing(2)

                planArea
                    .padding(.top, 8)

                // Status updates (checkout failure, check-again outcome).
                // The text IS the content — no label replacement — and
                // changes are announced for VoiceOver (017 lesson).
                if let notice {
                    Text(notice)
                        .font(.lato(size: 13))
                        .multilineTextAlignment(.center)
                        .foregroundStyle(AppTheme.text2)
                        .padding(.horizontal, 32)
                        .lineSpacing(2)
                }

                Button {
                    Task { await checkAgain() }
                } label: {
                    Text(busy == .check
                         ? Localizer.tr("Checking…")
                         : Localizer.tr("I subscribed — check again"))
                        .font(.lato(size: 15, weight: .medium))
                        .foregroundStyle(AppTheme.accent)
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.plain)
                .disabled(busy != nil)
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
        .task { await loadPlans() }
        .onChange(of: notice) { _, newValue in
            // Live-region equivalent: announce async outcomes so VoiceOver
            // users hear what happened without refocusing (017 lesson).
            if let newValue {
                UIAccessibility.post(notification: .announcement, argument: newValue)
            }
        }
    }

    // MARK: - Plans

    @ViewBuilder
    private var planArea: some View {
        if let plans {
            VStack(spacing: 0) {
                planRow(labelKey: "Monthly", info: plans.monthly, planKey: "monthly")
                RowSeparator(density: .comfortable)
                planRow(labelKey: "Yearly", info: plans.yearly, planKey: "yearly")
            }
            .background(AppTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .padding(.horizontal, 40)
        } else if plansFailed {
            VStack(spacing: 8) {
                Text("Plans are unavailable right now.")
                    .font(.lato(size: 15))
                    .foregroundStyle(AppTheme.text2)
                Button {
                    Task { await loadPlans() }
                } label: {
                    Text("Try again")
                        .font(.lato(size: 15, weight: .medium))
                        .foregroundStyle(AppTheme.accent)
                        .frame(minWidth: 44, minHeight: 44)
                }
                .buttonStyle(.plain)
            }
        } else {
            Text("Loading plans…")
                .font(.lato(size: 15))
                .foregroundStyle(AppTheme.text3)
        }
    }

    private func planRow(labelKey: LocalizedStringKey, info: PlanDTO, planKey: String) -> some View {
        Button {
            Task { await choose(planKey) }
        } label: {
            HStack(spacing: 12) {
                Text(labelKey)
                    .font(.lato(size: 17, weight: .medium))
                    .tracking(-0.2)
                    .foregroundStyle(AppTheme.text)
                Spacer()
                Text(priceText(info))
                    .font(.lato(size: 17, weight: .medium))
                    .monospacedDigit()
                    .foregroundStyle(AppTheme.text2)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(minHeight: 64)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(busy != nil)
        .opacity(busy != nil ? 0.6 : 1)
    }

    /// "$X.XX a month" — the amount is exactly what Stripe will charge
    /// (deliberately NOT run through the display-currency converter; same
    /// rule as web `formatPlanAmount`).
    private func priceText(_ info: PlanDTO) -> String {
        let amount = String(format: "$%.2f", Double(info.amountCents) / 100)
        let suffix = info.interval == "year"
            ? Localizer.tr("a year")
            : Localizer.tr("a month")
        return "\(amount) \(suffix)"
    }

    // MARK: - Actions

    private func loadPlans() async {
        busy = .plans
        plansFailed = false
        do {
            plans = try await api.fetchPlans()
        } catch {
            plansFailed = true
        }
        busy = nil
    }

    private func choose(_ plan: String) async {
        busy = .checkout(plan)
        notice = nil
        do {
            let url = try await api.createCheckout(plan: plan)
            // External browser — the app NEVER collects payment (FR-012).
            UIApplication.shared.open(url)
            busy = nil
        } catch {
            busy = nil
            notice = Localizer.tr("Could not open checkout. Try again.")
        }
    }

    private func checkAgain() async {
        busy = .check
        notice = nil
        await appState.refreshEntitlement()
        busy = nil
        // If the row flipped, the app root swaps us out; if we're still
        // lapsed, say so calmly.
        if EntitlementLogic.shouldShowPaywall(gate: appState.gateState) {
            notice = Localizer.tr("No subscription found yet. It can take a minute after paying.")
        }
    }
}

#Preview {
    PaywallView()
        .environment(AppState())
}
