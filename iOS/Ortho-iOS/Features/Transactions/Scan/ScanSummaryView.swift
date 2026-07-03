// Wizard summary: what happened, one Done (spec 014 FR-010,
// contracts/scan-ui-flow.md §Summary). Reached from the last row or Stop;
// rows already added stay — they were real optimistic adds.

import SwiftUI

struct ScanSummaryView: View {
    let session: ScanSession
    let onDone: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 12) {
                Image(systemName: "checkmark.circle")
                    .font(.lato(size: 40))
                    .foregroundStyle(AppTheme.text.opacity(0.36))

                VStack(spacing: 6) {
                    // Zero-count segments are omitted (contract §Summary).
                    if session.addedCount > 0 {
                        Text("\(session.addedCount) added")
                            .font(.lato(size: 22))
                            .foregroundStyle(AppTheme.text)
                    }
                    if session.skippedCount > 0 {
                        Text("\(session.skippedCount) skipped")
                            .font(.lato(size: 15))
                            .foregroundStyle(AppTheme.text.opacity(0.58))
                    }
                    if session.leftOutDuplicateCount > 0 {
                        Text("\(session.leftOutDuplicateCount) duplicates left out")
                            .font(.lato(size: 15))
                            .foregroundStyle(AppTheme.text.opacity(0.58))
                    }
                    if session.addedCount == 0 && session.skippedCount == 0
                        && session.leftOutDuplicateCount == 0 {
                        Text("Nothing was added")
                            .font(.lato(size: 15))
                            .foregroundStyle(AppTheme.text.opacity(0.58))
                    }
                }
            }

            Spacer()

            Button {
                onDone()
            } label: {
                Text("Done")
                    .font(.lato(size: 15, weight: .semibold))
                    .foregroundStyle(AppTheme.accent)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 10)
                    .background(Capsule().fill(AppTheme.text.opacity(0.05)))
            }
            .buttonStyle(.plain)
            .padding(.bottom, 40)
        }
        .frame(maxWidth: .infinity)
        .background(AppTheme.bg)
    }
}
