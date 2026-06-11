import SwiftUI

/// One horizontal bar per household member, length proportional to that
/// user's expense share over the selected `DashboardRange`. Tap a row to
/// expand and see the individual transactions making up that share —
/// joint expenses show a percentage badge and the user's split-weighted
/// share amount, not the full transaction amount.
struct PerOwnerBreakdownCard: View {
    let range: DashboardRange
    @Environment(AppState.self) private var appState

    /// At most one row expanded at a time (accordion behavior).
    @State private var expandedUserID: User.ID?

    /// Cap on transaction rows shown when a section is expanded — the
    /// remainder collapses into a "+N more" caption.
    private let maxRowsWhenExpanded = 25

    private var entries: [Entry] {
        let interval = range.interval()
        return appState.householdMembers.map {
            Entry(user: $0, cents: appState.spent(by: $0.id, in: interval))
        }
        .sorted { $0.cents > $1.cents }
    }

    private var maxCents: Int64 {
        max(1, entries.map(\.cents).max() ?? 1)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Per owner")
                    .font(.lato(size: 13, weight: .semibold))
                    .kerning(0.6)
                    .textCase(.uppercase)
                    .foregroundStyle(AppTheme.text.opacity(0.58))
                Spacer()
                Text(range.longLabel)
                    .font(.lato(size: 12))
                    .foregroundStyle(AppTheme.text3)
            }

            if entries.isEmpty {
                Text("No household members yet.")
                    .font(.lato(size: 13))
                    .foregroundStyle(AppTheme.text3)
                    .padding(.vertical, 8)
            } else {
                VStack(spacing: 14) {
                    ForEach(entries) { entry in
                        ownerSection(for: entry)
                    }
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .animation(.easeOut(duration: 0.22), value: expandedUserID)
    }

    // MARK: - Owner section (header row + optional expansion)

    @ViewBuilder
    private func ownerSection(for entry: Entry) -> some View {
        let isExpanded = expandedUserID == entry.user.id

        VStack(alignment: .leading, spacing: 8) {
            Button {
                expandedUserID = isExpanded ? nil : entry.user.id
            } label: {
                ownerHeader(for: entry, isExpanded: isExpanded)
            }
            .buttonStyle(.plain)

            if isExpanded {
                expandedTransactions(for: entry.user)
            }
        }
    }

    private func ownerHeader(for entry: Entry, isExpanded: Bool) -> some View {
        let palette = entry.user.palette
        let fraction = CGFloat(Double(entry.cents) / Double(maxCents))
        return VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Text(entry.user.name)
                    .font(.lato(size: 15, weight: .medium))
                    .foregroundStyle(AppTheme.text)
                if entry.user.id == appState.currentUserID {
                    Text("(you)")
                        .font(.lato(size: 12))
                        .foregroundStyle(AppTheme.text3)
                }
                Spacer()
                Text(appState.formatMoney(entry.cents))
                    .font(.lato(size: 15, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(AppTheme.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Image(systemName: "chevron.down")
                    .font(.lato(size: 11, weight: .semibold))
                    .foregroundStyle(AppTheme.text3)
                    .rotationEffect(.degrees(isExpanded ? 180 : 0))
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(AppTheme.text.opacity(0.05))
                    Capsule().fill(palette.bg)
                        .frame(width: max(8, geo.size.width * fraction))
                }
            }
            .frame(height: 8)
        }
        .contentShape(Rectangle())
    }

    // MARK: - Expanded transactions

    @ViewBuilder
    private func expandedTransactions(for user: User) -> some View {
        let allShares = appState.expenseShares(by: user.id, in: range.interval())
        let displayed = Array(allShares.prefix(maxRowsWhenExpanded))
        let remaining = max(0, allShares.count - displayed.count)

        VStack(spacing: 0) {
            if allShares.isEmpty {
                Text("No expenses in this period.")
                    .font(.lato(size: 13))
                    .foregroundStyle(AppTheme.text3)
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                ForEach(Array(displayed.enumerated()), id: \.offset) { idx, item in
                    transactionRow(item.transaction,
                                   share: item.shareCents,
                                   for: user.id)
                    if idx < displayed.count - 1 {
                        Rectangle()
                            .fill(AppTheme.hairline)
                            .frame(height: 0.5)
                    }
                }
                if remaining > 0 {
                    Text("+\(remaining) more")
                        .font(.lato(size: 12))
                        .foregroundStyle(AppTheme.text3)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.top, 10)
                }
            }
        }
        .padding(.leading, 4)
    }

    private func transactionRow(_ tx: Transaction,
                                share: Int64,
                                for userID: User.ID) -> some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(tx.merchant)
                        .font(.lato(size: 14, weight: .medium))
                        .foregroundStyle(AppTheme.text)
                        .lineLimit(1)
                    if tx.ownerIDs.count > 1 {
                        let pct = tx.effectiveSplits[userID] ?? 0
                        Text(percentLabel(pct))
                            .font(.lato(size: 10, weight: .semibold))
                            .foregroundStyle(AppTheme.text.opacity(0.7))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 1)
                            .background(Capsule().fill(AppTheme.text.opacity(0.06)))
                    }
                }
                Text(shortDate(tx.date))
                    .font(.lato(size: 11))
                    .foregroundStyle(AppTheme.text3)
            }
            Spacer()
            Text(appState.formatMoney(share))
                .font(.lato(size: 14, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(AppTheme.text)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .padding(.vertical, 8)
    }

    // MARK: - Helpers

    private func percentLabel(_ d: Decimal) -> String {
        let v = NSDecimalNumber(decimal: d).doubleValue
        if v.rounded() == v { return "\(Int(v))%" }
        return String(format: "%.1f%%", v)
    }

    private func shortDate(_ d: Date) -> String {
        DateFormatter.localized(pattern: "MMM d", locale: Localizer.currentLocale).string(from: d)
    }
}

// MARK: - Entry

private struct Entry: Identifiable {
    let user: User
    let cents: Int64
    var id: User.ID { user.id }
}
