import SwiftUI
import UIKit

/// Settings › Subscription (spec 018, US7 + manage + grace notice). One row
/// that always answers "what's my subscription situation?", with the matching
/// action. Never a takeover, never red (FR-025/026). Mirrors web
/// `components/settings/SubscriptionSection.tsx` — same states, same keys.
/// Renders nothing while `entitlement` is nil (seeded/-uiDemo and test-data
/// sessions never load a row, so the section simply doesn't appear there —
/// matching web's `if (!entitlement || !gateState) return null`).
struct SubscriptionSectionView: View {
    @Environment(AppState.self) private var appState

    @State private var busy = false
    @State private var notice: String?
    @State private var choosing = false
    @State private var plans: PlansDTO?

    private var api: EntitlementsAPI {
        EntitlementsAPI(client: appState.supabase)
    }

    private enum Action {
        case subscribe
        case manage
    }

    var body: some View {
        if let entitlement = appState.entitlement, let gate = appState.gateState {
            let status = statusLine(entitlement: entitlement, gate: gate)

            Group {
                Text("Subscription")
                    .font(.lato(size: 13, weight: .semibold))
                    .kerning(0.6)
                    .textCase(.uppercase)
                    .foregroundStyle(AppTheme.text.opacity(0.58))
                    .padding(.horizontal, 24)
                    .padding(.bottom, 8)

                VStack(spacing: 0) {
                    HStack(spacing: 14) {
                        Circle()
                            .fill(AppTheme.text.opacity(0.05))
                            .frame(width: 40, height: 40)
                            .overlay(
                                Image(systemName: "creditcard")
                                    .font(.system(size: 16))
                                    .foregroundStyle(AppTheme.text2)
                            )
                        Text(status.text)
                            .font(.lato(size: 15))
                            .foregroundStyle(AppTheme.text)
                            .lineSpacing(2)
                        Spacer(minLength: 8)
                        actionButton(status.action)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .frame(minHeight: 64)

                    if choosing, let plans {
                        RowSeparator(density: .comfortable)
                        planRow(labelKey: "Monthly", info: plans.monthly, planKey: "monthly")
                        RowSeparator(density: .comfortable)
                        planRow(labelKey: "Yearly", info: plans.yearly, planKey: "yearly")
                    }
                }
                .background(AppTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .padding(.horizontal, 16)
                .padding(.bottom, notice == nil ? 24 : 8)
                // Refresh on appear so Settings reflects a checkout finished
                // moments ago (review 018 [17]); refetch-only, never a
                // mutation (FR-017). Attached to the card — a SINGLE view —
                // as is `.onChange` below: a modifier on the enclosing
                // `Group` replays once per group member (review 018 [16]).
                .task { await appState.refreshEntitlement() }
                .onChange(of: notice) { _, newValue in
                    // Async outcomes are content, not decoration — shown AND
                    // announced exactly once (017 VoiceOver lesson).
                    if let newValue {
                        UIAccessibility.post(notification: .announcement, argument: newValue)
                    }
                }

                if let notice {
                    Text(notice)
                        .font(.lato(size: 13))
                        .foregroundStyle(AppTheme.text.opacity(0.58))
                        .lineSpacing(2)
                        .padding(.horizontal, 24)
                        .padding(.bottom, 24)
                }
            }
        }
    }

    // MARK: - Status

    private func statusLine(entitlement: EntitlementDTO, gate: GateState) -> (text: String, action: Action?) {
        if entitlement.status == .admin {
            return (Localizer.tr("This account doesn’t need a subscription."), nil)
        }
        switch gate {
        case .trialing:
            let days = EntitlementLogic.daysRemaining(
                accessExpiresAt: EntitlementLogic.parseTimestamp(entitlement.accessExpiresAt),
                now: Date()
            )
            // Explicit singular key — mirrors web's `days === 1` branch
            // (review 018 [19]/[20]); both catalogs carry both keys.
            let line = days == 1
                ? Localizer.tr("Free month — 1 day left")
                : Localizer.tr("Free month — \(days) days left")
            return (line, .subscribe)
        case .grace:
            return (Localizer.tr("There’s a billing issue. Your access continues while it gets sorted out."), .manage)
        case .active:
            if entitlement.status == .canceled {
                return (Localizer.tr("Subscription ends \(fmtDate(entitlement.accessExpiresAt))"), .manage)
            }
            let planName = entitlement.plan == "yearly"
                ? Localizer.tr("Yearly plan")
                : Localizer.tr("Monthly plan")
            return (planName + " — " + Localizer.tr("renews \(fmtDate(entitlement.accessExpiresAt))"), .manage)
        default:
            return (Localizer.tr("No active subscription."), .subscribe)
        }
    }

    /// Medium date in the in-app language (web: `Intl.DateTimeFormat`
    /// `dateStyle: 'medium'`). Imperative formatter → `Localizer.currentLocale`.
    private func fmtDate(_ iso: String?) -> String {
        guard let date = EntitlementLogic.parseTimestamp(iso) else { return "" }
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .none
        f.locale = Localizer.currentLocale
        return f.string(from: date)
    }

    // MARK: - Rows

    @ViewBuilder
    private func actionButton(_ action: Action?) -> some View {
        switch action {
        case .manage:
            Button {
                Task { await manage() }
            } label: {
                Text("Manage")
                    .font(.lato(size: 15, weight: .medium))
                    .foregroundStyle(AppTheme.accent)
                    .frame(minWidth: 44, minHeight: 44)
            }
            .buttonStyle(.plain)
            .disabled(busy)
            .opacity(busy ? 0.6 : 1)
        case .subscribe:
            if !choosing {
                Button {
                    Task { await beginChoosing() }
                } label: {
                    Text("Subscribe")
                        .font(.lato(size: 15, weight: .medium))
                        .foregroundStyle(AppTheme.accent)
                        .frame(minWidth: 44, minHeight: 44)
                }
                .buttonStyle(.plain)
                .disabled(busy)
                .opacity(busy ? 0.6 : 1)
            }
        case nil:
            EmptyView()
        }
    }

    private func planRow(labelKey: LocalizedStringKey, info: PlanDTO, planKey: String) -> some View {
        Button {
            Task { await choose(planKey) }
        } label: {
            HStack(spacing: 12) {
                Text(labelKey)
                    .font(.lato(size: 15))
                    .foregroundStyle(AppTheme.text)
                Spacer()
                Text(priceText(info))
                    .font(.lato(size: 15))
                    .monospacedDigit()
                    .foregroundStyle(AppTheme.text2)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(busy)
        .opacity(busy ? 0.6 : 1)
    }

    /// "$X.XX a month" — exactly what Stripe will charge; never converted
    /// to the display currency (same rule as web `formatPlanAmount`).
    private func priceText(_ info: PlanDTO) -> String {
        let amount = String(format: "$%.2f", Double(info.amountCents) / 100)
        let suffix = info.interval == "year"
            ? Localizer.tr("a year")
            : Localizer.tr("a month")
        return "\(amount) \(suffix)"
    }

    // MARK: - Actions

    private func manage() async {
        busy = true
        notice = nil
        do {
            let url = try await api.createPortal()
            _ = await UIApplication.shared.open(url)
        } catch {
            notice = Localizer.tr("Could not open billing. Try again.")
        }
        busy = false
    }

    private func beginChoosing() async {
        notice = nil
        do {
            plans = try await api.fetchPlans()
            choosing = true
        } catch {
            notice = Localizer.tr("Plans are unavailable right now.")
        }
    }

    private func choose(_ plan: String) async {
        busy = true
        notice = nil
        do {
            let url = try await api.createCheckout(plan: plan)
            // External browser — payment happens on Stripe's hosted page.
            _ = await UIApplication.shared.open(url)
        } catch {
            notice = Localizer.tr("Could not open checkout. Try again.")
        }
        busy = false
    }
}
