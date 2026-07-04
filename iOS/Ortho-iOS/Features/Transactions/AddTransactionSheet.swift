import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

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
    /// When non-nil, the sheet opens in **Transfer** mode pre-filled from a
    /// "Settle up" action: From = the ower, To = the payer, amount = the owed
    /// cents (editable). Mutually exclusive with `editing`/`copying`.
    let settleUp: SettleUpPrefill?

    /// A Settle-up pre-fill: who owes (from), who's owed (to), and how much.
    struct SettleUpPrefill: Identifiable {
        let from: Person.ID
        let to: Person.ID
        let amountCents: Int64
        var id: String { "\(from.uuidString)-\(to.uuidString)-\(amountCents)" }
    }

    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var appState

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
    /// Only meaningful when `showsSplit` is true and the method is `.percent`.
    @State private var splitPercents: [User.ID: String]
    /// How a multi-owner split is entered: even / by-% / by-amount.
    @State private var splitMethod: SplitMethod = .even
    /// Per-owner amount (display-currency) strings for the `.value` method.
    @State private var splitValues: [User.ID: String] = [:]
    @State private var source: String
    @State private var date: Date

    /// Expense payer (the member who fronted it). Defaults to the current
    /// person on appear; shown as a picker only when the household has >1 member.
    @State private var paidBy: User.ID? = nil
    /// Transfer (reimbursement) parties — sender (ower) → recipient (payer).
    @State private var transferFrom: User.ID? = nil
    @State private var transferTo: User.ID? = nil

    /// Drives the "Copy from recent" picker sheet. Add-mode only.
    @State private var showingCopyPicker: Bool = false

    // MARK: Scan state (spec 014) — the fourth prefill source. The session
    // lives here so it (and all capture data) dies with the sheet (FR-003).
    @State private var scanSession = ScanSession()
    /// Which prefilled fields are inferences; drives the "Guessed" tags.
    @State private var guessedFields: Set<GuessedField> = []
    /// The candidate whose values are currently applied — guess tags clear
    /// when the user's edit moves a field AWAY from the applied value.
    @State private var appliedScan: ParsedCandidate?
    @State private var appliedAmountText: String = ""
    /// The owner set apply() actually wrote (the guess INTERSECTED with
    /// current membership) — the clear-guard must compare against this, not
    /// the raw guess, or apply()'s own mutation strips the tag.
    @State private var appliedOwners: Set<User.ID> = []
    @State private var scanCaptionVisible = false
    /// Resolved "Looks like a duplicate of …" line (receipt path, FR-015).
    @State private var duplicateNote: String?
    @State private var showingDocCamera = false
    @State private var photosPickerPresented = false
    @State private var photoItem: PhotosPickerItem?
    @State private var fileImporterPresented = false
    /// -uiDemoScan fixture already fed through the pipeline (DEBUG demo).
    @State private var demoScanStarted = false

    @FocusState private var amountFocused: Bool

    init(editing: Transaction? = nil,
         copying: Transaction? = nil,
         settleUp: SettleUpPrefill? = nil,
         onSubmit: @escaping (Transaction, _ keepOpen: Bool) -> Void) {
        self.editing = editing
        self.copying = copying
        self.settleUp = settleUp
        self.onSubmit = onSubmit

        // Settle-up: open straight into Transfer mode pre-filled with the owed
        // amount + parties. The amount field is seeded on appear (needs the
        // currency/rate). Wins over copying; editing still wins overall.
        if editing == nil, let s = settleUp {
            _kind = State(initialValue: .transfer)
            _amountText = State(initialValue: "")
            _merchant = State(initialValue: "")
            _category = State(initialValue: .transfer)
            _selectedOwners = State(initialValue: [])
            _splitPercents = State(initialValue: [:])
            _source = State(initialValue: "")
            _date = State(initialValue: .now)
            _transferFrom = State(initialValue: s.from)
            _transferTo = State(initialValue: s.to)
            _paidBy = State(initialValue: nil)
            return
        }

        // editing wins over copying if both are passed (defensive — not
        // expected). The prefill source for non-amount fields is the same
        // shape either way; the only difference is the date.
        if let tx = editing ?? copying {
            _kind = State(initialValue: tx.kind)
            _paidBy = State(initialValue: tx.paidBy)
            // Edit/copy of a transfer keeps its sender (paid_by) and recipient
            // (single owner) so the From→To form re-fills.
            if tx.kind == .transfer {
                _transferFrom = State(initialValue: tx.paidBy)
                _transferTo = State(initialValue: tx.ownerIDs.first)
            }
            // Amount text is filled in on appear once we can read appState's
            // currency + rate. Start blank so the first frame doesn't show a
            // USD-formatted value when the user is on a different currency.
            _amountText = State(initialValue: "")
            _merchant = State(initialValue: tx.merchant)
            // .income is locked to the income kind and .transfer is not a
            // spend category (web's SPEND_CATEGORIES excludes both) — an
            // expense form never carries either.
            _category = State(initialValue: (tx.category == .income || tx.category == .transfer) ? .groceries : tx.category)
            _selectedOwners = State(initialValue: tx.ownerIDs)
            _source = State(initialValue: tx.source)
            // Copy mode uses today; edit mode keeps the original date.
            _date = State(initialValue: editing != nil ? tx.date : .now)
            // Pre-fill split strings from the resolved cents shares as percentages.
            let resolved = tx.effectiveShares
            let mapped = Dictionary(uniqueKeysWithValues:
                resolved.map { ($0.key, Self.formatPercentForField(Decimal(sharePercent($0.value, of: tx.amount)))) }
            )
            _splitPercents = State(initialValue: mapped)
        } else {
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
    private var navTitle: LocalizedStringKey {
        if kind == .transfer {
            if isEditing { return "Edit reimbursement" }
            return settleUp != nil ? "Settle up" : "Reimbursement"
        }
        return isEditing ? "Edit transaction" : "New transaction"
    }
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
        guard parsedAmount != nil else { return false }
        if kind == .transfer {
            // Transfer: amount > 0, both parties chosen, sender ≠ recipient.
            guard let from = transferFrom, let to = transferTo, from != to else { return false }
            return true
        }
        guard !merchant.trimmingCharacters(in: .whitespaces).isEmpty else { return false }
        if selectedOwners.isEmpty { return false }
        if showsSplit && !splitIsValid { return false }
        return true
    }

    /// Whether the "Paid by" picker should appear (expenses, >1 member).
    private var showsPaidBy: Bool {
        kind == .expense && availableOwners.count > 1
    }

    /// The single household people list — every transaction's owners come from here.
    private var availableOwners: [User] {
        appState.householdMembers
    }

    /// Split editor appears for any multi-owner transaction (income or expense).
    private var showsSplit: Bool {
        // Any multi-owner transaction can be split — income too, matching web.
        // `computeShares` is kind-agnostic; only this gate differed.
        selectedOwners.count >= 2
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

    /// The transaction's amount in USD cents (from the entered display amount).
    private var enteredCents: Int64 {
        guard let parsed = parsedAmount else { return 0 }
        return Money.toUSDCents(parsed, from: appState.currency, rate: appState.rate(for: appState.currency))
    }

    /// USD cents parsed from an owner's by-amount field (display currency).
    private func valueCents(_ id: User.ID) -> Int64 {
        let raw = (splitValues[id] ?? "").replacingOccurrences(of: ",", with: "").trimmingCharacters(in: .whitespaces)
        guard let d = Decimal(string: raw), d >= 0 else { return 0 }
        return Money.toUSDCents(d, from: appState.currency, rate: appState.rate(for: appState.currency))
    }

    private var splitValueTotalCents: Int64 {
        sortedSelectedOwners.reduce(0) { $0 + valueCents($1.id) }
    }

    private var splitIsValid: Bool {
        switch splitMethod {
        case .even:
            return true
        case .percent:
            let diff = splitTotal - 100
            let abs = diff >= 0 ? diff : -diff
            return abs <= Self.splitTolerance
        case .value:
            return enteredCents > 0 && splitValueTotalCents == enteredCents
        }
    }

    private var merchantLabel: LocalizedStringKey { kind == .income ? "Source" : "Merchant" }
    private var sourceLabel:   LocalizedStringKey { kind == .income ? "Deposit to" : "Paid with" }
    private var sources:       [String] { kind == .income ? Self.incomeSources : expenseSources }

    var body: some View {
        Group {
            switch scanSession.phase {
            case .interstitial:
                // Statement path: interstitial replaces the form body until
                // Start review (FR-007). Cancel discards the session only —
                // the form underneath is untouched.
                StatementInterstitialView(session: scanSession) {
                    scanSession.reset()
                }
            case .summary:
                ScanSummaryView(session: scanSession) {
                    scanSession.reset()
                    dismiss()
                }
            default:
                formBody
            }
        }
        .onChange(of: scanSession.phase) { _, phase in
            switch phase {
            case .receiptPrefilled:
                if let candidate = scanSession.receiptCandidate { apply(candidate) }
            case .reviewing:
                showingCopyPicker = false
                if let candidate = scanSession.currentCandidate { apply(candidate) }
            case .parsing, .failed, .interstitial:
                // A new capture (or its failure) supersedes any previous scan
                // chrome — never show "Filled from scan" or a stale duplicate
                // line next to the failure copy.
                scanCaptionVisible = false
                duplicateNote = nil
                showingCopyPicker = false
            default:
                break
            }
        }
        .onChange(of: scanSession.cursor) { _, _ in
            guard scanSession.isWizardActive, let candidate = scanSession.currentCandidate else { return }
            apply(candidate)
        }
        .fullScreenCover(isPresented: $showingDocCamera) {
            ScanCameraView { image in
                showingDocCamera = false
                startParse { await scanSession.process(images: [image], context: scanContext(), rescue: scanRescuer()) }
            } onCancel: {
                showingDocCamera = false
            }
        }
        .photosPicker(isPresented: $photosPickerPresented, selection: $photoItem, matching: .images)
        .onChange(of: photoItem) { _, item in
            guard let item else { return }
            photoItem = nil
            startParse {
                let image = (try? await item.loadTransferable(type: Data.self)).flatMap(UIImage.init(data:))
                // No image → empty extraction → .none → the calm failed state.
                await scanSession.process(images: image.map { [$0] } ?? [], context: scanContext(),
                                          rescue: scanRescuer())
            }
        }
        .fileImporter(isPresented: $fileImporterPresented,
                      allowedContentTypes: [.pdf, .image]) { result in
            guard case .success(let url) = result else { return }
            startParse {
                if url.pathExtension.lowercased() == "pdf" {
                    await scanSession.process(pdfAt: url, context: scanContext(), rescue: scanRescuer())
                } else {
                    let scoped = url.startAccessingSecurityScopedResource()
                    let image = (try? Data(contentsOf: url)).flatMap(UIImage.init(data:))
                    if scoped { url.stopAccessingSecurityScopedResource() }
                    await scanSession.process(images: image.map { [$0] } ?? [], context: scanContext(),
                                              rescue: scanRescuer())
                }
            }
        }
    }

    private var formBody: some View {
        VStack(alignment: .leading, spacing: 0) {
            sheetNav

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Add-mode only: quick-pick from a recent transaction
                    // to pre-fill every field, or scan a receipt/statement
                    // (spec 014). Hidden while the wizard drives the form.
                    if !isEditing && !scanSession.isWizardActive {
                        prefillCapsules
                    }
                    if scanSession.phase == .failed {
                        scanFailedView
                    }
                    if scanCaptionVisible && !scanSession.isWizardActive {
                        scanCaption
                    }
                    if let duplicateNote {
                        duplicateNoteView(duplicateNote)
                    }
                    amountHero
                    if let fxNote = convertedFromNote {
                        Text(fxNote)
                            .font(.lato(size: 13))
                            .foregroundStyle(AppTheme.text.opacity(0.36))
                            .frame(maxWidth: .infinity, alignment: .center)
                    }
                    directionToggle

                    if kind == .transfer {
                        transferSection
                        Text(transferFooterCaption)
                            .font(.lato(size: 13))
                            .foregroundStyle(AppTheme.text.opacity(0.36))
                            .lineSpacing(2)
                            .padding(.horizontal, 24)
                            .padding(.top, 4)
                            .padding(.bottom, isEditing ? 24 : 12)
                            .frame(maxWidth: 360, alignment: .leading)
                    } else {
                        formGroup {
                            textRow(
                                label: merchantLabel,
                                placeholder: kind == .income ? "e.g. Acme Co. payroll" : "e.g. Whole Foods",
                                text: $merchant,
                                guessed: guessedFields.contains(.merchant)
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
                            if showsPaidBy {
                                paidByRow
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
                    }

                    // Add-mode only: secondary affordance for batch entry —
                    // or the wizard's Skip while a statement review drives
                    // the form (FR-008).
                    if !isEditing {
                        if scanSession.isWizardActive {
                            wizardSkipButton
                                .padding(.bottom, 24)
                        } else {
                            saveAndAddAnotherButton
                                .padding(.bottom, 24)
                        }
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
                amountText = displayAmountString(cents: tx.amount)
                originalAmountText = editing != nil ? amountText : ""
                // Reopen a custom (non-even) split as a by-value split with the
                // exact stored cents so a no-op re-save preserves it.
                seedSplitFields(amount: tx.amount, ownerIDs: tx.ownerIDs, shares: tx.effectiveShares)
            } else if let s = settleUp {
                // Settle-up: seed the owed amount (editable). Parties already set
                // in init. No owners/source/split for a transfer.
                amountText = displayAmountString(cents: s.amountCents)
                originalAmountText = ""
            } else {
                // Add mode: seed the current person (or first member) + first card.
                if selectedOwners.isEmpty {
                    if let me = appState.currentPersonID {
                        selectedOwners = [me]
                    } else if let first = appState.householdMembers.first {
                        selectedOwners = [first.id]
                    }
                }
                if source.isEmpty, let firstCard = sources.first {
                    source = firstCard
                }
                // Default the expense payer to the current person.
                if paidBy == nil {
                    paidBy = appState.currentPersonID ?? appState.householdMembers.first?.id
                }
                // Default transfer parties (used if the user flips to Transfer).
                seedDefaultTransferParties()
                resetSplitsToEven()
            }
            // Delay focus so sheet finishes presenting before the keyboard
            // rises. formBody re-appears when the wizard replaces the
            // interstitial — only the pristine first appearance should focus
            // (a keyboard over a prefilled wizard row hides the review).
            // Demo-scan screenshots keep the keyboard down entirely.
            var autoFocus = scanSession.phase == .idle
            #if DEBUG
            if appState.uiDemoScanFixture != nil { autoFocus = false }
            startDemoScanIfNeeded()
            #endif
            if autoFocus {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                    amountFocused = true
                }
            }
        }
        .onChange(of: kind) { _, newKind in
            if newKind == .transfer {
                // Transfer has no source/category/owners/split — just seed the
                // From→To parties if not already chosen.
                seedDefaultTransferParties()
                return
            }
            // Keep the source valid when direction flips.
            if !sources.contains(source) { source = sources.first ?? "" }
            // Income's category is locked; expense can't carry .income/.transfer.
            if newKind == .expense && (category == .income || category == .transfer) {
                category = .groceries
            }
            resetSplitsToEven()
        }
        .onChange(of: selectedOwners) { _, newOwners in
            resetSplitsToEven()
            if guessedFields.contains(.owners), newOwners != appliedOwners {
                guessedFields.remove(.owners)
            }
        }
        // Guess tags clear the moment an edit moves a field away from the
        // scan-applied value (FR-016) — value comparison, not event order,
        // so the apply() mutations themselves never clear anything.
        .onChange(of: merchant) { _, newValue in
            if guessedFields.contains(.merchant), newValue != appliedScan?.merchant {
                guessedFields.remove(.merchant)
            }
            // Typing past a failed scan dismisses the quiet failure block.
            if scanSession.phase == .failed, !newValue.isEmpty {
                scanSession.retake()
            }
        }
        .onChange(of: category) { _, newValue in
            if guessedFields.contains(.category), newValue != appliedScan?.categoryGuess {
                guessedFields.remove(.category)
            }
        }
        .onChange(of: amountText) { _, newValue in
            if newValue != appliedAmountText {
                guessedFields.remove(.currency)
                guessedFields.remove(.amount)
            }
        }
        .onChange(of: date) { _, newValue in
            guard guessedFields.contains(.date), let applied = appliedScan?.date else { return }
            let day = Calendar.current.dateComponents([.year, .month, .day], from: newValue)
            // Field-wise comparison — DateComponents == is stricter than
            // "same calendar day" (calendar/isLeapMonth defaults differ).
            if day.year != applied.year || day.month != applied.month || day.day != applied.day {
                guessedFields.remove(.date)
            }
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

    /// Prefill capsule row (add mode): "Copy from recent" + "Scan" (spec 014).
    /// Scanning is an input method for THIS form, not a destination — the
    /// fourth prefill source alongside copy/settle-up (FR-001).
    private var prefillCapsules: some View {
        HStack(spacing: 10) {
            Spacer()
            if !appState.transactions.isEmpty {
                copyFromRecentButton
            }
            // No Scan in a settle-up sheet: a scan prefill would silently
            // flip the pre-seeded Transfer into an expense (US1 scope).
            if settleUp == nil {
                scanCapsule
            }
            Spacer()
        }
    }

    /// "Copy from recent" capsule. Tapping opens `CopyTransactionPickerSheet`;
    /// pick a row to pre-fill every field (fresh id + today's date).
    private var copyFromRecentButton: some View {
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
    }

    /// "Scan" capsule → Camera / Photo Library / Choose File (FR-002).
    /// Shows a quiet "Reading…" state while the on-device parse runs.
    private var scanCapsule: some View {
        Menu {
            Button {
                scanSession.lastSource = .camera
                showingDocCamera = true
            } label: {
                Label("Camera", systemImage: "camera")
            }
            Button {
                scanSession.lastSource = .photoLibrary
                photosPickerPresented = true
            } label: {
                Label("Photo Library", systemImage: "photo.on.rectangle")
            }
            Button {
                scanSession.lastSource = .file
                fileImporterPresented = true
            } label: {
                Label("Choose File", systemImage: "folder")
            }
        } label: {
            HStack(spacing: 8) {
                if scanSession.phase == .parsing {
                    ProgressView()
                        .controlSize(.small)
                    Text("Reading…")
                        .font(.lato(size: 14, weight: .semibold))
                } else {
                    Image(systemName: "doc.viewfinder")
                        .font(.lato(size: 13, weight: .semibold))
                    Text("Scan")
                        .font(.lato(size: 14, weight: .semibold))
                }
            }
            .foregroundStyle(AppTheme.accent)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(
                Capsule().fill(AppTheme.text.opacity(0.05))
            )
        }
        .buttonStyle(.plain)
        .disabled(scanSession.phase == .parsing)
        .accessibilityLabel("Scan")
    }

    /// Quiet caption after a receipt prefill (contract §Receipt path).
    private var scanCaption: some View {
        Text("Filled from scan — review before adding")
            .font(.lato(size: 13))
            .foregroundStyle(AppTheme.text.opacity(0.58))
            .frame(maxWidth: .infinity, alignment: .center)
    }

    /// Calm failure state: quiet copy + Retake, no red, form untouched
    /// (FR-017). Retake reopens the last-used source.
    private var scanFailedView: some View {
        VStack(spacing: 10) {
            Text("Couldn't read this. Try a flatter, brighter photo.")
                .font(.lato(size: 13))
                .foregroundStyle(AppTheme.text.opacity(0.58))
                .multilineTextAlignment(.center)
            Button {
                scanSession.retake()
                switch scanSession.lastSource {
                case .camera, nil: showingDocCamera = true
                case .photoLibrary: photosPickerPresented = true
                case .file: fileImporterPresented = true
                }
            } label: {
                Text("Retake")
                    .font(.lato(size: 14, weight: .semibold))
                    .foregroundStyle(AppTheme.accent)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(Capsule().fill(AppTheme.text.opacity(0.05)))
            }
            .buttonStyle(.plain)
            #if DEBUG
            // Dev-only, deliberately unlocalized (verbatim): shows what OCR
            // extracted so a failing real-world capture can be debugged on
            // the device itself and turned into a fixture.
            if let debugText = scanDebugText {
                DisclosureGroup {
                    ScrollView {
                        Text(verbatim: debugText)
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundStyle(AppTheme.text.opacity(0.58))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .textSelection(.enabled)
                    }
                    .frame(maxHeight: 160)
                } label: {
                    Text(verbatim: "What the scan read (debug)")
                        .font(.lato(size: 12))
                        .foregroundStyle(AppTheme.text.opacity(0.44))
                }
                .tint(AppTheme.text.opacity(0.44))
                .padding(.horizontal, 24)
            }
            #endif
        }
        .frame(maxWidth: .infinity)
    }

    #if DEBUG
    /// The extractor's view of the failed capture — lines, then table rows.
    private var scanDebugText: String? {
        guard let document = scanSession.lastDocument, !document.isEmpty else { return nil }
        let lineTexts = document.pages.flatMap { $0.lines.map(\.text) }
        let tableTexts = document.pages
            .flatMap(\.tables)
            .flatMap { $0.rows.map { $0.joined(separator: " | ") } }
        return (lineTexts + tableTexts).joined(separator: "\n")
    }
    #endif

    /// One calm inline line — informational, never blocking (FR-015).
    private func duplicateNoteView(_ note: String) -> some View {
        Text(note)
            .font(.lato(size: 13))
            .foregroundStyle(AppTheme.text.opacity(0.58))
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.horizontal, 24)
    }

    /// FX note under the amount hero when a foreign total was converted
    /// through the existing rates (FR-014).
    private var convertedFromNote: String? {
        guard guessedFields.contains(.currency),
              let scan = appliedScan,
              scan.currency != .usd,
              let original = scan.originalAmount else { return nil }
        let amount = String(format: "%.\(scan.currency.fractionDigits)f",
                            NSDecimalNumber(decimal: original).doubleValue)
        // Localizer.tr, not String(localized:) — the in-app language picker
        // never changes Locale.current/bundle prefs (see Localizer.swift).
        return Localizer.tr("Converted from \(scan.currency.code) \(amount)")
    }

    /// Tiny text3 "Guessed" tag under a field label (FR-016).
    private var guessedTag: some View {
        Text("Guessed")
            .font(.lato(size: 11))
            .foregroundStyle(AppTheme.text.opacity(0.36))
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
        if selectedOwners.count >= 2 {
            return "Split this transaction between its owners below — evenly, by percentage, or by amount."
        }
        return "Pick more than one owner to split this transaction."
    }

    private var transferFooterCaption: LocalizedStringKey {
        "A reimbursement records one member paying another back. It doesn't count as spending or income."
    }

    /// Format USD cents as a display-currency string for the amount field.
    private func displayAmountString(cents: Int64) -> String {
        let currency = appState.currency
        let rate = appState.rate(for: currency)
        let display = Money.toDisplayAmount(cents: cents, in: currency, rate: rate)
        return String(format: "%.\(currency.fractionDigits)f",
                      NSDecimalNumber(decimal: display).doubleValue)
    }

    /// Seed transfer From/To when not yet chosen: From = current person (or
    /// first member), To = the first *other* member.
    private func seedDefaultTransferParties() {
        let members = availableOwners
        guard !members.isEmpty else { return }
        let me = appState.currentPersonID ?? members.first?.id
        if transferFrom == nil { transferFrom = me }
        if transferTo == nil {
            transferTo = members.first(where: { $0.id != transferFrom })?.id
        }
    }

    // MARK: - Sheet nav

    private var sheetNav: some View {
        ZStack {
            if scanSession.isWizardActive {
                // Wizard progress header replaces the title (FR-008).
                Text("\(scanSession.cursor + 1) of \(scanSession.queue.count)")
                    .font(.lato(size: 17, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(AppTheme.text.opacity(0.58))
                    .tracking(-0.3)
            } else {
                Text(navTitle)
                    .font(.lato(size: 17, weight: .semibold))
                    .foregroundStyle(AppTheme.text)
                    .tracking(-0.3)
            }

            HStack {
                if scanSession.isWizardActive {
                    // Stop is always available; rows already added stay.
                    Button("Stop") { scanSession.stop() }
                        .font(.lato(size: 17, weight: .medium))
                        .foregroundStyle(AppTheme.accent)
                        .buttonStyle(.plain)
                } else {
                    Button("Cancel") { dismiss() }
                        .font(.lato(size: 17, weight: .medium))
                        .foregroundStyle(AppTheme.accent)
                        .buttonStyle(.plain)
                }
                Spacer()
                if scanSession.isWizardActive {
                    Button(scanSession.isLastRow ? "Add and finish" : "Add and next") {
                        submitWizardRow()
                    }
                    .font(.lato(size: 17, weight: .semibold))
                    .foregroundStyle(canAdd ? AppTheme.accent : AppTheme.text.opacity(0.36))
                    .disabled(!canAdd)
                    .buttonStyle(.plain)
                    .animation(.easeOut(duration: 0.12), value: canAdd)
                } else {
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
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 8)
    }

    /// Noon UTC of the picked LOCAL calendar day — the cross-surface storage
    /// convention (spec 004; web is adopting the same). The picker binds a
    /// wall-clock `Date`, so saving it verbatim lands evening entries on the
    /// NEXT UTC day; noon UTC renders as the same calendar day in every
    /// timezone, for storage and grouping alike.
    private static func noonUTC(ofLocalDay date: Date) -> Date {
        var comps = Calendar.current.dateComponents([.year, .month, .day], from: date)
        comps.hour = 12
        comps.minute = 0
        comps.second = 0
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        return utc.date(from: comps) ?? date
    }

    /// Build a Transaction from the current form state and hand it to the
    /// parent; either dismisses (parent) or resets for another entry.
    private func submit(keepOpen: Bool) {
        guard let tx = buildTransaction() else { return }
        onSubmit(tx, keepOpen)
        if keepOpen { resetFormForAnotherEntry() }
    }

    /// One wizard row: exactly one pass through the existing optimistic add
    /// (FR-009 — keepOpen so the parent never dismisses mid-wizard), then
    /// advance. The next row is applied by the cursor onChange; the last row
    /// flips the session to .summary.
    private func submitWizardRow() {
        guard let tx = buildTransaction() else { return }
        onSubmit(tx, true)
        scanSession.acceptCurrent()
    }

    /// Wizard secondary action: leave this row out and move on (FR-008).
    private var wizardSkipButton: some View {
        HStack {
            Spacer()
            Button {
                scanSession.skipCurrent()
            } label: {
                Text("Skip")
                    .font(.lato(size: 15, weight: .semibold))
                    .foregroundStyle(AppTheme.accent)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
                    .background(Capsule().fill(AppTheme.text.opacity(0.05)))
            }
            .buttonStyle(.plain)
            Spacer()
        }
    }

    /// The current form state as a Transaction, or nil while invalid. The
    /// single construction path for Add, Save-and-add-another, and every
    /// wizard row — scanning never gets its own save shape (FR-006).
    private func buildTransaction() -> Transaction? {
        guard let parsed = parsedAmount else { return nil }
        // Normalize the picked day once for both the transfer and the
        // expense/income paths (create and edit alike).
        let txDate = Self.noonUTC(ofLocalDay: date)
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

        // Transfer (reimbursement) builds the reused-share row shape: paid_by =
        // sender, owner_ids = [recipient], shares = { recipient: amount },
        // category = transfer. No merchant/source/category/split. Never routes
        // through computeShares/validateSplit. Bypassed entirely by the balance
        // math except via balanceBetween.
        if kind == .transfer {
            guard let from = transferFrom, let to = transferTo, from != to else { return nil }
            return Transaction(
                id: editing?.id ?? UUID(),
                merchant: "",
                category: .transfer,
                kind: .transfer,
                amount: cents,
                ownerIDs: [to],
                shares: [to: cents],
                source: "",
                date: txDate,
                householdID: appState.currentHouseholdID,
                createdBy: editing?.createdBy ?? appState.currentUserID,
                paidBy: from
            )
        }

        // Owners in canonical order (shared `orderedOwnerIds`); shares are exact
        // cents derived from the per-owner percentages (even when one owner takes all).
        let owners = orderedOwnerIds(Array(selectedOwners))
        var split: SplitInput<Person.ID> = .even
        if showsSplit && splitIsValid {
            switch splitMethod {
            case .even:
                split = .even
            case .percent:
                split = .percent(Dictionary(uniqueKeysWithValues: parsedSplits.map { ($0.key, NSDecimalNumber(decimal: $0.value).doubleValue) }))
            case .value:
                split = .value(Dictionary(uniqueKeysWithValues: owners.map { ($0, valueCents($0)) }))
            }
        }
        let shares = computeShares(cents, owners, split)
        // Expense payer defaults to the current person when not chosen; income
        // carries no payer.
        let resolvedPaidBy: Person.ID? = kind == .expense
            ? (paidBy ?? appState.currentPersonID)
            : nil
        return Transaction(
            id: editing?.id ?? UUID(),
            merchant: merchant.trimmingCharacters(in: .whitespaces),
            category: kind == .income ? .income : category,
            kind: kind,
            amount: cents,
            ownerIDs: selectedOwners,
            shares: shares,
            source: source,
            date: txDate,
            householdID: appState.currentHouseholdID,
            createdBy: editing?.createdBy ?? appState.currentUserID,
            paidBy: resolvedPaidBy
        )
    }

    /// Pre-fill every field from an existing transaction (the "copy from
    /// recent" gesture). Always uses today's date — the intent is "make a
    /// similar transaction now," not "duplicate the same one at the same
    /// historical moment." Owner set is intersected with current household
    /// membership so a removed member doesn't get re-added as an owner.
    /// Seed the by-value split fields from stored per-owner cents so a custom
    /// (non-even) split edit/copy round-trips losslessly — no silent
    /// re-even-split on save. No-op for an even split (the editor keeps `.even`).
    /// Owner order matches submit's canonical `orderedOwnerIds` sort so the
    /// even-comparison is exact. Mirrors web's seedSplit-driven form seeding.
    private func seedSplitFields(amount: Int64, ownerIDs: Set<User.ID>, shares: [User.ID: Int64]) {
        let owners = orderedOwnerIds(Array(ownerIDs))
        guard owners.count >= 2 else { return }
        guard case .value(let values) = seedSplit(amount, owners, shares) else { return }
        let currency = appState.currency
        let rate = appState.rate(for: currency)
        var seeded: [User.ID: String] = [:]
        for id in owners {
            let disp = Money.toDisplayAmount(cents: values[id] ?? 0, in: currency, rate: rate)
            seeded[id] = String(format: "%.\(currency.fractionDigits)f",
                                NSDecimalNumber(decimal: disp).doubleValue)
        }
        splitMethod = .value
        splitValues = seeded
    }

    private func prefill(from source: Transaction) {
        kind = source.kind
        date = .now
        amountText = displayAmountString(cents: source.amount)
        originalAmountText = ""
        // A copy prefill supersedes any scan prefill state.
        scanCaptionVisible = false
        duplicateNote = nil
        guessedFields = []
        appliedScan = nil

        // Transfer copy: carry over the sender/recipient (validated against
        // current membership) and nothing else.
        if source.kind == .transfer {
            let validIDs = Set(availableOwners.map(\.id))
            transferFrom = source.paidBy.flatMap { validIDs.contains($0) ? $0 : nil }
            transferTo = source.ownerIDs.first.flatMap { validIDs.contains($0) ? $0 : nil }
            seedDefaultTransferParties()
            return
        }

        merchant = source.merchant
        if source.kind == .expense {
            // Same sanitizing as edit-mode init: neither .income nor .transfer
            // is a valid expense category.
            category = (source.category == .income || source.category == .transfer)
                ? .groceries : source.category
            // Carry over the payer if it's still a valid member; else default.
            let validIDs = Set(availableOwners.map(\.id))
            paidBy = source.paidBy.flatMap { validIDs.contains($0) ? $0 : nil }
                ?? appState.currentPersonID
        }
        self.source = source.source

        // Owners: intersect with whatever's valid for the current scope
        // so a removed member or local user doesn't pollute the
        // selection. Shared scope checks household membership; personal
        // scope checks `[you] + local users`.
        let validIDs = Set(availableOwners.map(\.id))
        let validOwners = source.ownerIDs.intersection(validIDs)
        let fallback = appState.currentPersonID.map { Set([$0]) } ?? []
        selectedOwners = validOwners.isEmpty ? fallback : validOwners

        // Split percentages — derived from the source's cents shares when the
        // resulting owner set is multi-member.
        if validOwners.count >= 2 {
            let shares = source.effectiveShares
            splitPercents = Dictionary(uniqueKeysWithValues:
                validOwners.map { ($0, Self.formatPercentForField(Decimal(sharePercent(shares[$0] ?? 0, of: source.amount)))) }
            )
            // Preserve a custom split exactly (by-value), not just its rounded
            // percentages, so the copy round-trips losslessly.
            seedSplitFields(amount: source.amount, ownerIDs: validOwners, shares: shares)
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
        // A new manual entry is no longer "filled from scan".
        scanCaptionVisible = false
        duplicateNote = nil
        guessedFields = []
        appliedScan = nil
    }

    // MARK: - Scan prefill (spec 014)

    /// Apply a parsed candidate to the form — the same fields the user would
    /// type, through the same state, gated by the same validation (FR-006).
    /// Guess tags are cleared later per field when an edit moves the value
    /// AWAY from what was applied (FR-016).
    private func apply(_ candidate: ParsedCandidate) {
        appliedScan = candidate
        guessedFields = candidate.guesses
        duplicateNote = nil

        kind = candidate.direction == .credit ? .income : .expense
        // The onChange(of: kind) source fixup can't be relied on here — the
        // first wizard row applies while formBody is unmounted (interstitial
        // → reviewing), so re-establish source validity directly.
        if !sources.contains(source) { source = sources.first ?? "" }
        merchant = candidate.merchant
        if kind == .expense {
            if let guess = candidate.categoryGuess, guess != .income, guess != .transfer {
                category = guess
            } else {
                category = .groceries
                guessedFields.remove(.category)
            }
        }
        // Parsed calendar day → the picker's local Date; the existing
        // noon-UTC convention applies on save (FR-019). No parsed date:
        // wizard rows reset to today (fresh row), the receipt path leaves
        // whatever the user already picked — never a fabricated date.
        if let day = candidate.date, let parsed = Calendar.current.date(from: day) {
            date = parsed
        } else if scanSession.isWizardActive {
            date = .now
        }

        // Amount: USD cents directly, or a foreign total converted through
        // the existing rates — never foreign-as-USD (FR-014). A foreign
        // candidate missing originalAmount (belt-and-braces — the parser
        // always sets it) derives it from the minor units.
        if candidate.currency == .usd {
            amountText = displayAmountString(cents: candidate.amountCents)
        } else {
            let original = candidate.originalAmount
                ?? Decimal(candidate.amountCents) / pow(Decimal(10), candidate.currency.fractionDigits)
            let usdCents = Money.toUSDCents(original,
                                            from: candidate.currency,
                                            rate: appState.rate(for: candidate.currency))
            amountText = displayAmountString(cents: usdCents)
        }
        originalAmountText = ""
        appliedAmountText = amountText

        // Owners: history guess intersected with current membership; a fully
        // invalid guess (departed members) falls back to the default single
        // owner in the wizard — never a stale carry-over from the prior row.
        let validIDs = Set(availableOwners.map(\.id))
        let guessedOwners = candidate.ownersGuess.map { Set($0).intersection(validIDs) } ?? []
        if !guessedOwners.isEmpty {
            selectedOwners = guessedOwners
        } else {
            guessedFields.remove(.owners)
            if scanSession.isWizardActive, let me = appState.currentPersonID {
                selectedOwners = [me]
            }
        }
        appliedOwners = selectedOwners
        if paidBy == nil {
            paidBy = appState.currentPersonID ?? appState.householdMembers.first?.id
        }
        resetSplitsToEven()

        // Receipt duplicate line (the wizard pre-skips instead, FR-015).
        if !scanSession.isWizardActive, let dupID = candidate.duplicateOf,
           let dup = appState.transactions.first(where: { $0.id == dupID }) {
            let name = dup.merchant.isEmpty ? dup.source : dup.merchant
            let day = dup.date.formatted(.dateTime.month(.abbreviated).day()
                .locale(Localizer.currentLocale))
            duplicateNote = Localizer.tr("Looks like a duplicate of \(name), \(day) — add anyway?")
        }
        scanCaptionVisible = !scanSession.isWizardActive
    }

    /// Snapshot the world into a pure ScanContext at the pipeline boundary.
    /// Under -uiDemoScan the reference date is fixed for determinism.
    private func scanContext() -> ScanContext {
        #if DEBUG
        if appState.uiDemoScanFixture != nil {
            return ScanInference.buildContext(transactions: appState.transactions,
                                              defaultCurrency: .usd,
                                              calendar: .current,
                                              now: AppState.uiDemoScanReferenceDate)
        }
        #endif
        return ScanInference.buildContext(transactions: appState.transactions,
                                          defaultCurrency: .usd,
                                          calendar: .current,
                                          now: Date())
    }

    /// Whether the on-device refiner may run: capable hardware, and never in
    /// demo/CI (screenshots must be deterministic — contracts/uidemo-scan.md).
    private var scanRefinementEnabled: Bool {
        #if DEBUG
        if appState.uiDemoScanFixture != nil { return false }
        #endif
        return ScanRefiner.isAvailable
    }

    /// The on-device extraction rescue for parses the deterministic tiers
    /// couldn't crack — nil whenever refinement is off, so the session's
    /// pipeline stays fully deterministic in demo/CI.
    private func scanRescuer() -> ScanSession.Rescue? {
        guard scanRefinementEnabled else { return nil }
        let context = scanContext()
        return { document in await ScanRefiner.rescue(document, context: context) }
    }

    private func startParse(_ operation: @escaping () async -> Void) {
        Task {
            await operation()
            guard scanRefinementEnabled, scanSession.phase == .receiptPrefilled,
                  let candidate = scanSession.receiptCandidate,
                  let refined = await ScanRefiner.refineReceipt(candidate) else { return }
            // Refinement is polish, not truth: if the user already touched
            // the form after the heuristic prefill, their edits win —
            // re-applying would clobber them and resurrect cleared tags.
            let untouched = scanSession.phase == .receiptPrefilled
                && merchant == candidate.merchant
                && amountText == appliedAmountText
                && selectedOwners == appliedOwners
            if untouched { apply(refined) }
        }
    }

    #if DEBUG
    /// -uiDemoScan: feed the named bundled fixture through the REAL pipeline
    /// against the demo store (contracts/uidemo-scan.md). Step "row"/"summary"
    /// advances the statement flow for screenshots.
    private func startDemoScanIfNeeded() {
        guard let fixture = appState.uiDemoScanFixture, !demoScanStarted else { return }
        demoScanStarted = true
        let bundle = Bundle.main
        let pdf = bundle.url(forResource: fixture, withExtension: "pdf", subdirectory: "ScanFixtures")
            ?? bundle.url(forResource: fixture, withExtension: "pdf")
        let png = bundle.url(forResource: fixture, withExtension: "png", subdirectory: "ScanFixtures")
            ?? bundle.url(forResource: fixture, withExtension: "png")
        guard pdf != nil || png != nil else {
            assertionFailure("-uiDemoScan: unknown fixture '\(fixture)'")
            return
        }
        Task {
            if let pdf {
                await scanSession.process(pdfAt: pdf, context: scanContext())
            } else if let png, let image = UIImage(contentsOfFile: png.path) {
                await scanSession.process(images: [image], context: scanContext())
            }
            switch appState.uiDemoScanStep {
            case "row":
                if scanSession.phase == .interstitial { scanSession.startReview() }
            case "summary":
                // The form applies rows asynchronously, so a synchronous
                // auto-accept builds each row's transaction directly from
                // its candidate (demo store only — screenshots of the
                // summary, contracts/uidemo-scan.md).
                if scanSession.phase == .interstitial {
                    scanSession.startReview()
                    while let candidate = scanSession.currentCandidate {
                        appState.addTransaction(demoTransaction(from: candidate))
                        scanSession.acceptCurrent()
                    }
                }
            default:
                break
            }
        }
    }

    private func demoTransaction(from candidate: ParsedCandidate) -> Transaction {
        let me = appState.currentPersonID ?? appState.householdMembers.first?.id
        let owners: Set<Person.ID> = me.map { [$0] } ?? []
        let day = candidate.date.flatMap { Calendar.current.date(from: $0) } ?? .now
        let isCredit = candidate.direction == .credit
        // Same FX rule as apply(): foreign minor units are never stored as
        // USD cents directly (FR-014).
        let cents: Int64
        if candidate.currency == .usd {
            cents = candidate.amountCents
        } else {
            let original = candidate.originalAmount
                ?? Decimal(candidate.amountCents) / pow(Decimal(10), candidate.currency.fractionDigits)
            cents = Money.toUSDCents(original,
                                     from: candidate.currency,
                                     rate: appState.rate(for: candidate.currency))
        }
        return Transaction(
            merchant: candidate.merchant,
            category: isCredit ? .income : (candidate.categoryGuess ?? .groceries),
            kind: isCredit ? .income : .expense,
            amount: cents,
            ownerIDs: owners,
            shares: me.map { [$0: cents] } ?? [:],
            source: appState.cards.first?.name ?? "",
            date: Self.noonUTC(ofLocalDay: day),
            householdID: appState.currentHouseholdID,
            createdBy: appState.currentUserID,
            paidBy: isCredit ? nil : me
        )
    }
    #endif

    // MARK: - Static formatters (used by init to pre-fill from `editing`)

    private static func formatAmountForField(_ d: Decimal) -> String {
        String(format: "%.2f", NSDecimalNumber(decimal: d).doubleValue)
    }

    private static func formatPercentForField(_ d: Decimal) -> String {
        String(format: "%.2f", NSDecimalNumber(decimal: d).doubleValue)
    }

    // MARK: - Amount hero

    private var amountHero: some View {
        VStack(spacing: 2) {
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
            // The forgiving fallback / rescue tiers guess the amount itself
            // (no labeled total) — the money hero says so (FR-016).
            if guessedFields.contains(.amount) { guessedTag }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .animation(.easeOut(duration: 0.12), value: kind)
    }

    // MARK: - Direction toggle

    private static func kindLabel(_ k: TransactionKind) -> LocalizedStringKey {
        switch k {
        case .expense:  return "Expense"
        case .income:   return "Income"
        case .transfer: return "Transfer"
        }
    }

    /// Segments offered. Editing a transfer stays a transfer (and vice versa) —
    /// the two row shapes aren't interchangeable. Add/settle-up offer all
    /// three; wizard rows are credits/debits only — flippable, never
    /// transfers (FR-011/FR-012).
    private var directionOptions: [TransactionKind] {
        if scanSession.isWizardActive { return [.expense, .income] }
        guard let tx = editing else { return TransactionKind.allCases }
        return tx.kind == .transfer ? [.transfer] : [.expense, .income]
    }

    private var directionToggle: some View {
        HStack(spacing: 4) {
            ForEach(directionOptions, id: \.self) { k in
                Button {
                    kind = k
                } label: {
                    Text(Self.kindLabel(k))
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

    private func textRow(label: LocalizedStringKey, placeholder: LocalizedStringKey,
                         text: Binding<String>, guessed: Bool = false) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.lato(size: 15))
                    .foregroundStyle(AppTheme.text.opacity(0.58))
                if guessed { guessedTag }
            }
            .frame(width: 96, alignment: .leading)
            .accessibilityElement(children: .combine)
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
            VStack(alignment: .leading, spacing: 2) {
                Text("Owners")
                    .font(.lato(size: 15))
                    .foregroundStyle(AppTheme.text.opacity(0.58))
                if guessedFields.contains(.owners) { guessedTag }
            }
            .frame(width: 96, alignment: .leading)
            .padding(.top, 8)
            .accessibilityElement(children: .combine)
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

    /// "Paid by" member picker for expenses (shown only when >1 member). The
    /// member who fronted the expense; defaults to the current person.
    private var paidByRow: some View {
        HStack(spacing: 12) {
            Text("Paid by")
                .font(.lato(size: 15))
                .foregroundStyle(AppTheme.text.opacity(0.58))
                .frame(width: 96, alignment: .leading)
            Spacer()
            Menu {
                ForEach(availableOwners) { u in
                    Button(u.name) { paidBy = u.id }
                }
            } label: {
                HStack(spacing: 6) {
                    Text(memberName(paidBy))
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
        .accessibilityLabel("Paid by")
    }

    /// Resolve a member id to its display name (— when nil/unknown).
    private func memberName(_ id: User.ID?) -> String {
        guard let id else { return "—" }
        return appState.user(id).name
    }

    // MARK: - Transfer section (reimbursement / settle-up)

    /// From → To member pickers for a reimbursement. No category/source/split.
    private var transferSection: some View {
        formGroup {
            transferPartyRow(label: "From", selection: $transferFrom, exclude: transferTo)
            divider
            transferPartyRow(label: "To", selection: $transferTo, exclude: transferFrom)
            divider
            dateRow
        }
    }

    /// One From/To member picker. `exclude` is the other party so the menu
    /// can't pick the same member on both sides.
    private func transferPartyRow(label: LocalizedStringKey,
                                  selection: Binding<User.ID?>,
                                  exclude: User.ID?) -> some View {
        HStack(spacing: 12) {
            Text(label)
                .font(.lato(size: 15))
                .foregroundStyle(AppTheme.text.opacity(0.58))
                .frame(width: 96, alignment: .leading)
            Spacer()
            Menu {
                ForEach(availableOwners) { u in
                    Button {
                        selection.wrappedValue = u.id
                    } label: {
                        if selection.wrappedValue == u.id {
                            Label(u.name, systemImage: "checkmark")
                        } else {
                            Text(u.name)
                        }
                    }
                    .disabled(u.id == exclude)
                }
            } label: {
                HStack(spacing: 6) {
                    Text(memberName(selection.wrappedValue))
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

    private var categoryRow: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Category")
                    .font(.lato(size: 15))
                    .foregroundStyle(AppTheme.text.opacity(0.58))
                if guessedFields.contains(.category) { guessedTag }
            }
            .frame(width: 96, alignment: .leading)
            .accessibilityElement(children: .combine)
            Spacer()
            Menu {
                // Spend categories only — .income is locked to the income kind
                // and .transfer (Reimbursement) is a row shape, not a spend
                // category. Mirrors web's SPEND_CATEGORIES (web/lib/categories.ts).
                ForEach(TransactionCategory.allCases.filter { $0 != .income && $0 != .transfer }, id: \.self) { c in
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
            VStack(alignment: .leading, spacing: 2) {
                Text("Date")
                    .font(.lato(size: 15))
                    .foregroundStyle(AppTheme.text.opacity(0.58))
                if guessedFields.contains(.date) { guessedTag }
            }
            .frame(width: 96, alignment: .leading)
            .accessibilityElement(children: .combine)
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
                splitMethodPicker
            }
            .padding(.horizontal, 24)

            let owners = sortedSelectedOwners
            formGroup {
                ForEach(Array(owners.enumerated()), id: \.element.id) { idx, u in
                    splitRow(for: u)
                    if idx < owners.count - 1 { divider }
                }
                if splitMethod != .even {
                    divider
                    splitTotalRow
                }
            }
        }
    }

    /// Even / % / by-amount segmented control.
    private var splitMethodPicker: some View {
        HStack(spacing: 2) {
            ForEach([SplitMethod.even, .percent, .value], id: \.self) { m in
                Button { setSplitMethod(m) } label: {
                    Text(m == .even ? "Even" : m == .percent ? "%" : Money.symbol(for: appState.currency))
                        .font(.lato(size: 13, weight: .semibold))
                        .foregroundStyle(splitMethod == m ? AppTheme.text : AppTheme.text.opacity(0.5))
                        .frame(minWidth: 34)
                        .padding(.vertical, 5)
                        .background(RoundedRectangle(cornerRadius: 7, style: .continuous)
                            .fill(splitMethod == m ? AppTheme.surface : .clear))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(AppTheme.text.opacity(0.05)))
        .animation(.easeOut(duration: 0.12), value: splitMethod)
    }

    private var sortedSelectedOwners: [User] {
        appState.householdMembers.filter { selectedOwners.contains($0.id) }
    }

    private func splitRow(for u: User) -> some View {
        HStack(spacing: 12) {
            UserAvatarView(user: u, size: 24)
            Text(u.name)
                .font(.lato(size: 17, weight: .medium))
                .tracking(-0.2)
                .foregroundStyle(AppTheme.text)
            Spacer()
            switch splitMethod {
            case .even:
                Text(appState.formatMoney(evenShareCents(for: u.id)))
                    .font(.lato(size: 17, weight: .medium))
                    .monospacedDigit()
                    .foregroundStyle(AppTheme.text.opacity(0.58))
            case .percent:
                TextField("0", text: splitBinding(for: u.id))
                    .font(.lato(size: 17, weight: .medium)).monospacedDigit()
                    .multilineTextAlignment(.trailing).keyboardType(.decimalPad)
                    .frame(width: 64).foregroundStyle(AppTheme.text)
                Text("%").font(.lato(size: 15)).foregroundStyle(AppTheme.text.opacity(0.58))
            case .value:
                Text(Money.symbol(for: appState.currency))
                    .font(.lato(size: 15)).foregroundStyle(AppTheme.text.opacity(0.58))
                TextField("0", text: valueBinding(for: u.id))
                    .font(.lato(size: 17, weight: .medium)).monospacedDigit()
                    .multilineTextAlignment(.trailing).keyboardType(.decimalPad)
                    .frame(width: 78).foregroundStyle(AppTheme.text)
            }
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 52)
    }

    private func evenShareCents(for id: User.ID) -> Int64 {
        let owners = orderedOwnerIds(sortedSelectedOwners.map(\.id))
        return computeShares(enteredCents, owners, .even)[id] ?? 0
    }

    /// Percent binding — writes verbatim, then rebalances other owners to 100.
    private func splitBinding(for id: User.ID) -> Binding<String> {
        Binding(
            get: { splitPercents[id] ?? "" },
            set: { newValue in
                splitPercents[id] = newValue
                rebalance(after: id)
            }
        )
    }

    /// By-amount binding — writes verbatim (no rebalance; the user enters exact
    /// amounts and the live total shows whether they sum to the transaction).
    private func valueBinding(for id: User.ID) -> Binding<String> {
        Binding(get: { splitValues[id] ?? "" }, set: { splitValues[id] = $0 })
    }

    private var splitTotalRow: some View {
        HStack(spacing: 12) {
            Text(splitMethod == .value ? "Total" : "Total")
                .font(.lato(size: 15))
                .foregroundStyle(AppTheme.text.opacity(0.58))
            Spacer()
            if splitMethod == .value {
                Text(appState.formatMoney(splitValueTotalCents))
                    .font(.lato(size: 17, weight: .semibold)).monospacedDigit()
                    .foregroundStyle(splitIsValid ? AppTheme.positive : AppTheme.text.opacity(0.58))
                Text("/ \(appState.formatMoney(enteredCents))")
                    .font(.lato(size: 13)).foregroundStyle(AppTheme.text.opacity(0.4))
            } else {
                Text(formatPercent(splitTotal))
                    .font(.lato(size: 17, weight: .semibold)).monospacedDigit()
                    .foregroundStyle(splitIsValid ? AppTheme.positive : AppTheme.text.opacity(0.58))
                Text("%").font(.lato(size: 15)).foregroundStyle(AppTheme.text.opacity(0.58))
            }
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 52)
        .animation(.easeOut(duration: 0.12), value: splitIsValid)
    }

    // MARK: - Split helpers

    private func setSplitMethod(_ m: SplitMethod) {
        splitMethod = m
        switch m {
        case .even:    break
        case .percent: seedEvenPercents()
        case .value:   seedEvenValues()
        }
    }

    /// Reset to an even split (used on owner/amount/direction changes).
    private func resetSplitsToEven() {
        splitMethod = .even
        seedEvenPercents()
    }

    /// Even percentages across owners; the last absorbs the rounding remainder
    /// (33.33 + 33.33 + 33.34 = 100).
    private func seedEvenPercents() {
        let owners = sortedSelectedOwners
        guard !owners.isEmpty else { splitPercents = [:]; return }
        let count = owners.count
        let baseTwoDigit = (100.0 / Double(count) * 100).rounded(.down) / 100
        var totals = Array(repeating: baseTwoDigit, count: count)
        totals[count - 1] += ((100.0 - baseTwoDigit * Double(count)) * 100).rounded() / 100
        var next: [User.ID: String] = [:]
        for (i, u) in owners.enumerated() { next[u.id] = String(format: "%.2f", totals[i]) }
        splitPercents = next
    }

    /// Even by-amount fields in display currency (a starting point the user edits).
    private func seedEvenValues() {
        let owners = sortedSelectedOwners
        guard !owners.isEmpty, let amt = parsedAmount else { splitValues = [:]; return }
        let fd = appState.currency.fractionDigits
        let scale = pow(10.0, Double(fd))
        let total = NSDecimalNumber(decimal: amt).doubleValue
        let base = (total / Double(owners.count) * scale).rounded(.down) / scale
        var amounts = Array(repeating: base, count: owners.count)
        amounts[owners.count - 1] += ((total - base * Double(owners.count)) * scale).rounded() / scale
        var next: [User.ID: String] = [:]
        for (i, u) in owners.enumerated() { next[u.id] = String(format: "%.\(fd)f", amounts[i]) }
        splitValues = next
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
