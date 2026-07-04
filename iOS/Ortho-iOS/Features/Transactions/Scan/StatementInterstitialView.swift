// Statement interstitial: what was found, what will be pre-skipped, and one
// Start review action — nothing saves here (spec 014 FR-007,
// contracts/scan-ui-flow.md §Interstitial). Rendered by AddTransactionSheet
// in place of the form body while the session is in .interstitial.

import SwiftUI

struct StatementInterstitialView: View {
    @Bindable var session: ScanSession
    let onCancel: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header

            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("\(session.rowCount) rows found")
                        .font(.lato(size: 22))
                        .foregroundStyle(AppTheme.text)
                    if session.duplicateCount > 0 {
                        Text("\(session.duplicateCount) look like duplicates")
                            .font(.lato(size: 15))
                            .foregroundStyle(AppTheme.text.opacity(0.58))
                    }
                    if session.paymentCount > 0 {
                        Text("\(session.paymentCount) card payments will be skipped")
                            .font(.lato(size: 15))
                            .foregroundStyle(AppTheme.text.opacity(0.58))
                    }
                }
                .padding(.horizontal, 24)

                if session.duplicateCount > 0 {
                    skipDuplicatesToggle
                }

                Text("Each row opens prefilled for review. Nothing is added until you confirm it.")
                    .font(.lato(size: 13))
                    .foregroundStyle(AppTheme.text.opacity(0.36))
                    .lineSpacing(2)
                    .padding(.horizontal, 24)
                    .frame(maxWidth: 360, alignment: .leading)

                startButton
            }
            .padding(.top, 24)

            Spacer()
        }
        .background(AppTheme.bg)
    }

    private var header: some View {
        ZStack {
            Text("Review statement")
                .font(.lato(size: 17, weight: .semibold))
                .foregroundStyle(AppTheme.text)
                .tracking(-0.3)
            HStack {
                Button("Cancel", action: onCancel)
                    .font(.lato(size: 17, weight: .medium))
                    .foregroundStyle(AppTheme.accent)
                    .buttonStyle(.plain)
                Spacer()
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 8)
    }

    private var skipDuplicatesToggle: some View {
        HStack(spacing: 12) {
            Text("Skip duplicates")
                .font(.lato(size: 17, weight: .medium))
                .tracking(-0.2)
                .foregroundStyle(AppTheme.text)
            Spacer()
            Toggle("", isOn: $session.skipDuplicates)
                .labelsHidden()
                .tint(AppTheme.accent)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 52)
        .background(AppTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .padding(.horizontal, 16)
    }

    private var startButton: some View {
        HStack {
            Spacer()
            Button {
                session.startReview()
            } label: {
                Text("Start review")
                    .font(.lato(size: 15, weight: .semibold))
                    .foregroundStyle(AppTheme.accent)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
                    .background(Capsule().fill(AppTheme.text.opacity(0.05)))
            }
            .buttonStyle(.plain)
            Spacer()
        }
    }
}
