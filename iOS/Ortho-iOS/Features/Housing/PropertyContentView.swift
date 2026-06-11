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
                MortgageMonthlyPaymentCard(mortgage: property.mortgage!)
                MortgageDetailsCard(mortgage: property.mortgage!)
                EquityProgressCard(mortgage: property.mortgage!)
                AmortizationCard(mortgage: property.mortgage!)

            case .multifamily:
                MortgageMonthlyPaymentCard(mortgage: property.mortgage!)
                MortgageDetailsCard(mortgage: property.mortgage!)
                MultifamilyUnitsCard(property: property)
                MultifamilyNetBalanceCard(property: property)
                EquityProgressCard(mortgage: property.mortgage!)
                AmortizationCard(mortgage: property.mortgage!)

            case .rental:
                RentalMonthlyRentCard(lease: property.lease!)
                if property.lease?.isRenewalSoon() == true {
                    LeaseRenewalBanner(lease: property.lease!)
                }
                LeaseInfoCard(lease: property.lease!)
                RentalPaymentsCard(propertyID: property.id,
                                   onAddPayment: { showingAddPayment = true })
            }

            deleteButton
        }
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
