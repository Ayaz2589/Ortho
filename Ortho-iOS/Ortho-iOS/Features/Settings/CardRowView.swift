import SwiftUI

/// One card row inside the Cards card on the Settings screen. Name on the
/// left, trailing destructive minus button. The minus shows a confirmation
/// alert before deleting — matches the destructive-action pattern used by
/// TransactionDetailSheet.
struct CardRowView: View {
    let card: Card
    let onDelete: () -> Void

    @State private var showingDeleteConfirm = false

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle().fill(AppTheme.text.opacity(0.05))
                    .frame(width: 40, height: 40)
                Image(systemName: "creditcard")
                    .font(.lato(size: 16, weight: .medium))
                    .foregroundStyle(AppTheme.text2)
            }
            Text(card.name)
                .font(.lato(size: 17, weight: .medium))
                .tracking(-0.2)
                .foregroundStyle(AppTheme.text)
            Spacer()
            Button {
                showingDeleteConfirm = true
            } label: {
                Image(systemName: "minus.circle.fill")
                    .font(.lato(size: 20, weight: .regular))
                    .foregroundStyle(AppTheme.destructive)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Delete \(card.name)")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(minHeight: 64)
        .alert("Delete this card?", isPresented: $showingDeleteConfirm) {
            Button("Cancel", role: .cancel) { }
            Button("Delete", role: .destructive) { onDelete() }
        } message: {
            Text("Existing transactions keep their original card name.")
        }
    }
}

/// Inline action row at the bottom of the Cards card. Mirrors AddUserRowView.
struct AddCardRowView: View {
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
                Text("Add card")
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
