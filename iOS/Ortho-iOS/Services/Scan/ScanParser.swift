// ScanDocumentText → ScanParseResult. Pure and deterministic: same document +
// same context ⇒ identical result (spec 014, contracts/scan-parser.md).
// Detection order is research R5 and is binding:
//   1. ≥3 transaction rows           → statement
//   2. confident labeled grand total → receipt
//   3. 1–2 transaction rows          → statement (a one-row wizard is still
//                                      a correct, reviewable outcome)
//   4. otherwise                     → .none (calm failure copy)

import Foundation

enum ScanParser {

    static func parse(_ document: ScanDocumentText, context: ScanContext) -> ScanParseResult {
        guard !document.isEmpty else { return .none }

        let lineTexts = document.allLines.map(\.text)
        let period = ScanHeuristics.statementPeriod(in: lineTexts)
        let rows = statementRows(in: document)

        if rows.count >= 3 {
            return .statement(candidates(from: rows, period: period, context: context))
        }
        if let total = ScanHeuristics.grandTotal(in: lineTexts, defaultCurrency: context.defaultCurrency) {
            return .receipt(receiptCandidate(total: total, lineTexts: lineTexts, context: context))
        }
        if !rows.isEmpty {
            return .statement(candidates(from: rows, period: period, context: context))
        }
        return .none
    }

    // MARK: - Statement path

    /// Rows in document order. Structured OCR may surface the same content as
    /// both a table and transcript lines — per page, whichever view yields
    /// more rows wins (never both, so nothing double-counts).
    private static func statementRows(in document: ScanDocumentText) -> [ScanHeuristics.StatementRow] {
        var rows: [ScanHeuristics.StatementRow] = []
        for page in document.pages {
            let fromLines = page.lines.compactMap { ScanHeuristics.statementRow(from: $0.text) }
            let fromTables = page.tables.flatMap { table in
                table.rows.compactMap { ScanHeuristics.statementRow(fromCells: $0) }
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
