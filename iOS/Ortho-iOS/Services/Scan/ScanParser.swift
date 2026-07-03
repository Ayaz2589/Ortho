// ScanDocumentText → ScanParseResult. Pure and deterministic: same document +
// same context ⇒ identical result (spec 014, contracts/scan-parser.md).
// Detection order is research R5 (+ the post-T037 forgiving tier) and is
// binding:
//   1. ≥3 transaction rows           → statement
//   2. confident labeled grand total → receipt
//   3. 1–2 transaction rows          → statement (a one-row wizard is still
//                                      a correct, reviewable outcome)
//   4. any money-shaped text         → best-effort receipt, every field
//                                      Guessed (wrong guesses are cheap —
//                                      review-before-add exists for exactly
//                                      this; refusing to guess is the worse
//                                      failure)
//   5. otherwise                     → .none (calm failure copy)

import Foundation

nonisolated enum ScanParser {

    static func parse(_ document: ScanDocumentText, context: ScanContext) -> ScanParseResult {
        guard !document.isEmpty else { return .none }

        // Structured OCR may hive tabular regions (a receipt's item list, a
        // statement's rows) into tables and keep only the rest as transcript
        // lines — so text searches (period, merchant, grand total) see BOTH,
        // in per-page document order.
        let texts = document.pages.flatMap { page in
            page.lines.map(\.text)
                + page.tables.flatMap { $0.rows.map { $0.joined(separator: "  ") } }
        }
        let period = ScanHeuristics.statementPeriod(in: texts)
        let rows = statementRows(in: document, defaultCurrency: context.defaultCurrency)
        // Arbitrate on USABLE candidates, not raw row matches — 3 zero-amount
        // fee rows must not suppress a labeled receipt total or produce an
        // empty ".statement([])" interstitial.
        let rowCandidates = rows.isEmpty ? [] : candidates(from: rows, period: period, context: context)

        if rowCandidates.count >= 3 {
            return .statement(rowCandidates)
        }
        if let total = ScanHeuristics.grandTotal(in: texts, defaultCurrency: context.defaultCurrency) {
            return .receipt(receiptCandidate(total: total, lineTexts: texts, context: context))
        }
        if !rowCandidates.isEmpty {
            return .statement(rowCandidates)
        }
        if let fallback = fallbackCandidate(lineTexts: texts, context: context) {
            return .receipt(fallback)
        }
        return .none
    }

    // MARK: - Statement path

    /// Rows in document order. Structured OCR may surface the same content as
    /// both a table and transcript lines — per page, whichever view yields
    /// more rows wins (never both, so nothing double-counts).
    private static func statementRows(in document: ScanDocumentText,
                                      defaultCurrency: Currency) -> [ScanHeuristics.StatementRow] {
        var rows: [ScanHeuristics.StatementRow] = []
        for page in document.pages {
            let fromLines = page.lines.compactMap {
                ScanHeuristics.statementRow(from: $0.text, defaultCurrency: defaultCurrency)
            }
            let fromTables = page.tables.flatMap { table in
                table.rows.compactMap {
                    ScanHeuristics.statementRow(fromCells: $0, defaultCurrency: defaultCurrency)
                }
            }
            rows.append(contentsOf: fromTables.count > fromLines.count ? fromTables : fromLines)
        }
        return rows
    }

    private static func candidates(from rows: [ScanHeuristics.StatementRow],
                                   period: (start: DateComponents, end: DateComponents)?,
                                   context: ScanContext) -> [ParsedCandidate] {
        var claimed: Set<Transaction.ID> = []
        var out: [ParsedCandidate] = []
        for row in rows {
            guard row.amount.minorUnits > 0 else { continue } // zero rows are noise
            let merchantRaw = ScanHeuristics.cleanMerchant(row.description)
            guard !merchantRaw.isEmpty else { continue }
            let day = ScanHeuristics.resolveDay(month: row.month, day: row.day,
                                                period: period, reference: context.referenceDay)
            var candidate = ParsedCandidate(
                merchantRaw: merchantRaw,
                merchant: merchantRaw,
                date: day,
                amountCents: row.amount.minorUnits,
                direction: row.amount.negative ? .credit : .debit,
                currency: row.amount.currency ?? context.defaultCurrency,
                isPaymentRow: ScanHeuristics.isPaymentRow(merchantRaw)
            )
            if candidate.currency != .usd {
                candidate.originalAmount = decimalAmount(candidate.amountCents, candidate.currency)
                candidate.guesses.insert(.currency)
            }
            candidate = ScanInference.enrich(candidate, context: context, claimed: &claimed)
            out.append(candidate)
        }
        return out
    }

    // MARK: - Receipt path

    private static func receiptCandidate(total: ScanHeuristics.AmountToken,
                                         lineTexts: [String],
                                         context: ScanContext) -> ParsedCandidate {
        var claimed: Set<Transaction.ID> = []
        let merchantRaw = ScanHeuristics.cleanMerchant(merchantLine(in: lineTexts) ?? "")
        var candidate = ParsedCandidate(
            merchantRaw: merchantRaw,
            merchant: merchantRaw,
            date: ScanHeuristics.firstFullDate(in: lineTexts),
            amountCents: abs(total.minorUnits),
            direction: total.negative ? .credit : .debit,
            currency: total.currency ?? context.defaultCurrency
        )
        if candidate.currency != .usd {
            candidate.originalAmount = decimalAmount(candidate.amountCents, candidate.currency)
            candidate.guesses.insert(.currency)
        }
        return ScanInference.enrich(candidate, context: context, claimed: &claimed)
    }

    // MARK: - Forgiving fallback (tier 4, post-T037 device feedback)

    /// Real-world captures — web-banking screenshots, crumpled receipts with
    /// a garbled TOTAL line — often defeat tiers 1–3 while the OCR text is
    /// perfectly readable. If the text still contains a money-shaped amount,
    /// prefill best-effort instead of failing: strongest amount, top
    /// plausible merchant line, any full date — every field marked Guessed
    /// so the review-before-add affordances carry the risk.
    private static func fallbackCandidate(lineTexts: [String],
                                          context: ScanContext) -> ParsedCandidate? {
        guard let amount = ScanHeuristics.strongestAmount(in: lineTexts,
                                                          defaultCurrency: context.defaultCurrency)
        else { return nil }
        var claimed: Set<Transaction.ID> = []
        let merchantRaw = ScanHeuristics.cleanMerchant(merchantLine(in: lineTexts) ?? "")
        var candidate = ParsedCandidate(
            merchantRaw: merchantRaw,
            merchant: merchantRaw,
            date: ScanHeuristics.firstFullDate(in: lineTexts),
            amountCents: abs(amount.minorUnits),
            direction: amount.negative ? .credit : .debit,
            currency: amount.currency ?? context.defaultCurrency
        )
        candidate.guesses.insert(.amount)
        if !merchantRaw.isEmpty { candidate.guesses.insert(.merchant) }
        if candidate.date != nil { candidate.guesses.insert(.date) }
        if candidate.currency != .usd {
            candidate.originalAmount = decimalAmount(candidate.amountCents, candidate.currency)
            candidate.guesses.insert(.currency)
        }
        return ScanInference.enrich(candidate, context: context, claimed: &claimed)
    }

    /// The merchant is the top-most line that reads like a name: has letters,
    /// isn't a date line, isn't just an amount.
    private static func merchantLine(in lineTexts: [String]) -> String? {
        for text in lineTexts {
            let trimmed = text.trimmingCharacters(in: .whitespaces)
            guard trimmed.rangeOfCharacter(from: .letters) != nil else { continue }
            guard ScanHeuristics.fullDate(in: trimmed) == nil else { continue }
            guard !ScanHeuristics.matches(trimmed, pattern: "^[-$€£¥0-9.,\\s]+$") else { continue }
            return trimmed
        }
        return nil
    }

    private static func decimalAmount(_ minorUnits: Int64, _ currency: Currency) -> Decimal {
        Decimal(minorUnits) / pow(Decimal(10), currency.fractionDigits)
    }
}
