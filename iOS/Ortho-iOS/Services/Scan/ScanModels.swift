// Pure value types for the receipt/statement scan pipeline (spec 014).
// Contract: specs/014-receipt-statement-scan/contracts/scan-parser.md
// These types are the only boundary between extraction (Vision/PDFKit),
// parsing (deterministic heuristics), inference, and the UI — Vision types
// must never leak past ScanTextExtractor.

import Foundation
import CoreGraphics

/// Engine-agnostic text of one capture. Frames are normalized (0–1),
/// origin top-left, so "bottom of the receipt" heuristics work regardless
/// of source resolution.
nonisolated struct ScanDocumentText: Equatable {
    struct Line: Equatable {
        var text: String
        var frame: CGRect
    }

    struct Table: Equatable {
        /// Cell texts, row-major, as detected by structured OCR.
        var rows: [[String]]
    }

    struct Page: Equatable {
        var lines: [Line]
        var tables: [Table]
    }

    var pages: [Page]

    /// All lines across pages, in document order.
    var allLines: [Line] { pages.flatMap(\.lines) }

    var isEmpty: Bool {
        pages.allSatisfy { $0.lines.isEmpty && $0.tables.isEmpty }
    }
}

/// Which prefill fields are inferences (vs direct extraction). Drives the
/// text3 "Guessed" affordance — cleared per field on first user edit
/// (FR-016). Only fields some tier actually infers are cases: merchant
/// (refiner), category/owners (history + rule table), currency (FX
/// detection). Extracted date/amount are never "guesses".
nonisolated enum GuessedField: String, Codable, Hashable {
    case merchant, category, owners, currency
}

/// One potential transaction extracted from a capture.
nonisolated struct ParsedCandidate: Identifiable, Equatable {
    enum Direction: String, Codable {
        case debit   // prefills as expense
        case credit  // prefills as income (flippable, FR-011)
    }

    let id: UUID
    /// Merchant text as read (after processor-prefix/store-number cleanup).
    var merchantRaw: String
    /// Display merchant: the household's own spelling when history matches,
    /// otherwise `merchantRaw` (the optional on-device refiner may clean it).
    var merchant: String
    /// Calendar day only (year/month/day). `nil` = leave the form's default —
    /// never a fabricated date.
    var date: DateComponents?
    /// Minor units of `currency` (USD cents when `currency == .usd`).
    /// Always > 0; direction carries the sign. Foreign candidates keep the
    /// printed amount here and in `originalAmount` — the FORM derives USD via
    /// the existing conversion, never the parser (FR-014, FR-023).
    var amountCents: Int64
    var direction: Direction
    var currency: Currency
    /// Non-nil iff `currency != .usd`; the printed total in that currency.
    var originalAmount: Decimal?
    /// Card-payment/transfer statement row — default-skipped, never an
    /// expense prefill (FR-012).
    var isPaymentRow: Bool
    var guesses: Set<GuessedField>
    /// nil = the form's manual default stands (FR-013).
    var categoryGuess: TransactionCategory?
    /// Owners of the most recent matching history transaction; split method
    /// stays the form's default (even) — custom split guessing is out of scope.
    var ownersGuess: [Person.ID]?
    /// At most one claimed existing transaction (FR-015).
    var duplicateOf: Transaction.ID?

    init(id: UUID = UUID(),
         merchantRaw: String,
         merchant: String,
         date: DateComponents? = nil,
         amountCents: Int64,
         direction: Direction = .debit,
         currency: Currency = .usd,
         originalAmount: Decimal? = nil,
         isPaymentRow: Bool = false,
         guesses: Set<GuessedField> = [],
         categoryGuess: TransactionCategory? = nil,
         ownersGuess: [Person.ID]? = nil,
         duplicateOf: Transaction.ID? = nil) {
        self.id = id
        self.merchantRaw = merchantRaw
        self.merchant = merchant
        self.date = date
        self.amountCents = amountCents
        self.direction = direction
        self.currency = currency
        self.originalAmount = originalAmount
        self.isPaymentRow = isPaymentRow
        self.guesses = guesses
        self.categoryGuess = categoryGuess
        self.ownersGuess = ownersGuess
        self.duplicateOf = duplicateOf
    }
}

/// Outcome of parsing one capture.
nonisolated enum ScanParseResult: Equatable {
    /// Single confident grand total — prefill the open form in place.
    case receipt(ParsedCandidate)
    /// Ordered transaction rows (1+) — statement interstitial + wizard.
    case statement([ParsedCandidate])
    /// Nothing parseable — calm failure copy + Retake (FR-017).
    case none
}

/// The household's past behavior with one merchant, pre-aggregated so the
/// parser stays pure (no Transaction traversal inside the pipeline).
nonisolated struct MerchantHistory: Equatable {
    /// Normalized key — see `ScanHeuristics.normalizeMerchant`.
    var normalizedMerchant: String
    /// The household's own display spelling (most recent).
    var displayMerchant: String
    /// Dominant past category (most frequent; ties → most recent).
    var category: TransactionCategory
    var count: Int
    /// Day of the most recent matching transaction (recency tie-break).
    var lastDay: DateComponents?
    /// Owners of the most recent matching transaction.
    var owners: [Person.ID]
}

/// Existing-transaction shadow used for duplicate matching (FR-015).
nonisolated struct ExistingTransactionDay: Equatable {
    var id: Transaction.ID
    /// Local calendar day (year/month/day).
    var day: DateComponents
    var amountCents: Int64
}

/// Everything the parser needs from the outside world, injected (never the
/// real clock, never live collections — constitution VI / contract §purity).
nonisolated struct ScanContext {
    var existing: [ExistingTransactionDay]
    var history: [MerchantHistory]
    var defaultCurrency: Currency
    /// Calendar day standing in for "now" — year inference fallback only.
    var referenceDay: DateComponents

    init(existing: [ExistingTransactionDay] = [],
         history: [MerchantHistory] = [],
         defaultCurrency: Currency = .usd,
         referenceDay: DateComponents) {
        self.existing = existing
        self.history = history
        self.defaultCurrency = defaultCurrency
        self.referenceDay = referenceDay
    }
}
