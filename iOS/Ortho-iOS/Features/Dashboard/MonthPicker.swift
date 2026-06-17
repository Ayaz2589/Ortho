import SwiftUI

/// Specific-month control for the Dashboard, placed beside the relative range
/// picker. Renders `‹ June 2026 ›` — the label opens a newest-first month list
/// to jump; `‹`/`›` step to the chronologically adjacent available month and
/// are disabled at the earliest/latest edge. A trailing "Latest" affordance
/// returns to the relative range (clears the transient selection).
///
/// Mirror of `web/components/dashboard/MonthPicker.tsx`. All clamping/labels go
/// through the parity-locked helpers (`stepMonth`, `availableMonths`,
/// `monthReferenceDate`) + `FilterSheet.monthLabel` — no window math here.
/// Tokens only; controls are ≥44pt touch targets.
struct MonthPicker: View {
    /// Available months, newest-first (`appState.dashboardAvailableMonths`).
    let months: [String]
    /// Currently selected month, or `nil` for the relative range view.
    let selectedMonth: String?
    let onSelect: (String) -> Void
    let onClear: () -> Void

    /// The chronologically older neighbor (or `nil` at the earliest edge).
    private var prevMonth: String? {
        guard let current = selectedMonth else { return nil }
        return stepMonth(months, current, .prev)
    }

    /// The chronologically newer neighbor (or `nil` at the latest edge).
    private var nextMonth: String? {
        guard let current = selectedMonth else { return nil }
        return stepMonth(months, current, .next)
    }

    var body: some View {
        if months.isEmpty {
            // No data → nothing to pick. The dashboard stays on the relative view.
            EmptyView()
        } else if let current = selectedMonth {
            selectedControl(current)
        } else {
            pickEntry
        }
    }

    // MARK: - Selected: ‹ June 2026 › + Latest

    private func selectedControl(_ current: String) -> some View {
        HStack(spacing: 4) {
            stepButton(
                systemName: "chevron.left",
                label: "Previous month",
                target: prevMonth
            )

            Menu {
                ForEach(months, id: \.self) { month in
                    Button {
                        onSelect(month)
                    } label: {
                        if month == current {
                            Label(FilterSheet.monthLabel(month), systemImage: "checkmark")
                        } else {
                            Text(FilterSheet.monthLabel(month))
                        }
                    }
                }
            } label: {
                Text(FilterSheet.monthLabel(current))
                    .font(.lato(size: 14, weight: .semibold))
                    .tracking(-0.1)
                    .foregroundStyle(AppTheme.text)
                    .frame(minWidth: 96, minHeight: 44)
                    .padding(.horizontal, 8)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel(Text("Selected month, \(FilterSheet.monthLabel(current))"))

            stepButton(
                systemName: "chevron.right",
                label: "Next month",
                target: nextMonth
            )

            Button {
                onClear()
            } label: {
                Text("Latest")
                    .font(.lato(size: 13, weight: .semibold))
                    .tracking(-0.1)
                    .foregroundStyle(AppTheme.accent)
                    .frame(minHeight: 44)
                    .padding(.horizontal, 8)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("Back to latest"))
        }
        .padding(.horizontal, 4)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(AppTheme.text.opacity(0.05))
        )
    }

    /// A single ‹ / › step button. Disabled (muted `--text-3`) at a data edge.
    private func stepButton(systemName: String,
                            label: LocalizedStringKey,
                            target: String?) -> some View {
        Button {
            if let target { onSelect(target) }
        } label: {
            Image(systemName: systemName)
                .font(.lato(size: 13, weight: .semibold))
                .foregroundStyle(target == nil ? AppTheme.text3 : AppTheme.text)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(target == nil)
        .accessibilityLabel(Text(label))
    }

    // MARK: - No selection: "Pick a month" entry

    private var pickEntry: some View {
        Menu {
            ForEach(months, id: \.self) { month in
                Button(FilterSheet.monthLabel(month)) { onSelect(month) }
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "calendar")
                    .font(.lato(size: 13, weight: .semibold))
                Text("Pick a month")
                    .font(.lato(size: 14, weight: .semibold))
                    .tracking(-0.1)
            }
            .foregroundStyle(AppTheme.text.opacity(0.58))
            .frame(minHeight: 44)
            .padding(.horizontal, 12)
            .contentShape(Rectangle())
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(AppTheme.text.opacity(0.05))
            )
        }
        .accessibilityLabel(Text("Pick a month"))
    }
}
