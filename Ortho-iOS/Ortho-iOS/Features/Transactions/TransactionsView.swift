import SwiftUI

/// Filter pill above the transactions list. Composes (AND) with the
/// merchant search filter.
enum TransactionScopeFilter: String, CaseIterable, Hashable, Identifiable {
    case all, shared, personal
    var id: String { rawValue }
    var label: LocalizedStringResource {
        switch self {
        case .all:      "All"
        case .shared:   "Shared"
        case .personal: "Personal"
        }
    }
}

/// Day-grouped transactions list — the Transactions tab. Built on a native
/// SwiftUI `List` so vertical scroll and `.swipeActions` are arbitrated by
/// UIKit. The custom `ScrollView + LazyVStack + SwipeActionRow` stack this
/// replaced suffered a recurring bug where a `DragGesture` attached inside
/// the ScrollView would claim touches on row content and block vertical
/// scroll. Native List delegates to UIKit's swipe-action pan recognizer,
/// which only claims horizontal-dominant initial movement, so vertical
/// scroll on a row works correctly.
struct TransactionsView: View {
    var density: Density = .comfortable

    @Environment(AppState.self) private var appState
    @Environment(\.colorScheme) private var colorScheme
    @State private var query: String = ""
    @State private var scopeFilter: TransactionScopeFilter = .all
    @State private var addSheetMode: AddSheetMode?
    @State private var selectedTransaction: Transaction?
    /// Tap the search icon in the title row to reveal the search field.
    /// When false, the field + scope-filter pills are hidden to give the
    /// transactions list more vertical real estate. Closing also clears
    /// the active query so the user returns to the full list.
    @State private var searchActive: Bool = false

    /// Drives the AddTransactionSheet via a single `.sheet(item:)` modifier.
    /// `.fresh` opens a blank form (the "+" button in the title); `.copying`
    /// opens a form pre-filled from an existing transaction (the swipe-copy
    /// action). Using one binding for both entry points keeps the sheet
    /// presentation single-source-of-truth.
    enum AddSheetMode: Identifiable {
        case fresh
        case copying(Transaction)
        var id: String {
            switch self {
            case .fresh: return "fresh"
            case .copying(let tx): return "copy-\(tx.id.uuidString)"
            }
        }
    }

    /// Lazily filters each group's items by both the scope filter and the
    /// merchant search. Drops empty groups so headers never appear orphaned.
    private var filteredGroups: [TransactionGroup] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        let groups = appState.groups
        return groups.compactMap { g in
            let hits = g.items.filter { tx in
                guard inScope(tx) else { return false }
                guard !q.isEmpty else { return true }
                return matches(tx, query: q)
            }
            return hits.isEmpty ? nil : TransactionGroup(day: g.day, items: hits)
        }
    }

    private func inScope(_ tx: Transaction) -> Bool {
        let householdID = appState.currentHouseholdID
        let isShared = tx.householdID != nil && tx.householdID == householdID
        // A transaction is "personal" when it isn't tied to any
        // household — regardless of how many co-owners (including
        // local users) it has. The previous check required
        // `ownerIDs == [myID]` exactly, which silently hid any
        // personal transaction that included a local user.
        let isMine = tx.householdID == nil
        switch scopeFilter {
        case .all:      return isShared || isMine
        case .shared:   return isShared
        case .personal: return isMine
        }
    }

    private func matches(_ tx: Transaction, query q: String) -> Bool {
        if tx.merchant.lowercased().contains(q) { return true }
        if tx.source.lowercased().contains(q) { return true }
        if tx.category.rawValue.lowercased().contains(q) { return true }
        for owner in appState.resolveOwners(of: tx) {
            if owner.name.lowercased().contains(q) { return true }
        }
        return false
    }

    private var hasAnyTransactions: Bool {
        !appState.transactions.isEmpty
    }

    /// Three-way render state. `loading` only fires when we have nothing
    /// yet AND the initial bootstrap is still in flight — prevents the
    /// misleading empty state from flashing during sign-in.
    private enum LoadState { case loading, empty, populated }
    private var loadState: LoadState {
        if hasAnyTransactions { return .populated }
        return appState.isLoadingInitialData ? .loading : .empty
    }

    var body: some View {
        Group {
            switch loadState {
            case .populated: populatedList
            case .loading:   TransactionSkeletonList()
            case .empty:     emptyState
            }
        }
        .background(AppTheme.bg)
        .safeAreaInset(edge: .top, spacing: 0) { titleAndSearch }
        .sheet(item: $addSheetMode) { mode in
            let copying: Transaction? = {
                if case .copying(let tx) = mode { return tx }
                return nil
            }()
            AddTransactionSheet(copying: copying) { tx, keepOpen in
                appState.addTransaction(tx)
                if !keepOpen {
                    addSheetMode = nil
                }
            }
            .environment(appState)
            .presentationDetents([.large])
            .presentationBackground(AppTheme.bg)
        }
        .sheet(item: $selectedTransaction) { tx in
            TransactionDetailSheet(txID: tx.id)
                .environment(appState)
                .presentationDetents([.large])
                .presentationBackground(AppTheme.bg)
        }
    }

    // MARK: - Populated list

    private var populatedList: some View {
        List {
            ForEach(filteredGroups) { group in
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
        .contentMargins(.bottom, 60, for: .scrollContent)
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
                    density: density
                )
                if !isLast {
                    RowSeparator(density: density)
                }
            }
            .contentShape(Rectangle())
            .listRowBackground(
                rowCardBackground(position: position)
                    .padding(.horizontal, 16)
            )
            .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
            .listRowSeparator(.hidden)
            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                Button(role: .destructive) {
                    withAnimation(.easeOut(duration: 0.2)) {
                        appState.deleteTransaction(tx)
                    }
                } label: {
                    Label("Delete", systemImage: "trash")
                }
                .labelStyle(.iconOnly)
                Button {
                    addSheetMode = .copying(tx)
                } label: {
                    Label("Copy", systemImage: "doc.on.doc")
                }
                .labelStyle(.iconOnly)
                .tint(AppTheme.accent)
            }
            .onTapGesture { selectedTransaction = tx }
        }
    }

    // MARK: - Group-card chrome

    /// A row's position within its day section. Drives which corners of the
    /// `AppTheme.surface` background get rounded so each section reads as
    /// one continuous rounded card.
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

    // MARK: - Title + tap-to-reveal search (top-anchored)

    private var titleAndSearch: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text("Transactions")
                    .font(.lato(size: 32, weight: .bold))
                    .tracking(-0.6)
                    .foregroundStyle(AppTheme.text)
                Spacer()
                if hasAnyTransactions {
                    searchButton
                }
                addButton
            }
            .padding(.horizontal, 20)
            .padding(.top, 4)
            .padding(.bottom, hasAnyTransactions && searchActive ? 6 : 8)

            if hasAnyTransactions && searchActive {
                SearchField(
                    text: $query,
                    placeholder: "Search transactions",
                    autofocusOnAppear: true,
                    onCancel: {
                        // Cancel inside the field collapses the whole
                        // search panel — single Cancel exits the mode.
                        query = ""
                        searchActive = false
                    }
                )
                    .padding(.vertical, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))

                scopeFilterPill
                    .padding(.horizontal, 16)
                    .padding(.bottom, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .background(colorScheme == .dark
                    ? AnyShapeStyle(AppTheme.bg)
                    : AnyShapeStyle(.regularMaterial))
        .animation(.easeOut(duration: 0.22), value: searchActive)
    }

    /// Circular search button next to the "+". Tap to reveal the field
    /// + scope pills; the field auto-focuses on appear (keyboard rises).
    /// Tap again (icon flips to X) to close + clear.
    private var searchButton: some View {
        Button {
            if searchActive {
                query = ""
                searchActive = false
            } else {
                searchActive = true
            }
        } label: {
            ZStack {
                Circle().fill(AppTheme.text.opacity(0.05))
                    .frame(width: 36, height: 36)
                Image(systemName: searchActive ? "xmark" : "magnifyingglass")
                    .font(.lato(size: 15, weight: .semibold))
                    .foregroundStyle(AppTheme.accent)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(searchActive ? "Close search" : "Search transactions")
    }

    // MARK: - Empty state

    private var emptyState: some View {
        VStack(alignment: .center, spacing: 14) {
            Image(systemName: "arrow.up.arrow.down")
                .font(.lato(size: 40, weight: .regular))
                .foregroundStyle(AppTheme.text.opacity(0.36))
                .padding(.top, 60)
            Text("No transactions yet")
                .font(.lato(size: 17, weight: .semibold))
                .foregroundStyle(AppTheme.text)
            Text("Log an expense or income to see it grouped by day here.")
                .font(.lato(size: 14))
                .multilineTextAlignment(.center)
                .foregroundStyle(AppTheme.text.opacity(0.58))
                .padding(.horizontal, 40)
                .lineSpacing(2)
            Button {
                addSheetMode = .fresh
            } label: {
                Text("Add transaction")
                    .font(.lato(size: 15, weight: .semibold))
                    .foregroundStyle(AppTheme.accent)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
                    .background(
                        Capsule().fill(AppTheme.text.opacity(0.05))
                    )
            }
            .buttonStyle(.plain)
            .padding(.top, 4)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    /// All | Shared | Personal segmented pill above the transactions list.
    private var scopeFilterPill: some View {
        HStack(spacing: 4) {
            ForEach(TransactionScopeFilter.allCases) { f in
                Button {
                    scopeFilter = f
                } label: {
                    Text(f.label)
                        .font(.lato(size: 13, weight: .semibold))
                        .tracking(-0.1)
                        .foregroundStyle(scopeFilter == f ? AppTheme.text : AppTheme.text.opacity(0.58))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                        .background(
                            RoundedRectangle(cornerRadius: 7, style: .continuous)
                                .fill(scopeFilter == f ? AppTheme.surface : .clear)
                                .shadow(color: scopeFilter == f ? .black.opacity(0.06) : .clear,
                                        radius: 2, y: 1)
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(AppTheme.text.opacity(0.05))
        )
        .animation(.easeOut(duration: 0.15), value: scopeFilter)
    }

    /// Circular "+" button next to the Transactions title.
    private var addButton: some View {
        Button { addSheetMode = .fresh } label: {
            ZStack {
                Circle().fill(AppTheme.text.opacity(0.05))
                    .frame(width: 36, height: 36)
                Image(systemName: "plus")
                    .font(.lato(size: 16, weight: .semibold))
                    .foregroundStyle(AppTheme.accent)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Add transaction")
    }
}

#Preview("Light · Comfortable") {
    TransactionsView()
        .environment(AppState())
        .preferredColorScheme(.light)
}

#Preview("Dark · Comfortable") {
    TransactionsView()
        .environment(AppState())
        .preferredColorScheme(.dark)
}

#Preview("Light · Compact") {
    TransactionsView(density: .compact)
        .environment(AppState())
        .preferredColorScheme(.light)
}
