import SwiftUI

/// The kind-specific card stack for one property — same content whether
/// embedded directly on the Housing tab (single-property mode) or pushed
/// as `PropertyDetailView` (multi-property mode). Owns the "Delete
/// property" button + its confirmation alert, plus the rental-only
/// "Log payment" sheet. The parent owns the Edit button + AddPropertySheet
/// because the Edit affordance lives in the chrome (header) which differs
/// between the two parents.
struct PropertyContentView: View {
    let propertyID: Property.ID

    @Environment(AppState.self) private var appState

    @State private var showingDeleteConfirm = false
    @State private var showingAddPayment = false

    private var property: Property? {
        appState.properties.first { $0.id == propertyID }
    }

    var body: some View {
        Group {
            if let property {
                cards(for: property)
            } else {
                EmptyView()
            }
        }
        .sheet(isPresented: $showingAddPayment) {
            if let property {
                AddRentalPaymentSheet(property: property) { payment in
                    appState.addRentalPayment(payment)
                    showingAddPayment = false
                }
                .environment(appState)
                .presentationDetents([.medium])
                .presentationBackground(AppTheme.bg)
            }
        }
        .alert("Delete this property?", isPresented: $showingDeleteConfirm) {
            Button("Cancel", role: .cancel) { }
            Button("Delete", role: .destructive) {
                if let property { appState.deleteProperty(property) }
            }
        } message: {
            Text("Mortgage info, lease details, and rental payment history for this property will be removed.")
        }
    }

    @ViewBuilder
    private func cards(for property: Property) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            switch property.kind {
            case .primaryHome:
                if let mortgage = property.mortgage {
                    MortgageMonthlyPaymentCard(mortgage: mortgage)
                    MortgageDetailsCard(mortgage: mortgage)
                    EquityProgressCard(mortgage: mortgage)
                    AmortizationCard(mortgage: mortgage)
                } else {
                    incompletePlaceholder
                }

            case .multifamily:
                if let mortgage = property.mortgage {
                    MortgageMonthlyPaymentCard(mortgage: mortgage)
                    MortgageDetailsCard(mortgage: mortgage)
                    MultifamilyUnitsCard(property: property)
                    MultifamilyNetBalanceCard(property: property)
                    EquityProgressCard(mortgage: mortgage)
                    AmortizationCard(mortgage: mortgage)
                } else {
                    incompletePlaceholder
                }

            case .rental:
                if let lease = property.lease {
                    RentalMonthlyRentCard(lease: lease)
                    if lease.isRenewalSoon() {
                        LeaseRenewalBanner(lease: lease)
                    }
                    LeaseInfoCard(lease: lease)
                    RentalPaymentsCard(propertyID: property.id,
                                       onAddPayment: { showingAddPayment = true })
                } else {
                    incompletePlaceholder
                }
            }

            deleteButton
        }
    }

    /// Neutral fallback when a server property is missing its mortgage/lease
    /// sub-row. Avoids crashing the Housing tab on partially-synced data.
    private var incompletePlaceholder: some View {
        Text("Incomplete property — tap Edit to finish setup.")
            .font(.lato(size: 15))
            .foregroundStyle(AppTheme.text2)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
            .background(AppTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var deleteButton: some View {
        Button {
            showingDeleteConfirm = true
        } label: {
            HStack {
                Spacer()
                Text("Delete property")
                    .font(.lato(size: 17, weight: .medium))
                    .foregroundStyle(AppTheme.destructive)
                Spacer()
            }
            .padding(.vertical, 14)
            .background(AppTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}
