// One capture's lifecycle: source → parse → receipt prefill | interstitial →
// wizard → summary (spec 014, data-model.md §Phase state machine). Owned as
// @State by AddTransactionSheet, so the session — and all capture data —
// dies with the sheet (FR-003).
//
// No transaction ever saves in here: accepts are counted, the sheet performs
// the actual (existing, optimistic) add per row (FR-009).

import SwiftUI
import Observation
import os

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
    /// Extracted text of the last capture — in-memory only, dies with the
    /// session like everything else here (FR-003). Read by the DEBUG
    /// failure diagnostics so the device itself can show what OCR saw.
    private(set) var lastDocument: ScanDocumentText?
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

    /// Non-nil only while reviewing — callers loop on this (the demo
    /// auto-accept does literally), so it MUST go nil when the wizard ends.
    var currentCandidate: ParsedCandidate? {
        guard phase == .reviewing, queue.indices.contains(cursor) else { return nil }
        return queue[cursor]
    }

    var isLastRow: Bool { cursor >= queue.count - 1 }

    var isWizardActive: Bool { phase == .reviewing }

    // MARK: - Processing

    /// `rescue` is the on-device model's extraction fallback: consulted only
    /// when the deterministic parse yields `.none` on a capture that DID
    /// have text. Nil under -uiDemoScan and in fixtures — determinism holds
    /// where it is contractual, and the spinner stays up while it runs.
    typealias Rescue = @Sendable (ScanDocumentText) async -> ParsedCandidate?

    @MainActor
    func process(images: [UIImage], context: ScanContext, rescue: Rescue? = nil) async {
        await run(context: context, rescue: rescue) { try await ScanTextExtractor.extract(images: images) }
    }

    @MainActor
    func process(pdfAt url: URL, context: ScanContext, rescue: Rescue? = nil) async {
        await run(context: context, rescue: rescue) { try await ScanTextExtractor.extract(pdfAt: url) }
    }

    /// One lifecycle for both sources. The heavy work (OCR / PDF render /
    /// regex parse) runs in a DETACHED task: the app builds with
    /// default-MainActor isolation, so anything less would put Vision's
    /// synchronous recognition on the main thread behind the "Reading…"
    /// spinner (R12).
    @MainActor
    private func run(context: ScanContext,
                     rescue: Rescue?,
                     _ extract: @escaping @Sendable () async throws -> ScanDocumentText) async {
        phase = .parsing
        let (document, parsed) = await Task.detached(priority: .userInitiated) { () -> (ScanDocumentText?, ScanParseResult) in
            do {
                let document = try await extract()
                return (document, ScanParser.parse(document, context: context))
            } catch {
                return (nil, .none)
            }
        }.value
        lastDocument = document
        var result = parsed
        if case .none = result, let rescue, let document, !document.isEmpty,
           let candidate = await rescue(document) {
            result = .receipt(candidate)
        }
        handle(result)
    }

    @MainActor
    private func handle(_ result: ScanParseResult) {
        switch result {
        case .none:
            #if DEBUG
            // The device is the debugger for real-world captures: CI's
            // synthetic fixtures passing ≠ real photos working, and this
            // text never reaches CI logs otherwise.
            if let document = lastDocument, !document.isEmpty {
                Logger(subsystem: Bundle.main.bundleIdentifier ?? "Ortho",
                       category: "scan")
                    .debug("parse failed; extracted: \(document.allLines.map(\.text).joined(separator: " ⏎ "), privacy: .public)")
            }
            #endif
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
        lastDocument = nil
        candidates = []
        dispositions = [:]
        receiptCandidate = nil
        queue = []
        cursor = 0
        lastSource = nil
    }
}
