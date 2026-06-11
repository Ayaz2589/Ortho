import SwiftUI

/// Picker that lets the user pre-fill `AddTransactionSheet` from one of
/// their recent transactions. Built on a native SwiftUI `List` so vertical
/// scroll and row taps don't fight each other.
struct CopyTransactionPickerSheet: View {
    let onPick: (Transaction) -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    /// Up to 40 most-recent transactions, grouped by day. 40 is a soft cap
    /// — the picker is a quick-pick affordance, not a search surface.
    private var recentGroups: [TransactionGroup] {
        let recent = appState.transactions
            .sorted { $0.date > $1.date }
            .prefix(40)
        return TransactionGroup.group(Array(recent))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            sheetNav

            if appState.transactions.isEmpty {
                emptyState
            } else {
                recentList
            }
        }
        .background(AppTheme.bg)
    }

    // MARK: - Nav

    private var sheetNav: some View {
        ZStack {
            Text("Copy from recent")
                .font(.lato(size: 17, weight: .semibold))
                .foregroundStyle(AppTheme.text)
                .tracking(-0.3)

            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                    .font(.lato(size: 17, weight: .medium))
                    .foregroundStyle(AppTheme.accent)
                    .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 12)
    }

    // MARK: - Recent list

    private var recentList: some View {
        List {
            ForEach(recentGroups) { group in
                Section {
                    rows(in: group)
                } header: {
                    DayHeader(group: group)
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(AppTheme.bg)
        .listSectionSpacing(8)
        .contentMargins(.bottom, 24, for: .scrollContent)
        .environment(\.defaultMinListRowHeight, 0)
    }

    @ViewBuilder
    private func rows(in group: TransactionGroup) -> some View {
        ForEach(Array(group.items.enumerated()), id: \.element.id) { idx, tx in
            let position = rowPosition(idx: idx, count: group.items.count)
            let isLast = idx == group.items.count - 1
            VStack(spacing: 0) {
                TransactionRow(
                    tx: tx,
                    display: appState.ownersDisplay(of: tx),
                    density: .comfortable
                )
                if !isLast {
                    RowSeparator(density: .comfortable)
                }
            }
            .contentShape(Rectangle())
            .listRowBackground(
                rowCardBackground(position: position)
                    .padding(.horizontal, 16)
            )
            .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
            .listRowSeparator(.hidden)
            .onTapGesture {
                onPick(tx)
                dismiss()
            }
        }
    }

    // MARK: - Group-card chrome

    private enum RowPosition { case single, first, middle, last }

    private func rowPosition(idx: Int, count: Int) -> RowPosition {
        if count == 1 { return .single }
        if idx == 0 { return .first }
        if idx == count - 1 { return .last }
        return .middle
    }

    private func cornerRadii(for position: RowPosition) -> RectangleCornerRadii {
        let r: CGFloat = 14
        switch position {
        case .single:
            return .init(topLeading: r, bottomLeading: r, bottomTrailing: r, topTrailing: r)
        case .first:
            return .init(topLeading: r, bottomLeading: 0, bottomTrailing: 0, topTrailing: r)
        case .last:
            return .init(topLeading: 0, bottomLeading: r, bottomTrailing: r, topTrailing: 0)
        case .middle:
            return .init(topLeading: 0, bottomLeading: 0, bottomTrailing: 0, topTrailing: 0)
        }
    }

    private func rowCardBackground(position: RowPosition) -> some View {
        UnevenRoundedRectangle(cornerRadii: cornerRadii(for: position), style: .continuous)
            .fill(AppTheme.surface)
    }

    // MARK: - Empty state

    private var emptyState: some View {
        VStack(alignment: .center, spacing: 14) {
            Image(systemName: "doc.on.doc")
                .font(.lato(size: 40, weight: .regular))
                .foregroundStyle(AppTheme.text.opacity(0.36))
                .padding(.top, 60)
            Text("Nothing to copy yet")
                .font(.lato(size: 17, weight: .semibold))
                .foregroundStyle(AppTheme.text)
            Text("Add at least one transaction and it'll show up here for fast duplication.")
                .font(.lato(size: 14))
                .multilineTextAlignment(.center)
                .foregroundStyle(AppTheme.text.opacity(0.58))
                .padding(.horizontal, 40)
                .lineSpacing(2)
        }
        .frame(maxWidth: .infinity)
        .padding(.bottom, 60)
    }
}
