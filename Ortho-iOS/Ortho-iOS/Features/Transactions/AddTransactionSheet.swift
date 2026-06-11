import SwiftUI

/// Modal sheet for adding a transaction (expense or income).
///
/// Design grammar matches AddUserSheet: Cancel · "New transaction" · Add,
/// plain-text actions, Add disabled until valid. The amount is the headline
/// (40pt tabular numerals, leading "$"); direction is a custom segmented
/// control. Owner picker is multi-select — a joint transaction means selecting
/// two (or more) household members, matching `Transaction.ownerIDs: Set<...>`.
struct AddTransactionSheet: View {
    /// When non-nil, the sheet is in "edit" mode — fields pre-fill from this
    /// transaction and submit replaces it (preserving the id). When nil, the
    /// sheet creates a new transaction.
    let editing: Transaction?
    /// When non-nil, the sheet is in "create from copy" mode — fields
    /// pre-fill from this source transaction but submit creates a brand
    /// new row (no id reuse, date = today). Mutually exclusive with
    /// `editing`; `editing` wins if both are passed.
    let copying: Transaction?
    /// `keepOpen == true` when the user chose "Save and add another" so the
    /// parent should NOT dismiss the sheet — we'll reset the form internally
    /// for the next entry. Edit mode ignores the flag (single-tx by nature).
    let onSubmit: (Transaction, _ keepOpen: Bool) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var appState

    /// Personal vs Shared (household) scope of the transaction being edited.
    @State private var scope: TransactionScope
    @State private var kind: TransactionKind
    @State private var amountText: String
    /// Snapshot of `amountText` when the sheet appeared / loaded. If the user
    /// doesn't touch the amount field, we reuse `editing.amount` directly on
    /// Save so FX round-trip rounding never silently shifts the stored cents.
    @State private var originalAmountText: String = ""
    @State private var merchant: String
    @State private var category: TransactionCategory
    @State private var selectedOwners: Set<User.ID>
    /// Per-owner split percentage as user-typed strings. Parsed at submit time.
    /// Only meaningful when `showsSplit` is true.
    @State private var splitPercents: [User.ID: String]
    @State private var source: String
    @State private var date: Date

    /// Drives the "Copy from recent" picker sheet. Add-mode only.
    @State private var showingCopyPicker: Bool = false

    @FocusState private var amountFocused: Bool

    init(editing: Transaction? = nil,
         copying: Transaction? = nil,
         onSubmit: @escaping (Transaction, _ keepOpen: Bool) -> Void) {
        self.editing = editing
        self.copying = copying
        self.onSubmit = onSubmit

        // editing wins over copying if both are passed (defensive — not
        // expected). The prefill source for non-amount fields is the same
        // shape either way; the only difference is the date.
        if let tx = editing ?? copying {
            _scope = State(initialValue: tx.householdID == nil ? .personal : .shared)
            _kind = State(initialValue: tx.kind)
            // Amount text is filled in on appear once we can read appState's
            // currency + rate. Start blank so the first frame doesn't show a
            // USD-formatted value when the user is on a different currency.
            _amountText = State(initialValue: "")
            _merchant = State(initialValue: tx.merchant)
            _category = State(initialValue: tx.category == .income ? .groceries : tx.category)
            _selectedOwners = State(initialValue: tx.ownerIDs)
            _source = State(initialValue: tx.source)
            // Copy mode uses today; edit mode keeps the original date.
            _date = State(initialValue: editing != nil ? tx.date : .now)
            // Pre-fill split strings from the resolved (effective) splits so
            // they survive even when the stored `splits` is nil (even-split).
            let resolved = tx.effectiveSplits
            let mapped = Dictionary(uniqueKeysWithValues:
                resolved.map { ($0.key, Self.formatPercentForField($0.value)) }
            )
            _splitPercents = State(initialValue: mapped)
        } else {
            _scope = State(initialValue: .shared)
            _kind = State(initialValue: .expense)
            _amountText = State(initialValue: "")
            _merchant = State(initialValue: "")
            _category = State(initialValue: .groceries)
            _selectedOwners = State(initialValue: [])
            _splitPercents = State(initialValue: [:])
            // Filled in from appState.cards.first on appear (AppState isn't
            // available in init).
            _source = State(initialValue: "")
            _date = State(initialValue: .now)
        }
    }

    private var isEditing: Bool { editing != nil }
    private var navTitle: LocalizedStringKey { isEditing ? "Edit transaction" : "New transaction" }
    private var actionLabel: LocalizedStringKey { isEditing ? "Save" : "Add" }

    /// 0.5% tolerance so display rounding (e.g. 33.33 + 33.33 + 33.34 = 100)
    /// doesn't block submission.
    private static let splitTolerance: Decimal = 0.5

    /// Income sources stay hardcoded for now — cards are an expense concept.
    private static let incomeSources: [String] = [
        "ACH · Checking", "ACH · Joint", "Wire",
    ]

    /// Expense sources come from the user-managed cards list in AppState.
    private var expenseSources: [String] { appState.cards.map(\.name) }

    /// Non-negative amount parsed from the text field; `nil` if empty or 0.
    private var parsedAmount: Decimal? {
        let cleaned = amountText
            .replacingOccurrences(of: ",", with: "")
            .trimmingCharacters(in: .whitespaces)
        guard let d = Decimal(string: cleaned), d > 0 else { return nil }
        return d
    }

    private var canAdd: Bool {
        guard parsedAmount != nil,
              !merchant.trimmingCharacters(in: .whitespaces).isEmpty
        else { return false }
        if scope == .shared && selectedOwners.isEmpty { return false }
        if showsSplit && !splitIsValid { return false }
        return true
    }

    /// Owners offered in the picker for the current scope. Shared lists
    /// Supabase household members; personal lists the current user plus
    /// any device-only local users so personal expenses can be split
    /// with non-Ortho people (roommates, partners).
    private var availableOwners: [User] {
        scope == .shared ? appState.householdMembers : appState.personalParticipants
    }

    /// Split editor appears for any multi-owner expense, regardless of
    /// scope — personal scope can now include local users, so a split
    /// between you and a roommate (local) is a real case. Income with
    /// multiple owners stays equal-split per the footer caption.
    private var showsSplit: Bool {
        kind == .expense && selectedOwners.count >= 2
    }

    /// Parsed [User.ID: Decimal] of the current splitPercents map, restricted
    /// to currently-selected owners.
    private var parsedSplits: [User.ID: Decimal] {
        var out: [User.ID: Decimal] = [:]
        for id in selectedOwners {
            let raw = (splitPercents[id] ?? "").trimmingCharacters(in: .whitespaces)
            out[id] = Decimal(string: raw) ?? 0
        }
        return out
    }

    private var splitTotal: Decimal {
        parsedSplits.values.reduce(0, +)
    }

    private var splitIsValid: Bool {
        let diff = splitTotal - 100
        let abs = diff >= 0 ? diff : -diff
        return abs <= Self.splitTolerance
    }

    private var merchantLabel: LocalizedStringKey { kind == .income ? "Source" : "Merchant" }
    private var sourceLabel:   LocalizedStringKey { kind == .income ? "Deposit to" : "Paid with" }
    private var sources:       [String] { kind == .income ? Self.incomeSources : expenseSources }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            sheetNav

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Add-mode only: quick-pick from a recent transaction
                    // to pre-fill every field. Speeds up "the usual" entries
                    // (subscriptions, regular merchants).
                    if !isEditing && !appState.transactions.isEmpty {
                        copyFromRecentButton
                    }
                    amountHero
                    scopeToggle
                    directionToggle

                    formGroup {
                        textRow(
                            label: merchantLabel,
                            placeholder: kind == .income ? "e.g. Acme Co. payroll" : "e.g. Whole Foods",
                            text: $merchant
                        )
                        if kind == .expense {
                            divider
                            categoryRow
                        }
                    }

                    formGroup {
                        // Owner picker shows for both scopes now. Shared
                        // picks from Supabase household members; personal
                        // picks from `[you] + local users` so personal
                        // expenses can be split with non-Ortho people
                        // (roommates, partners) tracked locally.
                        if !availableOwners.isEmpty {
                            ownerRow
                            divider
                        }
                        sourceRow
                        divider
                        dateRow
                    }

                    if showsSplit {
                        splitSection
                    }

                    Text(footerCaption)
                        .font(.lato(size: 13))
                        .foregroundStyle(AppTheme.text.opacity(0.36))
                        .lineSpacing(2)
                        .padding(.horizontal, 24)
                        .padding(.top, 4)
                        .padding(.bottom, isEditing ? 24 : 12)
                        .frame(maxWidth: 360, alignment: .leading)

                    // Add-mode only: secondary affordance for batch entry.
                    // Submits the current form and resets it for another
                    // transaction without dismissing the sheet.
                    if !isEditing {
                        saveAndAddAnotherButton
                            .padding(.bottom, 24)
                    }
                }
                .padding(.top, 8)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(AppTheme.bg)
        .onAppear {
            if let tx = editing ?? copying {
                // Both edit and copy pre-fill the amount field in the user's
                // currency. Edit also captures `originalAmountText` so an
                // un-touched amount round-trips through Save without FX
                // drift; copy leaves it empty since the user is creating a
                // brand-new row that should always re-encode.
                let currency = appState.currency
                let rate = appState.rate(for: currency)
                let display = Money.toDisplayAmount(cents: tx.amount,
                                                   in: currency,
                                                   rate: rate)
                let formatted = String(
                    format: "%.\(currency.fractionDigits)f",
                    NSDecimalNumber(decimal: display).doubleValue
                )
                amountText = formatted
                originalAmountText = editing != nil ? formatted : ""
            } else {
                // Add mode: seed default owner(s) + even split + first card.
                if scope == .personal {
                    selectedOwners = [appState.currentUserID]
                } else if selectedOwners.isEmpty, let first = appState.householdMembers.first {
                    selectedOwners = [first.id]
                }
                if source.isEmpty, let firstCard = sources.first {
                    source = firstCard
                }
                resetSplitsToEven()
            }
            // Delay focus so sheet finishes presenting before the keyboard rises.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                amountFocused = true
            }
        }
        .onChange(of: kind) { _, newKind in
            // Keep the source valid when direction flips.
            if !sources.contains(source) { source = sources.first ?? "" }
            // Income's category is locked; if the user came from expense, the
            // stored category may already be valid — fall back to .groceries
            // when flipping back to expense if it's somehow .income.
            if newKind == .expense && category == .income { category = .groceries }
            resetSplitsToEven()
        }
        .onChange(of: selectedOwners) { _, _ in
            resetSplitsToEven()
        }
        .onChange(of: scope) { _, newScope in
            // Drop any owners that aren't valid for the new scope. Shared
            // can't include local users; personal can't include other
            // Supabase members (only you + local users). Defaults to
            // `[currentUserID]` if everything got pruned.
            let validIDs = Set(availableOwners.map(\.id))
            selectedOwners = selectedOwners.intersection(validIDs)
            if selectedOwners.isEmpty {
                selectedOwners = [appState.currentUserID]
            }
            resetSplitsToEven()
        }
        .sheet(isPresented: $showingCopyPicker) {
            CopyTransactionPickerSheet { source in
                prefill(from: source)
            }
            .environment(appState)
            .presentationDetents([.large])
            .presentationBackground(AppTheme.bg)
        }
    }

    /// "Copy from recent" capsule shown at the top of the form in add mode.
    /// Tapping opens `CopyTransactionPickerSheet`; pick a row to pre-fill
    /// every field on this form (with a fresh id + today's date).
    private var copyFromRecentButton: some View {
        HStack {
            Spacer()
            Button {
                showingCopyPicker = true
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "doc.on.doc")
                        .font(.lato(size: 13, weight: .semibold))
                    Text("Copy from recent")
                        .font(.lato(size: 14, weight: .semibold))
                }
                .foregroundStyle(AppTheme.accent)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(
                    Capsule().fill(AppTheme.text.opacity(0.05))
                )
            }
            .buttonStyle(.plain)
            Spacer()
        }
    }

    /// Secondary "Save and add another" capsule rendered below the form.
    /// Hidden when the form isn't valid yet so the user can't tap a
    /// no-op. Visual treatment matches the empty-state CTAs (capsule with
    /// accent text + muted fill) so it feels like a clear power-user
    /// affordance rather than a primary action.
    private var saveAndAddAnotherButton: some View {
        HStack {
            Spacer()
            Button {
                submit(keepOpen: true)
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "plus")
                        .font(.lato(size: 13, weight: .semibold))
                    Text("Save and add another")
                        .font(.lato(size: 15, weight: .semibold))
                }
                .foregroundStyle(canAdd ? AppTheme.accent : AppTheme.text.opacity(0.36))
                .padding(.horizontal, 20)
                .padding(.vertical, 10)
                .background(
                    Capsule().fill(AppTheme.text.opacity(0.05))
                )
            }
            .buttonStyle(.plain)
            .disabled(!canAdd)
            .animation(.easeOut(duration: 0.12), value: canAdd)
            Spacer()
        }
    }

    private var footerCaption: LocalizedStringKey {
        if scope == .personal {
            return "Personal transactions are visible only to you. They don't appear in the household's shared list."
        }
        return kind == .income
            ? "Income shows in sage on the Activity list. Selecting multiple owners attributes shared income to all of them."
            : "Selecting multiple owners marks the transaction as shared."
    }

    private var scopeToggle: some View {
        HStack(spacing: 4) {
            ForEach(TransactionScope.allCases, id: \.self) { s in
                Button {
                    scope = s
                } label: {
                    Text(s == .shared ? "Shared" : "Personal")
                        .font(.lato(size: 14, weight: .semibold))
                        .tracking(-0.1)
                        .foregroundStyle(scope == s ? AppTheme.text : AppTheme.text.opacity(0.58))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .fill(scope == s ? AppTheme.surface : .clear)
                                .shadow(color: scope == s ? .black.opacity(0.06) : .clear,
                                        radius: 2, y: 1)
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(AppTheme.text.opacity(0.05))
        )
        .padding(.horizontal, 16)
        .animation(.easeOut(duration: 0.15), value: scope)
    }

    // MARK: - Sheet nav

    private var sheetNav: some View {
        ZStack {
            Text(navTitle)
                .font(.lato(size: 17, weight: .semibold))
                .foregroundStyle(AppTheme.text)
                .tracking(-0.3)

            HStack {
                Button("Cancel") { dismiss() }
                    .font(.lato(size: 17, weight: .medium))
                    .foregroundStyle(AppTheme.accent)
                    .buttonStyle(.plain)
                Spacer()
                Button(actionLabel) {
                    submit(keepOpen: false)
                }
                .font(.lato(size: 17, weight: .semibold))
                .foregroundStyle(canAdd ? AppTheme.accent : AppTheme.text.opacity(0.36))
                .disabled(!canAdd)
                .buttonStyle(.plain)
                .animation(.easeOut(duration: 0.12), value: canAdd)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 8)
    }

    /// Build a Transaction from the current form state, hand it to the
    /// parent, and either dismiss or reset for another entry. Returns
    /// nothing — both paths run side effects.
    private func submit(keepOpen: Bool) {
        guard let parsed = parsedAmount else { return }
        let cents: Int64
        if let editing, amountText == originalAmountText {
            // User didn't touch the amount field — preserve the stored cents
            // exactly (no FX round-trip drift).
            cents = editing.amount
        } else {
            cents = Money.toUSDCents(parsed,
                                     from: appState.currency,
                                     rate: appState.rate(for: appState.currency))
        }
        // Owners always come straight from the picker. Personal scope's
        // valid set is `[you] + localUsers` (enforced by `availableOwners`
        // + the scope `onChange` that prunes); shared scope's set is the
        // household members. Personal still gets `householdID = nil` so
        // it's not part of any household's shared view.
        let resolvedOwners: Set<User.ID> = selectedOwners
        let resolvedSplits: [User.ID: Decimal]? = showsSplit ? parsedSplits : nil
        let resolvedHousehold: Household.ID? = scope == .personal
            ? nil
            : appState.currentHouseholdID
        let tx = Transaction(
            id: editing?.id ?? UUID(),
            merchant: merchant.trimmingCharacters(in: .whitespaces),
            category: kind == .income ? .income : category,
            kind: kind,
            amount: cents,
            scope: scope,
            ownerIDs: resolvedOwners,
            splits: resolvedSplits,
            source: source,
            date: date,
            householdID: resolvedHousehold,
            createdBy: editing?.createdBy ?? appState.currentUserID
        )
        onSubmit(tx, keepOpen)
        if keepOpen {
            resetFormForAnotherEntry()
        }
    }

    /// Pre-fill every field from an existing transaction (the "copy from
    /// recent" gesture). Always uses today's date — the intent is "make a
    /// similar transaction now," not "duplicate the same one at the same
    /// historical moment." Owner set is intersected with current household
    /// membership so a removed member doesn't get re-added as an owner.
    private func prefill(from source: Transaction) {
        merchant = source.merchant
        kind = source.kind
        if source.kind == .expense {
            category = source.category
        }
        scope = source.householdID == nil ? .personal : .shared
        self.source = source.source
        date = .now

        // Amount: convert stored USD cents into the user's current display
        // currency so the field reads in the same units the rest of the
        // sheet uses.
        let currency = appState.currency
        let rate = appState.rate(for: currency)
        let display = Money.toDisplayAmount(cents: source.amount,
                                            in: currency,
                                            rate: rate)
        let formatted = String(
            format: "%.\(currency.fractionDigits)f",
            NSDecimalNumber(decimal: display).doubleValue
        )
        amountText = formatted
        originalAmountText = ""

        // Owners: intersect with whatever's valid for the current scope
        // so a removed member or local user doesn't pollute the
        // selection. Shared scope checks household membership; personal
        // scope checks `[you] + local users`.
        let validIDs = Set(availableOwners.map(\.id))
        let validOwners = source.ownerIDs.intersection(validIDs)
        selectedOwners = validOwners.isEmpty
            ? [appState.currentUserID]
            : validOwners

        // Split percentages — only meaningful when source had explicit
        // ones AND the resulting owner set is multi-member.
        if let sourceSplits = source.splits, validOwners.count >= 2 {
            splitPercents = Dictionary(uniqueKeysWithValues:
                sourceSplits
                    .filter { validOwners.contains($0.key) }
                    .map { ($0.key, Self.formatPercentForField($0.value)) }
            )
        } else {
            resetSplitsToEven()
        }
    }

    /// After "Save and add another", clear the transaction-specific fields
    /// (merchant, amount, category, splits) and keep the contextual ones
    /// (scope, kind, source, date, owners) — the user is likely batch-entering
    /// related transactions and changing source/date for every one is hostile.
    private func resetFormForAnotherEntry() {
        merchant = ""
        amountText = ""
        originalAmountText = ""
        // Keep income's locked category; reset expense to a neutral default.
        if kind == .expense { category = .groceries }
        // Splits get re-derived from the current owner set on next render via
        // resetSplitsToEven (called from onChange / explicitly here).
        resetSplitsToEven()
        amountFocused = true
    }

    // MARK: - Static formatters (used by init to pre-fill from `editing`)

    private static func formatAmountForField(_ d: Decimal) -> String {
        String(format: "%.2f", NSDecimalNumber(decimal: d).doubleValue)
    }

    private static func formatPercentForField(_ d: Decimal) -> String {
        String(format: "%.2f", NSDecimalNumber(decimal: d).doubleValue)
    }

    // MARK: - Amount hero

    private var amountHero: some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Spacer()
            Text(Money.symbol(for: appState.currency))
                .font(.lato(size: 32, weight: .semibold))
                .foregroundStyle(amountText.isEmpty
                                 ? AppTheme.text.opacity(0.36)
                                 : (kind == .income ? AppTheme.positive : AppTheme.text))
                .tracking(-0.4)
                .lineLimit(1)
                .minimumScaleFactor(0.6)

            TextField(appState.currency.fractionDigits == 0 ? "0" : "0.00", text: $amountText)
                .font(.lato(size: 40, weight: .semibold))
                .tracking(-0.6)
                .monospacedDigit()
                .foregroundStyle(kind == .income ? AppTheme.positive : AppTheme.text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.leading)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .focused($amountFocused)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .animation(.easeOut(duration: 0.12), value: kind)
    }

    // MARK: - Direction toggle

    private var directionToggle: some View {
        HStack(spacing: 4) {
            ForEach(TransactionKind.allCases, id: \.self) { k in
                Button {
                    kind = k
                } label: {
                    Text(k == .income ? "Income" : "Expense")
                        .font(.lato(size: 14, weight: .semibold))
                        .tracking(-0.1)
                        .foregroundStyle(kind == k ? AppTheme.text : AppTheme.text.opacity(0.58))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .fill(kind == k ? AppTheme.surface : .clear)
                                .shadow(color: kind == k ? .black.opacity(0.06) : .clear,
                                        radius: 2, y: 1)
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(AppTheme.text.opacity(0.05))
        )
        .padding(.horizontal, 16)
        .animation(.easeOut(duration: 0.15), value: kind)
    }

    // MARK: - Field rows

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

    private func textRow(label: LocalizedStringKey, placeholder: LocalizedStringKey, text: Binding<String>) -> some View {
        HStack(spacing: 12) {
            Text(label)
                .font(.lato(size: 15))
                .foregroundStyle(AppTheme.text.opacity(0.58))
                .frame(width: 96, alignment: .leading)
            TextField(placeholder, text: text)
                .font(.lato(size: 17, weight: .medium))
                .tracking(-0.2)
                .foregroundStyle(AppTheme.text)
                .multilineTextAlignment(.trailing)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 52)
    }

    /// Multi-select owner row — chips toggle membership in `selectedOwners`.
    /// Horizontally scrollable so it stays a single line as the household
    /// grows past 3-4 members.
    private var ownerRow: some View {
        HStack(alignment: .top, spacing: 12) {
            Text("Owners")
                .font(.lato(size: 15))
                .foregroundStyle(AppTheme.text.opacity(0.58))
                .frame(width: 96, alignment: .leading)
                .padding(.top, 8)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(availableOwners) { u in
                        OwnerChipView(
                            user: u,
                            selected: selectedOwners.contains(u.id),
                            onTap: { toggle(u.id) }
                        )
                    }
                }
                .padding(.vertical, 6)
            }
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 52)
    }

    private func toggle(_ id: User.ID) {
        if selectedOwners.contains(id) {
            // Keep at least one owner — chips can deselect down to one.
            if selectedOwners.count > 1 { selectedOwners.remove(id) }
        } else {
            selectedOwners.insert(id)
        }
    }

    private var categoryRow: some View {
        HStack(spacing: 12) {
            Text("Category")
                .font(.lato(size: 15))
                .foregroundStyle(AppTheme.text.opacity(0.58))
                .frame(width: 96, alignment: .leading)
            Spacer()
            Menu {
                ForEach(TransactionCategory.allCases.filter { $0 != .income }, id: \.self) { c in
                    Button(c.displayName.string) { category = c }
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: category.symbol)
                        .font(.lato(size: 13, weight: .semibold))
                    Text(category.displayName.string)
                        .font(.lato(size: 17, weight: .medium))
                        .tracking(-0.2)
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.lato(size: 11, weight: .semibold))
                        .foregroundStyle(AppTheme.text.opacity(0.36))
                }
                .foregroundStyle(AppTheme.text)
            }
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 52)
    }

    private var sourceRow: some View {
        HStack(spacing: 12) {
            Text(sourceLabel)
                .font(.lato(size: 15))
                .foregroundStyle(AppTheme.text.opacity(0.58))
                .frame(width: 96, alignment: .leading)
            Spacer()
            Menu {
                ForEach(sources, id: \.self) { s in
                    Button(s) { source = s }
                }
            } label: {
                HStack(spacing: 6) {
                    Text(source)
                        .font(.lato(size: 17, weight: .medium))
                        .tracking(-0.2)
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.lato(size: 11, weight: .semibold))
                        .foregroundStyle(AppTheme.text.opacity(0.36))
                }
                .foregroundStyle(AppTheme.text)
            }
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 52)
    }

    private var dateRow: some View {
        HStack(spacing: 12) {
            Text("Date")
                .font(.lato(size: 15))
                .foregroundStyle(AppTheme.text.opacity(0.58))
                .frame(width: 96, alignment: .leading)
            Spacer()
            DatePicker("", selection: $date, displayedComponents: [.date])
                .labelsHidden()
                .datePickerStyle(.compact)
                .tint(AppTheme.accent)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 52)
    }

    // MARK: - Split section

    /// Visible only for multi-owner expenses. One row per selected owner with
    /// an editable percentage; the live total turns sage when it equals 100
    /// and the Add button is gated on the same condition.
    private var splitSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Split")
                    .font(.lato(size: 13, weight: .semibold))
                    .kerning(0.6)
                    .textCase(.uppercase)
                    .foregroundStyle(AppTheme.text.opacity(0.58))
                Spacer()
                Button("Even", action: resetSplitsToEven)
                    .font(.lato(size: 13, weight: .medium))
                    .foregroundStyle(AppTheme.accent)
                    .buttonStyle(.plain)
            }
            .padding(.horizontal, 24)

            let owners = sortedSelectedOwners
            formGroup {
                ForEach(Array(owners.enumerated()), id: \.element.id) { idx, u in
                    splitRow(for: u)
                    if idx < owners.count - 1 { divider }
                }
                divider
                splitTotalRow
            }
        }
    }

    private var sortedSelectedOwners: [User] {
        appState.users
            .filter { selectedOwners.contains($0.id) }
    }

    private func splitRow(for u: User) -> some View {
        HStack(spacing: 12) {
            UserAvatarView(user: u, size: 24)
            Text(u.name)
                .font(.lato(size: 17, weight: .medium))
                .tracking(-0.2)
                .foregroundStyle(AppTheme.text)
            Spacer()
            TextField("0", text: splitBinding(for: u.id))
                .font(.lato(size: 17, weight: .medium))
                .monospacedDigit()
                .multilineTextAlignment(.trailing)
                .keyboardType(.decimalPad)
                .frame(width: 64)
                .foregroundStyle(AppTheme.text)
            Text("%")
                .font(.lato(size: 15))
                .foregroundStyle(AppTheme.text.opacity(0.58))
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 52)
    }

    /// Binding that writes the user-typed string verbatim, then rebalances the
    /// other owners so the total stays at 100. The edited owner's string is
    /// never reformatted mid-typing — so "0.0" doesn't get clobbered into
    /// "0.00" while you're still typing the trailing digit.
    private func splitBinding(for id: User.ID) -> Binding<String> {
        Binding(
            get: { splitPercents[id] ?? "" },
            set: { newValue in
                splitPercents[id] = newValue
                rebalance(after: id)
            }
        )
    }

    private var splitTotalRow: some View {
        HStack(spacing: 12) {
            Text("Total")
                .font(.lato(size: 15))
                .foregroundStyle(AppTheme.text.opacity(0.58))
            Spacer()
            Text(formatPercent(splitTotal))
                .font(.lato(size: 17, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(splitIsValid ? AppTheme.positive : AppTheme.text.opacity(0.58))
            Text("%")
                .font(.lato(size: 15))
                .foregroundStyle(AppTheme.text.opacity(0.58))
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 52)
        .animation(.easeOut(duration: 0.12), value: splitIsValid)
    }

    // MARK: - Split helpers

    /// Reset splitPercents to an even distribution across `selectedOwners`.
    /// The last owner absorbs any rounding remainder so the total is exactly
    /// 100 in the common 3-owner case (33.33 + 33.33 + 33.34).
    private func resetSplitsToEven() {
        let owners = sortedSelectedOwners
        guard !owners.isEmpty else {
            splitPercents = [:]
            return
        }
        let count = owners.count
        let baseTwoDigit = (100.0 / Double(count) * 100).rounded(.down) / 100  // e.g. 33.33
        var totals = Array(repeating: baseTwoDigit, count: count)
        let remainder = 100.0 - baseTwoDigit * Double(count)
        totals[count - 1] += (remainder * 100).rounded() / 100

        var next: [User.ID: String] = [:]
        for (i, u) in owners.enumerated() {
            next[u.id] = String(format: "%.2f", totals[i])
        }
        splitPercents = next
    }

    private func formatPercent(_ d: Decimal) -> String {
        let ns = NSDecimalNumber(decimal: d)
        return String(format: "%.2f", ns.doubleValue)
    }

    /// Distributes the remaining percentage (100 - editedValue) across the
    /// *other* owners. If those owners already have values, the remainder is
    /// split proportionally to their existing weights — so prior manual
    /// adjustments survive subsequent edits. If they're all zero, falls back
    /// to even distribution.
    private func rebalance(after edited: User.ID) {
        let others = sortedSelectedOwners.filter { $0.id != edited }
        guard !others.isEmpty else { return }

        let editedRaw = (splitPercents[edited] ?? "").trimmingCharacters(in: .whitespaces)
        let editedParsed = Decimal(string: editedRaw) ?? 0
        let editedClamped = max(0, min(100, editedParsed))
        let remaining = max(0, 100 - editedClamped)

        let currentValues: [Decimal] = others.map { u in
            let raw = (splitPercents[u.id] ?? "").trimmingCharacters(in: .whitespaces)
            return Decimal(string: raw) ?? 0
        }
        let currentSum = currentValues.reduce(0, +)

        let rawNew: [Decimal]
        if currentSum > 0 {
            rawNew = currentValues.map { ($0 / currentSum) * remaining }
        } else {
            let per = remaining / Decimal(others.count)
            rawNew = Array(repeating: per, count: others.count)
        }

        // Round each to 2dp; absorb rounding error in the last entry so the
        // displayed total is exactly 100 (within representable precision).
        var rounded: [Decimal] = []
        for (i, v) in rawNew.enumerated() {
            if i < rawNew.count - 1 {
                rounded.append(roundedToTwoDecimals(v))
            } else {
                let sumSoFar = rounded.reduce(Decimal(0), +)
                rounded.append(remaining - sumSoFar)
            }
        }

        for (u, v) in zip(others, rounded) {
            splitPercents[u.id] = formatPercent(v)
        }
    }

    private func roundedToTwoDecimals(_ d: Decimal) -> Decimal {
        var src = d
        var dst = Decimal()
        NSDecimalRound(&dst, &src, 2, .plain)
        return dst
    }
}

// MARK: - Owner chip

/// Pill chip with the user's avatar + name. Selected state is a 1.5pt outline
/// in `AppTheme.text` and a slightly stronger background — no brand-color
/// fill swap.
private struct OwnerChipView: View {
    let user: User
    let selected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 6) {
                UserAvatarView(user: user, size: 22)
                Text(user.name)
                    .font(.lato(size: 14, weight: .medium))
                    .tracking(-0.1)
                    .foregroundStyle(AppTheme.text)
            }
            .padding(.leading, 4)
            .padding(.trailing, 10)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(AppTheme.text.opacity(selected ? 0.06 : 0.03))
            )
            .overlay(
                Capsule()
                    .strokeBorder(selected ? AppTheme.text : .clear, lineWidth: 1.5)
            )
            .animation(.easeOut(duration: 0.12), value: selected)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Previews

#Preview("Add Transaction · Light") {
    Color.gray.opacity(0.2)
        .ignoresSafeArea()
        .sheet(isPresented: .constant(true)) {
            AddTransactionSheet { _, _ in }
                .environment(AppState())
                .presentationBackground(AppTheme.bg)
        }
}

#Preview("Add Transaction · Dark") {
    Color.gray.opacity(0.2)
        .ignoresSafeArea()
        .sheet(isPresented: .constant(true)) {
            AddTransactionSheet { _, _ in }
                .environment(AppState())
                .presentationBackground(AppTheme.bg)
        }
        .preferredColorScheme(.dark)
}
