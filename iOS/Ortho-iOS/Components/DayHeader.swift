import SwiftUI

/// Sticky section header — uppercase day label, subtle date, muted outgoing
/// total for the day.
struct DayHeader: View {
    let group: TransactionGroup

    @Environment(AppState.self) private var appState

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            HStack(spacing: 8) {
                Text(group.dayLabel.uppercased())
                    .font(.lato(size: 13, weight: .semibold))
                    .kerning(0.6)
                    .foregroundStyle(AppTheme.text2)
                Text(group.dateLabel)
                    .font(.lato(size: 12))
                    .foregroundStyle(AppTheme.text3)
            }
            Spacer()
            Text(appState.formatMoney(group.outgoingTotal))
                .font(.lato(size: 12))
                .monospacedDigit()
                .foregroundStyle(AppTheme.text3)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .padding(.horizontal, 24)
        .padding(.top, 14)
        .padding(.bottom, 6)
        // Force the bg to fill the full section-header row width. Without
        // the explicit `frame(maxWidth: .infinity)`, the HStack only sizes
        // to its content width inside List's section-header container, and
        // the rest of the row stays transparent — making scrolling list
        // rows visible through the gap when the header pins under the
        // translucent nav blur.
        .frame(maxWidth: .infinity)
        .background(AppTheme.bg)
    }
}
