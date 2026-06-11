import SwiftUI

/// Search field with focus-driven affordances: tinted ring, clear button,
/// inline Cancel that resigns focus.
///
/// `autofocusOnAppear` brings the keyboard up automatically when the
/// view appears — used by the Transactions tap-to-reveal search so the
/// user can type immediately after tapping the magnifying glass.
/// `onCancel` lets the parent observe the inline Cancel tap (e.g. to
/// also collapse the surrounding search panel).
struct SearchField: View {
    @Binding var text: String
    var placeholder: LocalizedStringKey = "Search"
    var autofocusOnAppear: Bool = false
    var onCancel: (() -> Void)? = nil

    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.lato(size: 15, weight: .medium))
                .foregroundStyle(focused ? AppTheme.accent : AppTheme.text2)

            TextField(placeholder, text: $text)
                .font(.lato(size: 17))
                .focused($focused)
                .submitLabel(.search)
                .tint(AppTheme.accent)

            if focused && !text.isEmpty {
                Button { text = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.lato(size: 16))
                        .foregroundStyle(AppTheme.text2)
                }
                .buttonStyle(.plain)
                .transition(.opacity)
            }

            if focused {
                Button("Cancel") {
                    text = ""
                    focused = false
                    onCancel?()
                }
                .font(.lato(size: 16, weight: .medium))
                .foregroundStyle(AppTheme.accent)
                .buttonStyle(.plain)
                .transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
        .padding(.horizontal, 12)
        .frame(height: 44)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(AppTheme.text.opacity(0.06))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .strokeBorder(focused ? AppTheme.accent : .clear, lineWidth: 1.5)
                )
        )
        .padding(.horizontal, 16)
        .animation(.easeOut(duration: 0.15), value: focused)
        .animation(.easeOut(duration: 0.12), value: text.isEmpty)
        .onAppear {
            if autofocusOnAppear {
                // Small delay so the appearance transition can settle
                // before keyboard summons — avoids a jumpy first frame.
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                    focused = true
                }
            }
        }
    }
}
