import SwiftUI

/// Housing tab. Behavior varies with property count:
/// - 0:   empty state inviting the user to add their first property.
/// - 1:   the property's full detail (cards) inline. No drill-in needed.
/// - 2+:  card list; tap pushes to `PropertyDetailView`.
///
/// The "+" button always adds a new property (via the type picker).
/// In single-property mode an "Edit" link is surfaced next to "+" so the
/// user can modify the existing property without first navigating away.
struct HousingView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.colorScheme) private var colorScheme

    @State private var showingTypePicker = false
    @State private var creatingKind: PropertyKind?
    @State private var showingEdit = false

    /// The lone property in single-property mode, if any.
    private var lonelyProperty: Property? {
        appState.properties.count == 1 ? appState.properties.first : nil
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    switch appState.properties.count {
                    case 0:
                        emptyState
                    case 1:
                        if let p = lonelyProperty {
                            PropertyContentView(propertyID: p.id)
                                .environment(appState)
                                .padding(.horizontal, 16)
                        }
                    default:
                        propertyList
                    }

                    Color.clear.frame(height: 80)
                }
            }
            .background(AppTheme.bg)
            .toolbar(.hidden, for: .navigationBar)
            .safeAreaInset(edge: .top, spacing: 0) { header }
            .sheet(isPresented: $showingTypePicker) {
                PropertyTypePickerSheet { kind in
                    showingTypePicker = false
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        creatingKind = kind
                    }
                }
                .presentationDetents([.medium])
                .presentationBackground(AppTheme.bg)
            }
            .sheet(item: $creatingKind) { kind in
                AddPropertySheet(creating: kind) { newProperty in
                    appState.addProperty(newProperty)
                    creatingKind = nil
                }
                .environment(appState)
                .presentationDetents([.large])
                .presentationBackground(AppTheme.bg)
            }
            .sheet(isPresented: $showingEdit) {
                if let p = lonelyProperty {
                    AddPropertySheet(editing: p) { updated in
                        appState.updateProperty(updated)
                        showingEdit = false
                    }
                    .environment(appState)
                    .presentationDetents([.large])
                    .presentationBackground(AppTheme.bg)
                }
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text("Housing")
                    .font(.lato(size: 32, weight: .bold))
                    .tracking(-0.6)
                    .foregroundStyle(AppTheme.text)
                Spacer()
                headerActions
            }
            if let p = lonelyProperty {
                Text("\(p.address) · \(kindLabel(p.kind))")
                    .font(.lato(size: 13))
                    .foregroundStyle(AppTheme.text2)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 4)
        .padding(.bottom, 5)
        .background(colorScheme == .dark ? AnyShapeStyle(AppTheme.bg) : AnyShapeStyle(.regularMaterial))
    }

    @ViewBuilder
    private var headerActions: some View {
        HStack(spacing: 12) {
            if lonelyProperty != nil {
                Button {
                    showingEdit = true
                } label: {
                    Text("Edit")
                        .font(.lato(size: 15, weight: .semibold))
                        .foregroundStyle(AppTheme.accent)
                }
                .buttonStyle(.plain)
            }

            Button {
                showingTypePicker = true
            } label: {
                ZStack {
                    Circle().fill(AppTheme.text.opacity(0.05))
                        .frame(width: 36, height: 36)
                    Image(systemName: "plus")
                        .font(.lato(size: 16, weight: .semibold))
                        .foregroundStyle(AppTheme.accent)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Add property")
        }
    }

    private func kindLabel(_ kind: PropertyKind) -> String {
        switch kind {
        case .primaryHome: "Primary home"
        case .multifamily: "Multifamily"
        case .rental:      "Rental"
        }
    }

    // MARK: - Multi-property list

    private var propertyList: some View {
        VStack(spacing: 12) {
            ForEach(appState.properties) { p in
                NavigationLink {
                    PropertyDetailView(propertyID: p.id)
                        .environment(appState)
                } label: {
                    PropertyCard(property: p)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16)
    }

    // MARK: - Empty state

    private var emptyState: some View {
        VStack(alignment: .center, spacing: 14) {
            Image(systemName: "house")
                .font(.lato(size: 40, weight: .regular))
                .foregroundStyle(AppTheme.text.opacity(0.36))
                .padding(.top, 60)
            Text("No properties yet")
                .font(.lato(size: 17, weight: .semibold))
                .foregroundStyle(AppTheme.text)
            Text("Add a primary home, a rental, or a multifamily property to track payments, balances, and lease info.")
                .font(.lato(size: 14))
                .multilineTextAlignment(.center)
                .foregroundStyle(AppTheme.text.opacity(0.58))
                .padding(.horizontal, 40)
                .lineSpacing(2)
            Button {
                showingTypePicker = true
            } label: {
                Text("Add property")
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
        }
        .frame(maxWidth: .infinity)
    }
}

#Preview("Housing · Single property") {
    HousingView()
        .environment(AppState())
        .preferredColorScheme(.light)
}

#Preview("Housing · Multiple properties") {
    HousingView()
        .environment(AppState(properties: [
            Property.sample[0],
            Property(
                householdID: Household.homeSample.id,
                kind: .rental,
                address: "Apt 4B · 800 Park",
                lease: LeaseInfo(
                    monthlyRent: 2_400_00,
                    leaseStart: .now,
                    leaseEnd: Calendar.current.date(byAdding: .month, value: 8, to: .now) ?? .now
                )
            )
        ]))
        .preferredColorScheme(.light)
}

#Preview("Housing · Empty") {
    HousingView()
        .environment(AppState(properties: []))
        .preferredColorScheme(.light)
}
