import SwiftUI

/// Add or edit a property. Either `creating` is set (new property of that
/// kind) or `editing` is set (existing property, fields pre-filled, id
/// preserved on submit). The kind is locked once chosen — switching types
/// is not supported in this iteration.
struct AddPropertySheet: View {
    let editing: Property?
    let creatingKind: PropertyKind?
    let onSubmit: (Property) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var appState

    @State private var address: String
    @State private var nickname: String

    // Mortgage fields
    @State private var purchasePriceText: String
    @State private var originalLoanText: String
    @State private var interestRateText: String
    @State private var loanTermYears: Int
    @State private var closingDate: Date
    @State private var autoPaySource: String

    // Lease fields
    @State private var monthlyRentText: String
    @State private var leaseStart: Date
    @State private var leaseEnd: Date
    @State private var securityDepositText: String
    @State private var paidWithSource: String

    // Multifamily
    @State private var units: [Unit]

    private let kind: PropertyKind

    init(creating kind: PropertyKind, onSubmit: @escaping (Property) -> Void) {
        self.editing = nil
        self.creatingKind = kind
        self.kind = kind
        self.onSubmit = onSubmit
        _address = State(initialValue: "")
        _nickname = State(initialValue: "")
        _purchasePriceText = State(initialValue: "")
        _originalLoanText = State(initialValue: "")
        _interestRateText = State(initialValue: "")
        _loanTermYears = State(initialValue: 30)
        _closingDate = State(initialValue: .now)
        _autoPaySource = State(initialValue: "")
        _monthlyRentText = State(initialValue: "")
        _leaseStart = State(initialValue: .now)
        _leaseEnd = State(initialValue:
            Calendar.current.date(byAdding: .year, value: 1, to: .now) ?? .now
        )
        _securityDepositText = State(initialValue: "")
        _paidWithSource = State(initialValue: "")
        _units = State(initialValue: [])
    }

    init(editing property: Property, onSubmit: @escaping (Property) -> Void) {
        self.editing = property
        self.creatingKind = nil
        self.kind = property.kind
        self.onSubmit = onSubmit
        _address = State(initialValue: property.address)
        _nickname = State(initialValue: property.nickname ?? "")
        _purchasePriceText = State(initialValue:
            Self.formatCents(property.mortgage?.purchasePrice ?? 0)
        )
        _originalLoanText = State(initialValue:
            Self.formatCents(property.mortgage?.originalLoan ?? 0)
        )
        _interestRateText = State(initialValue:
            property.mortgage.map { Self.formatPercent($0.annualInterestRatePercent) } ?? ""
        )
        _loanTermYears = State(initialValue: property.mortgage?.loanTermYears ?? 30)
        _closingDate = State(initialValue: property.mortgage?.closingDate ?? .now)
        _autoPaySource = State(initialValue: property.mortgage?.autoPaySource ?? "")
        _monthlyRentText = State(initialValue:
            Self.formatCents(property.lease?.monthlyRent ?? 0)
        )
        _leaseStart = State(initialValue: property.lease?.leaseStart ?? .now)
        _leaseEnd = State(initialValue:
            property.lease?.leaseEnd
                ?? (Calendar.current.date(byAdding: .year, value: 1, to: .now) ?? .now)
        )
        _securityDepositText = State(initialValue:
            property.lease?.securityDepositCents.map(Self.formatCents) ?? ""
        )
        _paidWithSource = State(initialValue: property.lease?.paidWithSource ?? "")
        _units = State(initialValue: property.units)
    }

    private var isEditing: Bool { editing != nil }
    private var navTitle: LocalizedStringKey {
        switch (isEditing, kind) {
        case (true, _):                    return "Edit \(kind.displayName.string.lowercased())"
        case (false, .primaryHome):        return "New primary home"
        case (false, .multifamily):        return "New multifamily"
        case (false, .rental):             return "New rental"
        }
    }
    private var actionLabel: LocalizedStringKey { isEditing ? "Save" : "Add" }

    private var canSubmit: Bool {
        guard !address.trimmingCharacters(in: .whitespaces).isEmpty else { return false }
        switch kind {
        case .primaryHome, .multifamily:
            return parsedDecimal(purchasePriceText) ?? 0 > 0
                && parsedDecimal(originalLoanText) ?? 0 > 0
                && parsedDecimal(interestRateText) ?? 0 > 0
        case .rental:
            return parsedDecimal(monthlyRentText) ?? 0 > 0
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            sheetNav

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    formGroup {
                        textRow(label: "Address",
                                placeholder: "e.g. 124 Oak Lane",
                                text: $address)
                        divider
                        textRow(label: "Nickname",
                                placeholder: "Optional",
                                text: $nickname)
                    }

                    if kind.hasMortgage {
                        sectionLabel("Mortgage")
                        formGroup {
                            currencyRow(label: "Purchase price",
                                        placeholder: "0",
                                        text: $purchasePriceText)
                            divider
                            currencyRow(label: "Original loan",
                                        placeholder: "0",
                                        text: $originalLoanText)
                            divider
                            percentRow(label: "Interest rate",
                                       placeholder: "0.00",
                                       text: $interestRateText)
                            divider
                            termRow
                            divider
                            dateRow(label: "Closing date", date: $closingDate)
                            divider
                            textRow(label: "Auto-pay",
                                    placeholder: "Optional",
                                    text: $autoPaySource)
                        }
                    }

                    if kind == .multifamily {
                        sectionLabel("Units & tenants")
                        formGroup {
                            ForEach(Array(units.enumerated()), id: \.element.id) { idx, _ in
                                unitRow(index: idx)
                                if idx < units.count - 1 { divider }
                            }
                            if !units.isEmpty { divider }
                            addUnitRow
                        }
                    }

                    if kind == .rental {
                        sectionLabel("Lease")
                        formGroup {
                            currencyRow(label: "Monthly rent",
                                        placeholder: "0",
                                        text: $monthlyRentText)
                            divider
                            dateRow(label: "Lease start", date: $leaseStart)
                            divider
                            dateRow(label: "Lease end", date: $leaseEnd)
                            divider
                            currencyRow(label: "Security deposit",
                                        placeholder: "Optional",
                                        text: $securityDepositText)
                            divider
                            textRow(label: "Paid with",
                                    placeholder: "Optional",
                                    text: $paidWithSource)
                        }
                    }

                    Text(footerCaption)
                        .font(.lato(size: 13))
                        .foregroundStyle(AppTheme.text.opacity(0.36))
                        .lineSpacing(2)
                        .padding(.horizontal, 24)
                        .padding(.bottom, 24)
                        .frame(maxWidth: 360, alignment: .leading)
                }
                .padding(.top, 8)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(AppTheme.bg)
    }

    private var footerCaption: LocalizedStringKey {
        switch kind {
        case .primaryHome:
            return "Monthly principal + interest is computed from the loan amount, rate, and term. Taxes and insurance aren't tracked yet."
        case .multifamily:
            return "Add each unit's rent and tenant. Net balance is total unit rent minus the mortgage payment."
        case .rental:
            return "Rent reminders use the day of the month from your lease start date."
        }
    }

    // MARK: - Sheet nav

    private var sheetNav: some View {
        ZStack {
            Text(navTitle)
                .font(.lato(size: 17, weight: .semibold))
                .foregroundStyle(AppTheme.text)
                .tracking(-0.3)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .padding(.horizontal, 80)

            HStack {
                Button("Cancel") { dismiss() }
                    .font(.lato(size: 17, weight: .medium))
                    .foregroundStyle(AppTheme.accent)
                    .buttonStyle(.plain)
                Spacer()
                Button(actionLabel) {
                    onSubmit(makeProperty())
                }
                .font(.lato(size: 17, weight: .semibold))
                .foregroundStyle(canSubmit ? AppTheme.accent : AppTheme.text.opacity(0.36))
                .disabled(!canSubmit)
                .buttonStyle(.plain)
                .animation(.easeOut(duration: 0.12), value: canSubmit)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 8)
    }

    // MARK: - Field row helpers

    @ViewBuilder
    private func formGroup<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(spacing: 0, content: content)
            .background(AppTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .padding(.horizontal, 16)
    }

    private var divider: some View {
        Rectangle()
            .fill(AppTheme.hairline)
            .frame(height: 0.5)
            .padding(.leading, 16)
    }

    private func sectionLabel(_ key: LocalizedStringKey) -> some View {
        Text(key)
            .font(.lato(size: 13, weight: .semibold))
            .kerning(0.6)
            .textCase(.uppercase)
            .foregroundStyle(AppTheme.text.opacity(0.58))
            .padding(.horizontal, 24)
    }

    private func textRow(label: LocalizedStringKey, placeholder: LocalizedStringKey, text: Binding<String>) -> some View {
        HStack(spacing: 12) {
            Text(label)
                .font(.lato(size: 15))
                .foregroundStyle(AppTheme.text.opacity(0.58))
                .frame(width: 120, alignment: .leading)
            TextField(placeholder, text: text)
                .font(.lato(size: 17, weight: .medium))
                .tracking(-0.2)
                .foregroundStyle(AppTheme.text)
                .multilineTextAlignment(.trailing)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 52)
    }

    private func currencyRow(label: LocalizedStringKey, placeholder: LocalizedStringKey, text: Binding<String>) -> some View {
        HStack(spacing: 12) {
            Text(label)
                .font(.lato(size: 15))
                .foregroundStyle(AppTheme.text.opacity(0.58))
                .frame(width: 120, alignment: .leading)
            Spacer()
            Text(Money.symbol(for: appState.currency))
                .font(.lato(size: 15, weight: .medium))
                .foregroundStyle(AppTheme.text.opacity(0.58))
            TextField(placeholder, text: text)
                .font(.lato(size: 17, weight: .medium))
                .tracking(-0.2)
                .foregroundStyle(AppTheme.text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 52)
    }

    private func percentRow(label: LocalizedStringKey, placeholder: LocalizedStringKey, text: Binding<String>) -> some View {
        HStack(spacing: 12) {
            Text(label)
                .font(.lato(size: 15))
                .foregroundStyle(AppTheme.text.opacity(0.58))
                .frame(width: 120, alignment: .leading)
            Spacer()
            TextField(placeholder, text: text)
                .font(.lato(size: 17, weight: .medium))
                .tracking(-0.2)
                .foregroundStyle(AppTheme.text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .frame(width: 80)
            Text("%")
                .font(.lato(size: 15))
                .foregroundStyle(AppTheme.text.opacity(0.58))
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 52)
    }

    private var termRow: some View {
        HStack(spacing: 12) {
            Text("Term")
                .font(.lato(size: 15))
                .foregroundStyle(AppTheme.text.opacity(0.58))
                .frame(width: 120, alignment: .leading)
            Spacer()
            Menu {
                ForEach([15, 20, 30], id: \.self) { years in
                    Button("\(years)-year") { loanTermYears = years }
                }
            } label: {
                HStack(spacing: 6) {
                    Text("\(loanTermYears)-year")
                        .font(.lato(size: 17, weight: .medium))
                        .tracking(-0.2)
                        .foregroundStyle(AppTheme.text)
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.lato(size: 11, weight: .semibold))
                        .foregroundStyle(AppTheme.text.opacity(0.36))
                }
            }
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 52)
    }

    private func dateRow(label: LocalizedStringKey, date: Binding<Date>) -> some View {
        HStack(spacing: 12) {
            Text(label)
                .font(.lato(size: 15))
                .foregroundStyle(AppTheme.text.opacity(0.58))
                .frame(width: 120, alignment: .leading)
            Spacer()
            DatePicker("", selection: date, displayedComponents: [.date])
                .labelsHidden()
                .datePickerStyle(.compact)
                .tint(AppTheme.accent)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 52)
    }

    // MARK: - Units (multifamily)

    private func unitRow(index: Int) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 12) {
                Text("Unit name")
                    .font(.lato(size: 15))
                    .foregroundStyle(AppTheme.text.opacity(0.58))
                    .frame(width: 120, alignment: .leading)
                TextField("e.g. 1A", text: Binding(
                    get: { units[index].name },
                    set: { units[index].name = $0 }
                ))
                .font(.lato(size: 17, weight: .medium))
                .tracking(-0.2)
                .multilineTextAlignment(.trailing)
                Button {
                    units.remove(at: index)
                } label: {
                    Image(systemName: "minus.circle.fill")
                        .font(.lato(size: 18))
                        .foregroundStyle(AppTheme.destructive)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Remove unit")
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 52)

            divider

            HStack(spacing: 12) {
                Text("Rent")
                    .font(.lato(size: 15))
                    .foregroundStyle(AppTheme.text.opacity(0.58))
                    .frame(width: 120, alignment: .leading)
                Spacer()
                Text(Money.symbol(for: appState.currency))
                    .font(.lato(size: 15, weight: .medium))
                    .foregroundStyle(AppTheme.text.opacity(0.58))
                TextField("0", text: Binding(
                    get: { Self.formatCents(units[index].monthlyRent) },
                    set: { newValue in
                        units[index].monthlyRent = parseToUSDCents(newValue)
                    }
                ))
                .font(.lato(size: 17, weight: .medium))
                .tracking(-0.2)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 52)

            divider

            HStack(spacing: 12) {
                Text("Tenant")
                    .font(.lato(size: 15))
                    .foregroundStyle(AppTheme.text.opacity(0.58))
                    .frame(width: 120, alignment: .leading)
                TextField("Optional", text: Binding(
                    get: { units[index].tenantName ?? "" },
                    set: { units[index].tenantName = $0.isEmpty ? nil : $0 }
                ))
                .font(.lato(size: 17, weight: .medium))
                .tracking(-0.2)
                .multilineTextAlignment(.trailing)
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 52)
        }
    }

    private var addUnitRow: some View {
        Button {
            units.append(Unit(name: "Unit \(units.count + 1)", monthlyRent: 0))
        } label: {
            HStack(spacing: 12) {
                ZStack {
                    Circle().fill(AppTheme.text.opacity(0.05))
                        .frame(width: 32, height: 32)
                    Image(systemName: "plus")
                        .font(.lato(size: 13, weight: .semibold))
                        .foregroundStyle(AppTheme.accent)
                }
                Text("Add unit")
                    .font(.lato(size: 17, weight: .medium))
                    .tracking(-0.2)
                    .foregroundStyle(AppTheme.accent)
                Spacer()
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Build Property

    private func makeProperty() -> Property {
        let currency = appState.currency
        let rate = appState.rate(for: currency)

        var mortgage: MortgageInfo? = nil
        if kind.hasMortgage,
           let price = parsedDecimal(purchasePriceText),
           let loan = parsedDecimal(originalLoanText),
           let rateDec = parsedDecimal(interestRateText) {
            mortgage = MortgageInfo(
                purchasePrice: Money.toUSDCents(price, from: currency, rate: rate),
                originalLoan: Money.toUSDCents(loan, from: currency, rate: rate),
                annualInterestRatePercent: rateDec,
                loanTermYears: loanTermYears,
                closingDate: closingDate,
                autoPaySource: autoPaySource.isEmpty ? nil : autoPaySource
            )
        }

        var lease: LeaseInfo? = nil
        if kind == .rental,
           let rent = parsedDecimal(monthlyRentText) {
            let deposit = parsedDecimal(securityDepositText).map {
                Money.toUSDCents($0, from: currency, rate: rate)
            }
            lease = LeaseInfo(
                monthlyRent: Money.toUSDCents(rent, from: currency, rate: rate),
                leaseStart: leaseStart,
                leaseEnd: leaseEnd,
                securityDepositCents: deposit,
                paidWithSource: paidWithSource.isEmpty ? nil : paidWithSource
            )
        }

        // Edits preserve the original property's household; new properties
        // attach to the active one. Falls back to the seeded home household
        // for preview/empty-state safety — the active household should be
        // set whenever this sheet is reachable.
        let householdID = editing?.householdID
            ?? appState.currentHouseholdID
            ?? Household.homeSample.id

        return Property(
            id: editing?.id ?? UUID(),
            householdID: householdID,
            kind: kind,
            address: address.trimmingCharacters(in: .whitespaces),
            nickname: nickname.isEmpty ? nil : nickname,
            mortgage: mortgage,
            lease: lease,
            units: kind == .multifamily ? units : []
        )
    }

    private func parsedDecimal(_ text: String) -> Decimal? {
        let trimmed = text
            .replacingOccurrences(of: ",", with: "")
            .trimmingCharacters(in: .whitespaces)
        return Decimal(string: trimmed)
    }

    /// Nonisolated so it can be passed as `.map(Self.formatCents)` from the
    /// init without the main-actor-isolation diagnostic.
    nonisolated private static func formatCents(_ cents: Int64) -> String {
        guard cents > 0 else { return "" }
        return String(format: "%.2f", Double(cents) / 100.0)
    }

    nonisolated private static func formatPercent(_ d: Decimal) -> String {
        String(format: "%.2f", NSDecimalNumber(decimal: d).doubleValue)
    }

    /// Called from UI bindings on the main actor; matches `Money.toUSDCents`'s
    /// MainActor isolation by default (no annotation).
    private func parseToUSDCents(_ text: String) -> Int64 {
        let trimmed = text
            .replacingOccurrences(of: ",", with: "")
            .trimmingCharacters(in: .whitespaces)
        guard let d = Decimal(string: trimmed), d > 0 else { return 0 }
        return Money.toUSDCents(d,
                                from: appState.currency,
                                rate: appState.rate(for: appState.currency))
    }
}

#Preview("Add primary home · Light") {
    Color.gray.opacity(0.2)
        .ignoresSafeArea()
        .sheet(isPresented: .constant(true)) {
            AddPropertySheet(creating: .primaryHome) { _ in }
                .environment(AppState())
                .presentationBackground(AppTheme.bg)
        }
}

#Preview("Add multifamily · Light") {
    Color.gray.opacity(0.2)
        .ignoresSafeArea()
        .sheet(isPresented: .constant(true)) {
            AddPropertySheet(creating: .multifamily) { _ in }
                .environment(AppState())
                .presentationBackground(AppTheme.bg)
        }
}

#Preview("Add rental · Dark") {
    Color.gray.opacity(0.2)
        .ignoresSafeArea()
        .sheet(isPresented: .constant(true)) {
            AddPropertySheet(creating: .rental) { _ in }
                .environment(AppState())
                .presentationBackground(AppTheme.bg)
        }
        .preferredColorScheme(.dark)
}
