import SwiftUI

/// Pushed property detail — wraps `PropertyContentView` with custom
/// large-title chrome (back chevron + property title + Edit). Used in
/// multi-property mode when the user taps a card on the Housing list.
/// In single-property mode `HousingView` embeds `PropertyContentView`
/// directly with its own header.
struct PropertyDetailView: View {
    let propertyID: Property.ID

    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var showingEdit = false

    private var property: Property? {
        appState.properties.first { $0.id == propertyID }
    }

    var body: some View {
        Group {
            if let property {
                content(for: property)
            } else {
                // Property was deleted (cascade from PropertyContentView's
                // confirm alert) — pop the nav stack.
                Color.clear.onAppear { dismiss() }
            }
        }
        .background(AppTheme.bg)
        .toolbar(.hidden, for: .navigationBar)
        .hidesTabBar()
        .sheet(isPresented: $showingEdit) {
            if let property {
                AddPropertySheet(editing: property) { updated in
                    appState.updateProperty(updated)
                    showingEdit = false
                }
                .environment(appState)
                .presentationDetents([.large])
                .presentationBackground(AppTheme.bg)
            }
        }
    }

    @ViewBuilder
    private func content(for property: Property) -> some View {
        ScrollView {
            PropertyContentView(propertyID: property.id)
                .environment(appState)
                .padding(.horizontal, 16)
                .padding(.bottom, 8)

            Color.clear.frame(height: 80)
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            header(for: property)
        }
    }

    private func header(for property: Property) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Button { dismiss() } label: {
                ZStack {
                    Circle().fill(AppTheme.text.opacity(0.05))
                        .frame(width: 36, height: 36)
                    Image(systemName: "chevron.left")
                        .font(.lato(size: 16, weight: .semibold))
                        .foregroundStyle(AppTheme.accent)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Back")

            VStack(alignment: .leading, spacing: 0) {
                Text(property.title)
                    .font(.lato(size: 28, weight: .bold))
                    .tracking(-0.6)
                    .foregroundStyle(AppTheme.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(headerSubtitle(for: property))
                    .font(.lato(size: 13))
                    .foregroundStyle(AppTheme.text2)
            }
            Spacer()
            Button {
                showingEdit = true
            } label: {
                Text("Edit")
                    .font(.lato(size: 15, weight: .semibold))
                    .foregroundStyle(AppTheme.accent)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 20)
        .padding(.top, 4)
        .padding(.bottom, 16)
        .background(AppTheme.bg)
    }

    private func headerSubtitle(for property: Property) -> String {
        switch property.kind {
        case .primaryHome: Localizer.tr("Mortgage · Primary home")
        case .multifamily: Localizer.tr("Mortgage · Multifamily")
        case .rental:      Localizer.tr("Rental")
        }
    }
}

#Preview("Detail · Primary home") {
    NavigationStack {
        PropertyDetailView(propertyID: Property.sample[0].id)
            .environment(AppState())
    }
}
