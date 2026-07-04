// Optional on-device refinement via Apple's Foundation Models (spec 014,
// research R4; extraction rescue added post-T037). Two roles, both strictly
// bounded by the deterministic baseline:
//   • POLISH (refineReceipt): merchant display cleanup ("TST* BLUE BOTTLE
//     04722" → "Blue Bottle") and a category suggestion ONLY when history
//     and the rule table were silent. Never amounts, never dates.
//   • RESCUE (rescue): when every deterministic tier — including the
//     forgiving fallback — got nothing from a capture that DID have text,
//     hand the raw OCR text to the model and prefill its answer with every
//     field marked Guessed. Amounts/dates it proposes re-parse through the
//     same ScanHeuristics primitives, never free-form.
// Any failure, timeout, or unavailability degrades to the input (FR-018).
// NEVER runs in fixture tests or under -uiDemoScan (determinism contract).

import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

enum ScanRefiner {

    static var isAvailable: Bool {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            return SystemLanguageModel.default.availability == .available
        }
        #endif
        return false
    }

    /// Refine a receipt result; everything else passes through untouched.
    static func refine(_ result: ScanParseResult) async -> ScanParseResult {
        guard case .receipt(let candidate) = result else { return result }
        guard let refined = await refineReceipt(candidate) else { return result }
        return .receipt(refined)
    }

    static func refineReceipt(_ candidate: ParsedCandidate) async -> ParsedCandidate? {
        #if canImport(FoundationModels)
        guard #available(iOS 26.0, *), isAvailable else { return nil }
        // History already adopted the household's own spelling — refine only
        // a raw, unmatched merchant.
        let wantsMerchant = candidate.merchant == candidate.merchantRaw && !candidate.merchantRaw.isEmpty
        let wantsCategory = candidate.categoryGuess == nil
            && candidate.direction == .debit && !candidate.isPaymentRow
        guard wantsMerchant || wantsCategory else { return nil }

        let work = Task { () -> RefinedMerchant? in
            let session = LanguageModelSession(instructions: """
                You clean up merchant names from receipt OCR text. Respond with \
                the merchant's natural display name (e.g. "Blue Bottle Coffee", \
                "Trader Joe's") and, if obvious, one spending category from: \
                coffee, groceries, dining, subs, fuel, rent, health, transit, \
                utilities, entertainment. Use "none" when unsure.
                """)
            return try? await session.respond(
                to: "Merchant text: \(candidate.merchantRaw)",
                generating: RefinedMerchant.self
            ).content
        }
        // Hard timeout — refinement must never hold up the form (R4).
        let timeout = Task {
            try? await Task.sleep(for: .seconds(2))
            work.cancel()
        }
        let refined = await work.value
        timeout.cancel()
        guard let refined else { return nil }

        var c = candidate
        let name = refined.name.trimmingCharacters(in: .whitespaces)
        if wantsMerchant, !name.isEmpty, name.lowercased() != "none" {
            c.merchant = name
            c.guesses.insert(.merchant)
        }
        if wantsCategory,
           let category = TransactionCategory(rawValue: refined.category.lowercased()),
           category != .income, category != .transfer {
            c.categoryGuess = category
            c.guesses.insert(.category)
        }
        return c
        #else
        return nil
        #endif
    }

    // MARK: - Extraction rescue (post-T037 device feedback)

    /// Last-chance tier for a failed parse. Returns nil unless the model is
    /// available AND produced a usable amount; the caller then treats the
    /// result exactly like a fallback receipt. 5 s hard timeout — longer
    /// than polish because the alternative here is the failure copy, not a
    /// slightly plainer prefill.
    static func rescue(_ document: ScanDocumentText, context: ScanContext) async -> ParsedCandidate? {
        #if canImport(FoundationModels)
        guard #available(iOS 26.0, *), isAvailable else { return nil }
        let text = document.pages.flatMap { page in
            page.lines.map(\.text)
                + page.tables.flatMap { $0.rows.map { $0.joined(separator: "  ") } }
        }.joined(separator: "\n")
        let prompt = String(text.prefix(2000)).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !prompt.isEmpty else { return nil }

        let work = Task { () -> ExtractedTransaction? in
            let session = LanguageModelSession(instructions: """
                You extract one financial transaction from OCR text of a \
                receipt, screenshot, or bank statement. Find the merchant or \
                payee, the transaction date, the amount actually paid \
                (prefer a grand total over item prices), and whether money \
                was spent (debit) or received (credit). Use empty strings \
                for anything you cannot find.
                """)
            return try? await session.respond(
                to: prompt,
                generating: ExtractedTransaction.self
            ).content
        }
        let timeout = Task {
            try? await Task.sleep(for: .seconds(5))
            work.cancel()
        }
        let extracted = await work.value
        timeout.cancel()
        guard let extracted,
              let amount = ScanHeuristics.parseAmount(extracted.amount),
              amount.minorUnits != 0 else { return nil }

        let merchant = ScanHeuristics.cleanMerchant(extracted.merchant)
        var claimed: Set<Transaction.ID> = []
        var candidate = ParsedCandidate(
            merchantRaw: merchant,
            merchant: merchant,
            date: ScanHeuristics.fullDate(in: extracted.date),
            amountCents: abs(amount.minorUnits),
            direction: extracted.direction.lowercased() == "credit" || amount.negative
                ? .credit : .debit,
            currency: amount.currency ?? context.defaultCurrency
        )
        candidate.guesses.insert(.amount)
        if !merchant.isEmpty { candidate.guesses.insert(.merchant) }
        if candidate.date != nil { candidate.guesses.insert(.date) }
        if candidate.currency != .usd {
            candidate.originalAmount = Decimal(candidate.amountCents)
                / pow(Decimal(10), candidate.currency.fractionDigits)
            candidate.guesses.insert(.currency)
        }
        return ScanInference.enrich(candidate, context: context, claimed: &claimed)
        #else
        return nil
        #endif
    }
}

#if canImport(FoundationModels)
@available(iOS 26.0, *)
@Generable
private struct RefinedMerchant {
    @Guide(description: "The merchant's clean display name")
    var name: String
    @Guide(description: "One of: coffee, groceries, dining, subs, fuel, rent, health, transit, utilities, entertainment, none")
    var category: String
}

@available(iOS 26.0, *)
@Generable
private struct ExtractedTransaction {
    @Guide(description: "The merchant or payee's name, empty if unknown")
    var merchant: String
    @Guide(description: "Transaction date as YYYY-MM-DD, empty if unknown")
    var date: String
    @Guide(description: "The amount with its currency symbol or code, e.g. $24.51 or EUR 23,50 — empty if unknown")
    var amount: String
    @Guide(description: "debit if money was spent, credit if money was received or refunded")
    var direction: String
}
#endif
