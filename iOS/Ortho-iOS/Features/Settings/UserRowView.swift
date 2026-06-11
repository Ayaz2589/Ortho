import SwiftUI

/// One user row inside the inset card on the Settings screen.
struct UserRowView: View {
    let user: User
    var detail: String? = nil
    var isCurrentUser: Bool = false
    /// Tap handler. `nil` (the default) renders the row as static info — no
    /// button wrapper, no trailing chevron. Pass a closure when there's an
    /// actual destination.
    var onTap: (() -> Void)? = nil
    /// Destructive remove handler. When set, the row shows a trailing
    /// minus.circle.fill button that confirms via alert before calling.
    /// Mutually exclusive with `onTap` (chevron wins if both are set).
    var onRemove: (() -> Void)? = nil

    @State private var showingRemoveConfirm = false

    var body: some View {
        if let onTap {
            Button(action: onTap) { rowContent(trailing: .chevron) }
                .buttonStyle(.plain)
        } else if onRemove != nil {
            rowContent(trailing: .removeButton)
                .alert("Remove \(user.name) from this household?",
                       isPresented: $showingRemoveConfirm) {
                    Button("Cancel", role: .cancel) { }
                    Button("Remove", role: .destructive) { onRemove?() }
                } message: {
                    Text("Existing transactions keep \(user.name) as the owner.")
                }
        } else {
            rowContent(trailing: .none)
        }
    }

    private enum Trailing { case chevron, removeButton, none }

    private func rowContent(trailing: Trailing) -> some View {
        HStack(spacing: 14) {
            avatar
            VStack(alignment: .leading, spacing: 3) {
                Text(user.name)
                    .font(.lato(size: 17, weight: .medium))
                    .foregroundStyle(AppTheme.text)
                    .tracking(-0.2)
                if let displayDetail = composedDetail {
                    Text(displayDetail)
                        .font(.lato(size: 13))
                        .foregroundStyle(AppTheme.text.opacity(0.58))
                        .tracking(-0.1)
                }
            }
            Spacer()
            switch trailing {
            case .chevron:
                ChevronView()
            case .removeButton:
                Button {
                    showingRemoveConfirm = true
                } label: {
                    Image(systemName: "minus.circle.fill")
                        .font(.lato(size: 20, weight: .regular))
                        .foregroundStyle(AppTheme.destructive)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Remove \(user.name)")
            case .none:
                EmptyView()
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(minHeight: 64)
        .contentShape(Rectangle())
    }

    /// Combines the optional `detail` string with a leading "(you) · " marker
    /// when this row is the current user.
    private var composedDetail: String? {
        switch (isCurrentUser, detail) {
        case (true, let .some(d)) where !d.isEmpty: return Localizer.tr("(you) · \(d)")
        case (true, _):                              return Localizer.tr("(you)")
        case (false, let d):                         return d
        }
    }

    private var avatar: some View {
        let palette = user.palette
        return Text(user.initial)
            .font(.lato(size: user.initial.count > 1 ? 13 : 17, weight: .semibold))
            .foregroundStyle(palette.fg)
            .frame(width: 40, height: 40)
            .background(Circle().fill(palette.bg))
    }
}

/// Inline action row — lives inside the same card as users so the "add"
/// affordance reads as part of the list, not as floating chrome.
struct AddUserRowView: View {
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 14) {
                ZStack {
                    Circle().fill(AppTheme.text.opacity(0.05))
                        .frame(width: 40, height: 40)
                    Image(systemName: "plus")
                        .font(.lato(size: 15, weight: .semibold))
                        .foregroundStyle(AppTheme.accent)
                }
                Text("Add user")
                    .font(.lato(size: 17, weight: .medium))
                    .tracking(-0.2)
                    .foregroundStyle(AppTheme.accent)
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(minHeight: 64)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct ChevronView: View {
    var body: some View {
        Image(systemName: "chevron.right")
            .font(.lato(size: 13, weight: .semibold))
            .foregroundStyle(AppTheme.text.opacity(0.36))
    }
}
