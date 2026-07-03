// One capture's lifecycle: source → parse → receipt prefill | interstitial →
// wizard → summary (spec 014, data-model.md §Phase state machine). Owned as
// @State by AddTransactionSheet, so the session — and all capture data —
// dies with the sheet (FR-003).
//
// No transaction ever saves in here: accepts are counted, the sheet performs
// the actual (existing, optimistic) add per row (FR-009).

import SwiftUI
import Observation

@Observable
final class ScanSession {

    enum Source: Equatable {
        case camera, photoLibrary, file
    }

    enum Phase: Equatable {
        case idle
        case parsing
        case receiptPrefilled
        case interstitial
        case reviewing
        case summary
        case failed
    }

    enum Disposition: Equatable {
        case pending
        case added
        case skipped            // user Skip in the wizard
        case leftOutDuplicate   // pre-skipped by the interstitial toggle
        case leftOutPayment     // card-payment row, always pre-skipped (FR-012)
    }

    private(set) var phase: Phase = .idle
    private(set) var candidates: [ParsedCandidate] = []
    private(set) var dispositions: [UUID: Disposition] = [:]
    private(set) var receiptCandidate: ParsedCandidate?
    /// Wizard queue (pending candidates in document order) + position.
    private(set) var queue: [ParsedCandidate] = []
    private(set) var cursor: Int = 0
    /// Last capture source, so Retake reopens the same one (FR-017).
    var lastSource: Source?

    /// Interstitial toggle, default ON (FR-007). Re-applies pre-skips live.
    var skipDuplicates: Bool = true {
        didSet { if phase == .interstitial { applyPreskips() } }
    }

    // MARK: - Counts (interstitial + summary, FR-010)

    var rowCount: Int { candidates.count }
    var duplicateCount: Int { candidates.filter { $0.duplicateOf != nil && !$0.isPaymentRow }.count }
    var paymentCount: Int { candidates.filter(\.isPaymentRow).count }
    var addedCount: Int { dispositions.values.filter { $0 == .added }.count }
    /// User skips + payment pre-skips read as "skipped" in the summary.
    var skippedCount: Int {
        dispositions.values.filter { $0 == .skipped || $0 == .leftOutPayment }.count
    }
    var leftOutDuplicateCount: Int {
        dispositions.values.filter { $0 == .leftOutDuplicate }.count
    }

    var currentCandidate: ParsedCandidate? {
        queue.indices.contains(cursor) ? queue[cursor] : nil
    }

    var isLastRow: Bool { cursor >= queue.count - 1 }

    var isWizardActive: Bool { phase == .reviewing }

    // MARK: - Processing

    @MainActor
    func process(images: [UIImage], context: ScanContext) async {
        phase = .parsing
        let result: ScanParseResult
        do {
            let document = try await ScanTextExtractor.extract(images: images)
            result = ScanParser.parse(document, context: context)
        } catch {
            result = .none
        }
        handle(result)
    }

    @MainActor
    func process(pdfAt url: URL, context: ScanContext) async {
        phase = .parsing
        let result: ScanParseResult
        do {
            let document = try await ScanTextExtractor.extract(pdfAt: url)
            result = ScanParser.parse(document, context: context)
        } catch {
            result = .none
        }
        handle(result)
    }

    @MainActor
    private func handle(_ result: ScanParseResult) {
        switch result {
        case .none:
            phase = .failed
        case .receipt(let candidate):
            receiptCandidate = candidate
            phase = .receiptPrefilled
        case .statement(let rows):
            candidates = rows
            dispositions = Dictionary(uniqueKeysWithValues: rows.map { ($0.id, Disposition.pending) })
            applyPreskips()
            phase = .interstitial
        }
    }

    /// Payment rows are always pre-skipped; duplicates follow the toggle.
    /// Nothing here saves or discards permanently — Stop/summary is the only
    /// exit, and pending rows simply never get added.
    private func applyPreskips() {
        for candidate in candidates {
            if candidate.isPaymentRow {
                dispositions[candidate.id] = .leftOutPayment
            } else if candidate.duplicateOf != nil {
                dispositions[candidate.id] = skipDuplicates ? .leftOutDuplicate : .pending
            }
        }
    }

    // MARK: - Wizard flow

    func startReview() {
        queue = candidates.filter { dispositions[$0.id] == .pending }
        cursor = 0
        phase = queue.isEmpty ? .summary : .reviewing
    }

    /// The sheet calls this AFTER performing the row's real optimistic add.
    func acceptCurrent() {
        guard let current = currentCandidate else { return }
        dispositions[current.id] = .added
        advance()
    }

    func skipCurrent() {
        guard let current = currentCandidate else { return }
        dispositions[current.id] = .skipped
        advance()
    }

    /// Always available; rows already added stay (they were real adds).
    func stop() {
        phase = .summary
    }

    private func advance() {
        if isLastRow {
            phase = .summary
        } else {
            cursor += 1
        }
    }

    // MARK: - Lifecycle

    func retake() {
        phase = .idle
    }

    func reset() {
        phase = .idle
        candidates = []
        dispositions = [:]
        receiptCandidate = nil
        queue = []
        cursor = 0
        lastSource = nil
    }
}
