import SwiftUI

/// A selectable month for the date filter — "2026-05" key + "May 2026" label.
struct FilterMonthOption: Identifiable, Hashable {
    let key: String   // "YYYY-MM" (UTC, matches `monthBounds`)
    let label: String // "May 2026"
    var id: String { key }
}

/// Bottom sheet presenting the richer transaction filters — category, kind,
/// source, owner, month — layered on top of the always-present scope toggle and
/// search. Mirrors `web/components/web/FilterPanel.tsx`. The filter *logic* is the
/// shared `filterTransactions` (TransactionFilters.swift), golden-vector-locked
/// against web; this sheet only edits the `FilterCriteria`.
struct FilterSheet: View {
    @Binding var criteria: FilterCriteria
    let sources: [String]
    let owners: [User]
    let months: [FilterMonthOption]

    @Environment(\.dismiss) private var dismiss

    private var count: Int { activeFilterCount(criteria) }

    /// Selected month derived from the lower bound (UTC key); nil = all time.
    private var selectedMonthKey: String? {
        guard let from = criteria.dateFrom else { return nil }
        return Self.monthKey(from)
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    categorySection
                    kindSection
                    if !sources.isEmpty { sourceSection }
                    if owners.count > 1 { ownerSection }
                    if !months.isEmpty { monthSection }
                }
                .padding(.horizontal, 20)
                .padding(.top, 6)
                .padding(.bottom, 44)
            }
        }
        .background(AppTheme.bg)
    }

    // MARK: - Header

    private var header: some View {
        ZStack {
            Text("Filters")
                .font(.lato(size: 17, weight: .semibold))
                .tracking(-0.3)
                .foregroundStyle(AppTheme.text)
            HStack {
                Button("Clear") { criteria = .empty }
                    .font(.lato(size: 17, weight: .medium))
                    .foregroundStyle(AppTheme.accent)
                    .buttonStyle(.plain)
                    .opacity(count > 0 ? 1 : 0)
                    .disabled(count == 0)
                    .accessibilityHidden(count == 0)
                Spacer()
                Button("Done") { dismiss() }
                    .font(.lato(size: 17, weight: .semibold))
                    .foregroundStyle(AppTheme.accent)
                    .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 10)
    }

    // MARK: - Sections

    private var categorySection: some View {
        section("Category") {
            FlowLayout(spacing: 8) {
                // No .transfer chip: transfer rows are isolated via the
                // Type = Transfers segment below, matching web's
                // ALL_CATEGORIES (spend categories + income, no transfer).
                ForEach(TransactionCategory.allCases.filter { $0 != .transfer }) { c in
                    FilterChip(selected: criteria.categories.contains(c)) {
                        toggle(&criteria.categories, c)
                    } label: {
                        Image(systemName: c.symbol)
                            .font(.lato(size: 12, weight: .semibold))
                            .foregroundStyle(c.tint)
                        Text(c.displayName.string)
                    }
                    .accessibilityLabel(c.displayName.string)
                }
            }
        }
    }

    private var kindSection: some View {
        section("Type") {
            segmented(
                options: [(.all, "All"), (.expense, "Expenses"), (.income, "Income"), (.transfer, "Transfers")],
                selection: criteria.kind
            ) { criteria.kind = $0 }
        }
    }

    private var sourceSection: some View {
        section("Source") {
            FlowLayout(spacing: 8) {
                ForEach(sources, id: \.self) { s in
                    FilterChip(selected: criteria.sources.contains(s)) {
                        toggle(&criteria.sources, s)
                    } label: {
                        Text(s)
                    }
                }
            }
        }
    }

    private var ownerSection: some View {
        section("Owner") {
            FlowLayout(spacing: 8) {
                ForEach(owners) { u in
                    FilterChip(selected: criteria.owners.contains(u.id)) {
                        toggle(&criteria.owners, u.id)
                    } label: {
                        UserAvatarView(user: u, size: 20)
                        Text(u.name)
                    }
                    .accessibilityLabel(u.name)
                }
            }
        }
    }

    private var monthSection: some View {
        section("Month") {
            FlowLayout(spacing: 8) {
                ForEach(months) { m in
                    FilterChip(selected: selectedMonthKey == m.key) {
                        if selectedMonthKey == m.key {
                            criteria.dateFrom = nil
                            criteria.dateTo = nil
                        } else if let (from, to) = monthBounds(m.key) {
                            criteria.dateFrom = from
                            criteria.dateTo = to
                        }
                    } label: {
                        Text(m.label)
                    }
                }
            }
        }
    }

    // MARK: - Building blocks

    @ViewBuilder
    private func section<Content: View>(_ title: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title.uppercased())
                .font(.lato(size: 13, weight: .semibold))
                .tracking(0.6)
                .foregroundStyle(AppTheme.text.opacity(0.58))
            content()
        }
    }

    /// All | Expenses | Income segmented pill — mirrors the scope pill styling.
    private func segmented(
        options: [(FilterCriteria.Kind, String)],
        selection: FilterCriteria.Kind,
        onChange: @escaping (FilterCriteria.Kind) -> Void
    ) -> some View {
        HStack(spacing: 4) {
            ForEach(options, id: \.0) { value, label in
                Button { onChange(value) } label: {
                    Text(label)
                        .font(.lato(size: 13, weight: .semibold))
                        .tracking(-0.1)
                        .foregroundStyle(selection == value ? AppTheme.text : AppTheme.text.opacity(0.58))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                        .background(
                            RoundedRectangle(cornerRadius: 7, style: .continuous)
                                .fill(selection == value ? AppTheme.surface : .clear)
                                .shadow(color: selection == value ? .black.opacity(0.06) : .clear, radius: 2, y: 1)
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
        .animation(.easeOut(duration: 0.15), value: selection)
    }

    private func toggle<T: Hashable>(_ set: inout Set<T>, _ value: T) {
        if set.contains(value) { set.remove(value) } else { set.insert(value) }
    }

    // MARK: - UTC month helpers (consistent with `monthBounds`)

    static func monthKey(_ d: Date) -> String { keyFormatter.string(from: d) }
    static func monthLabel(_ key: String) -> String {
        guard let (from, _) = monthBounds(key) else { return key }
        return labelFormatter.string(from: from)
    }

    private static let keyFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM"
        return f
    }()
    private static let labelFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "LLLL yyyy"
        return f
    }()
}

/// A pill chip with optional leading glyph; accent ring when selected. Matches
/// the web filter chips (surface fill + accent ring on active).
private struct FilterChip<Label: View>: View {
    let selected: Bool
    let action: () -> Void
    @ViewBuilder var label: () -> Label

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) { label() }
                .font(.lato(size: 14, weight: .medium))
                .tracking(-0.1)
                .foregroundStyle(AppTheme.text)
                .padding(.leading, 10)
                .padding(.trailing, 12)
                .padding(.vertical, 7)
                .background(Capsule().fill(AppTheme.text.opacity(selected ? 0.06 : 0.03)))
                .overlay(Capsule().strokeBorder(selected ? AppTheme.accent : .clear, lineWidth: 1.5))
                .contentShape(Capsule())
                .animation(.easeOut(duration: 0.12), value: selected)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}

/// Minimal wrapping layout for chip rows (no first-party SwiftUI equivalent).
/// Lays subviews left-to-right, wrapping to a new line when the proposed width
/// is exceeded.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout Void) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var widest: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                widest = max(widest, x - spacing)
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        widest = max(widest, x - spacing)
        return CGSize(width: min(widest, maxWidth), height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout Void) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), anchor: .topLeading, proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
