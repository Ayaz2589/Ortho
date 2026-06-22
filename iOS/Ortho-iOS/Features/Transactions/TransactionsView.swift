import SwiftUI

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
    /// The full filter state (scope + search + category/kind/source/owner/date),
    /// applied by the shared, vector-locked `filterTransactions`.
    @State private var criteria = FilterCriteria()
    @State private var filterSheetPresented = false
    @State private var addSheetMode: AddSheetMode?
    @State private var selectedTransaction: Transaction?
    /// Drives the Settle-up transfer form, pre-filled with the owed amount.
    @State private var settleUpPrefill: AddTransactionSheet.SettleUpPrefill?
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

    /// Applies the shared `filterTransactions` to each day group, dropping empty
    /// groups so headers never appear orphaned. The predicate is identical to
    /// web's (golden-vector-locked), so the two clients filter in lockstep.
    private var filteredGroups: [TransactionGroup] {
        let ctx = filterContext
        return appState.groups.compactMap { g in
            let hits = filterTransactions(g.items, criteria, ctx)
            return hits.isEmpty ? nil : TransactionGroup(day: g.day, items: hits)
        }
    }

    /// Household + owner-name context for search-by-owner and scope.
    private var filterContext: FilterContext {
        var names: [User.ID: String] = [:]
        for tx in appState.transactions {
            for id in tx.ownerIDs where names[id] == nil { names[id] = appState.user(id).name }
        }
        return FilterContext(ownerNames: names)
    }

    private var activeFilterCount_: Int { activeFilterCount(criteria) }

    // MARK: - Derived filter option lists (from the loaded transactions)

    /// Distinct owners present across transactions, resolved + name-sorted.
    private var ownerOptions: [User] {
        var seen = Set<User.ID>()
        var ids: [User.ID] = []
        for tx in appState.transactions {
            for id in tx.ownerIDs where !seen.contains(id) { seen.insert(id); ids.append(id) }
        }
        return ids
            .map { appState.user($0) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    private var sourceOptions: [String] { availableSources(appState.transactions) }

    /// Distinct months present, newest first, as UTC "YYYY-MM" keys + labels.
    private var monthOptions: [FilterMonthOption] {
        var seen = Set<String>()
        var keys: [String] = []
        for tx in appState.transactions {
            let k = FilterSheet.monthKey(tx.date)
            if !seen.contains(k) { seen.insert(k); keys.append(k) }
        }
        return keys.sorted(by: >).map { FilterMonthOption(key: $0, label: FilterSheet.monthLabel($0)) }
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
            case .populated: filteredGroups.isEmpty ? AnyView(noMatchesState) : AnyView(populatedList)
            case .loading:   TransactionSkeletonList()
            case .empty:     emptyState
            }
        }
        .background(AppTheme.bg)
        .safeAreaInset(edge: .top, spacing: 0) { titleAndSearch }
        .sheet(isPresented: $filterSheetPresented) {
            FilterSheet(
                criteria: $criteria,
                sources: sourceOptions,
                owners: ownerOptions,
                months: monthOptions
            )
            .environment(appState)
            .presentationDetents([.medium, .large])
            .presentationBackground(AppTheme.bg)
        }
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
        .sheet(item: $settleUpPrefill) { prefill in
            AddTransactionSheet(settleUp: prefill) { tx, keepOpen in
                appState.addTransaction(tx)
                if !keepOpen { settleUpPrefill = nil }
            }
            .environment(appState)
            .presentationDetents([.large])
            .presentationBackground(AppTheme.bg)
        }
    }

    // MARK: - Member balance line + Settle up

    /// Non-settled member balances (viewer-relative; positive ⇒ they owe you).
    /// Mirrors web `BalanceSummary` — the card is hidden entirely when everyone
    /// is settled (net 0).
    private var unsettledBalances: [(person: User, net: Int64)] {
        appState.memberBalances.filter { $0.net != 0 }
    }

    @ViewBuilder
    private var balanceBanner: some View {
        let rows = unsettledBalances
        if !rows.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("Balances")
                    .font(.lato(size: 13, weight: .semibold))
                    .kerning(0.6)
                    .textCase(.uppercase)
                    .foregroundStyle(AppTheme.text2)
                ForEach(rows, id: \.person.id) { bal in
                    HStack(spacing: 12) {
                        // Owing is NEVER red — neutral text only.
                        Text(balanceTitle(person: bal.person, net: bal.net))
                            .font(.lato(size: 15, weight: .medium))
                            .tracking(-0.1)
                            .foregroundStyle(AppTheme.text)
                        Spacer(minLength: 8)
                        settleUpButton(for: bal)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(AppTheme.hairline, lineWidth: 0.5)
            )
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
        }
    }

    /// "Tasnuva owes you $50" / "You owe Tasnuva $50". (Settled rows are filtered
    /// out before display, matching web.)
    private func balanceTitle(person: User, net: Int64) -> String {
        let amount = appState.formatMoney(abs(net))
        if net > 0 { return Localizer.tr("\(person.name) owes you \(amount)") }
        return Localizer.tr("You owe \(person.name) \(amount)")
    }

    /// Opens the Transfer form pre-filled: From = the ower, To = the payer,
    /// amount = the owed cents.
    private func settleUpButton(for bal: (person: User, net: Int64)) -> some View {
        Button {
            guard let me = appState.currentPersonID else { return }
            let other = bal.person.id
            // net > 0 ⇒ other owes you ⇒ from = other, to = you.
            // net < 0 ⇒ you owe other  ⇒ from = you,  to = other.
            let from = bal.net > 0 ? other : me
            let to = bal.net > 0 ? me : other
            settleUpPrefill = .init(from: from, to: to, amountCents: abs(bal.net))
        } label: {
            Text("Settle up")
                .font(.lato(size: 13, weight: .semibold))
                .foregroundStyle(AppTheme.accent)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Capsule().fill(AppTheme.text.opacity(0.05)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Settle up with \(bal.person.name)")
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
                    filterButton
                }
                addButton
            }
            .padding(.horizontal, 20)
            .padding(.top, 4)
            .padding(.bottom, hasAnyTransactions && searchActive ? 6 : 8)

            // Member balance ("X owes you" / "You owe X" / "Settled") + Settle
            // up. Hidden during search to keep that panel focused.
            if hasAnyTransactions && !searchActive {
                balanceBanner
            }

            if hasAnyTransactions && searchActive {
                SearchField(
                    text: $criteria.query,
                    placeholder: "Search transactions",
                    autofocusOnAppear: true,
                    onCancel: {
                        // Cancel inside the field collapses the whole
                        // search panel — single Cancel exits the mode.
                        criteria.query = ""
                        searchActive = false
                    }
                )
                    .padding(.vertical, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }

            if hasAnyTransactions && activeFilterCount_ > 0 {
                activeChipsRow
                    .padding(.bottom, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .background(colorScheme == .dark
                    ? AnyShapeStyle(AppTheme.bg)
                    : AnyShapeStyle(.regularMaterial))
        .animation(.easeOut(duration: 0.22), value: searchActive)
        .animation(.easeOut(duration: 0.18), value: activeFilterCount_)
    }

    /// Circular search button next to the "+". Tap to reveal the field
    /// + scope pills; the field auto-focuses on appear (keyboard rises).
    /// Tap again (icon flips to X) to close + clear.
    private var searchButton: some View {
        Button {
            if searchActive {
                criteria.query = ""
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
            // ≥44pt touch target around the 36pt visual circle.
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
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

    /// Circular filter button next to search/"+", with an accent count badge.
    private var filterButton: some View {
        Button { filterSheetPresented = true } label: {
            ZStack(alignment: .topTrailing) {
                ZStack {
                    Circle().fill(AppTheme.text.opacity(0.05))
                        .frame(width: 36, height: 36)
                    Image(systemName: "line.3.horizontal.decrease")
                        .font(.lato(size: 15, weight: .semibold))
                        .foregroundStyle(AppTheme.accent)
                }
                if activeFilterCount_ > 0 {
                    Text("\(activeFilterCount_)")
                        .font(.lato(size: 10, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(minWidth: 16, minHeight: 16)
                        .background(Circle().fill(AppTheme.accent))
                        .offset(x: 4, y: -3)
                }
            }
            // ≥44pt touch target around the 36pt visual circle.
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(activeFilterCount_ > 0 ? "Filters, \(activeFilterCount_) active" : "Filters")
    }

    /// Horizontally scrollable removable chips for each active dimension, plus
    /// a single Clear all. Mirrors web's `ActiveFilterChips`.
    private var activeChipsRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(activeChips) { chip in
                    Button(action: chip.remove) {
                        HStack(spacing: 5) {
                            Text(chip.label)
                                .font(.lato(size: 13, weight: .medium))
                                .tracking(-0.1)
                                .foregroundStyle(AppTheme.text)
                            Image(systemName: "xmark")
                                .font(.lato(size: 9, weight: .bold))
                                .foregroundStyle(AppTheme.text.opacity(0.4))
                        }
                        .padding(.leading, 11)
                        .padding(.trailing, 9)
                        .padding(.vertical, 6)
                        .background(Capsule().fill(AppTheme.surface))
                        .overlay(Capsule().strokeBorder(AppTheme.hairline, lineWidth: 0.5))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Remove \(chip.label) filter")
                }
                Button { criteria = .empty } label: {
                    Text("Clear all")
                        .font(.lato(size: 13, weight: .medium))
                        .foregroundStyle(AppTheme.accent)
                        .padding(.horizontal, 6)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 2)
        }
    }

    /// One removable active-filter chip — label + the action that clears it.
    private struct ActiveChip: Identifiable {
        let id: String
        let label: String
        let remove: () -> Void
    }

    private var activeChips: [ActiveChip] {
        var out: [ActiveChip] = []
        let q = criteria.query.trimmingCharacters(in: .whitespaces)
        if !q.isEmpty {
            out.append(.init(id: "query", label: "“\(q)”", remove: { criteria.query = "" }))
        }
        if criteria.kind != .all {
            let kindLabel: String
            switch criteria.kind {
            case .income:   kindLabel = "Income"
            case .transfer: kindLabel = "Transfers"
            case .expense:  kindLabel = "Expenses"
            case .all:      kindLabel = ""
            }
            out.append(.init(id: "kind", label: kindLabel,
                             remove: { criteria.kind = .all }))
        }
        for c in TransactionCategory.allCases where criteria.categories.contains(c) {
            out.append(.init(id: "cat-\(c.rawValue)", label: c.displayName.string,
                             remove: { criteria.categories.remove(c) }))
        }
        for s in sourceOptions where criteria.sources.contains(s) {
            out.append(.init(id: "src-\(s)", label: s, remove: { criteria.sources.remove(s) }))
        }
        for u in ownerOptions where criteria.owners.contains(u.id) {
            out.append(.init(id: "own-\(u.id)", label: u.name, remove: { criteria.owners.remove(u.id) }))
        }
        if let from = criteria.dateFrom {
            let key = FilterSheet.monthKey(from)
            out.append(.init(id: "month", label: FilterSheet.monthLabel(key),
                             remove: { criteria.dateFrom = nil; criteria.dateTo = nil }))
        }
        return out
    }

    /// Distinct empty state when filters exclude everything — separate from the
    /// "no transactions yet" state, with a one-tap clear.
    private var noMatchesState: some View {
        VStack(alignment: .center, spacing: 14) {
            Image(systemName: "line.3.horizontal.decrease.circle")
                .font(.lato(size: 40, weight: .regular))
                .foregroundStyle(AppTheme.text.opacity(0.36))
                .padding(.top, 60)
            Text("No transactions match your filters")
                .font(.lato(size: 17, weight: .semibold))
                .foregroundStyle(AppTheme.text)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            Text("Try removing a filter or widening your search.")
                .font(.lato(size: 14))
                .multilineTextAlignment(.center)
                .foregroundStyle(AppTheme.text.opacity(0.58))
                .padding(.horizontal, 40)
                .lineSpacing(2)
            Button { criteria = .empty } label: {
                Text("Clear filters")
                    .font(.lato(size: 15, weight: .semibold))
                    .foregroundStyle(AppTheme.accent)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
                    .background(Capsule().fill(AppTheme.text.opacity(0.05)))
            }
            .buttonStyle(.plain)
            .padding(.top, 4)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
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
