// Optional on-device refinement via Apple's Foundation Models (spec 014
// research R4; extraction rescue added post-T037; ported to this Capacitor
// plugin for spec 021). Two roles, both strictly bounded:
//   • POLISH (refineMerchant): merchant display cleanup ("TST* BLUE BOTTLE
//     04722" -> "Blue Bottle") and a category suggestion. Never amounts,
//     never dates.
//   • RESCUE (rescue): when the deterministic TS parser (scanParser.ts) got
//     nothing from a capture that DID have text, hand the raw OCR text to the
//     model and return its best guess so JS can prefill with every field
//     marked Guessed. Amounts/dates it proposes are returned as RAW STRINGS —
//     they re-parse through the same primitives every other tier uses
//     (web/lib/scan/scanHeuristics.ts's date/amount parsers), never
//     free-form, so this file does not (and, being plugin-side, cannot)
//     import the app's TransactionCategory/duplicate-matching logic.
// Any failure, timeout, or unavailability degrades to nil/absent — this MUST
// silently degrade, never throw or reject the plugin call (FR-010).
// NEVER runs in fixture/regression tests (determinism contract) — those run
// against frozen `shared/scan-fixtures/*.json` purely in TypeScript.
//
// Ported from iOS/Ortho-iOS/Services/Scan/ScanRefiner.swift. Not compiled in
// this environment (no Xcode/macOS) — see the note atop ScanPlugin.swift.

import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

/// Plugin-facing result of `refineMerchant` — mirrors the contract's
/// `{ merchant: string; category?: string }` shape exactly
/// (contracts/scan-plugin-api.md §refineMerchant).
nonisolated struct RefinedMerchantResult {
    var merchant: String
    /// Lowercased category slug (e.g. "coffee", "groceries") or nil when the
    /// model was unsure. TS validates this against its own
    /// `TransactionCategory` enum (scanModels.ts) and ignores anything it
    /// doesn't recognize — this plugin has no such enum to validate against.
    var category: String?

    var jsObject: [String: Any] {
        var object: [String: Any] = ["merchant": merchant]
        if let category { object["category"] = category }
        return object
    }
}

/// Plugin-facing result of `rescue` — a raw, unvalidated guess. Every field
/// is a guess by construction (contract: "the plugin never claims high
/// confidence for model output"); TS re-parses `date`/`amount` through
/// scanHeuristics.ts exactly as the deterministic tiers do, and decides
/// in scanInference.ts whether the result is usable (non-empty amount that
/// parses to a nonzero value). The frozen Swift original validated the parsed
/// amount natively via `ScanHeuristics.parseAmount`/`ScanInference.enrich`;
/// that validation/enrichment now lives in TS (research.md §4.1) since this
/// plugin has no access to merchant history or existing-transaction context.
nonisolated struct RescueGuess {
    var merchantRaw: String
    /// Free-form date text as the model read it (e.g. "2026-07-08" or
    /// "Jul 8"), empty when unknown.
    var date: String
    /// Free-form amount text including any currency symbol/code (e.g.
    /// "$24.51" or "EUR 23,50"), empty when unknown.
    var amount: String
    /// "debit" | "credit"
    var direction: String

    var jsObject: [String: Any] {
        [
            "merchantRaw": merchantRaw,
            "date": date,
            "amount": amount,
            "direction": direction
        ]
    }
}

nonisolated enum ScanRefiner {

    static var isAvailable: Bool {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            return SystemLanguageModel.default.availability == .available
        }
        #endif
        return false
    }

    /// Merchant polish + category suggestion. `merchant` is the raw OCR
    /// merchant text; the caller (TS) decides whether refinement is even
    /// worth requesting (e.g. skip when household history already supplied a
    /// display spelling) — this plugin method just answers the question
    /// "what does the model make of this text", unconditionally.
    static func refineMerchant(_ merchantRaw: String) async -> RefinedMerchantResult? {
        #if canImport(FoundationModels)
        guard #available(iOS 26.0, *), isAvailable else { return nil }
        let trimmed = merchantRaw.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return nil }

        let work = Task { () -> RefinedMerchant? in
            let session = LanguageModelSession(instructions: """
                You clean up merchant names from receipt OCR text. Respond with \
                the merchant's natural display name (e.g. "Blue Bottle Coffee", \
                "Trader Joe's") and, if obvious, one spending category from: \
                coffee, groceries, dining, subs, fuel, rent, health, transit, \
                utilities, entertainment. Use "none" when unsure.
                """)
            return try? await session.respond(
                to: "Merchant text: \(trimmed)",
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

        let name = refined.name.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty, name.lowercased() != "none" else { return nil }
        let category = refined.category.trimmingCharacters(in: .whitespaces).lowercased()
        return RefinedMerchantResult(
            merchant: name,
            category: (category.isEmpty || category == "none") ? nil : category
        )
        #else
        return nil
        #endif
    }

    // MARK: - Extraction rescue (post-T037 device feedback)

    /// Last-chance tier for a page the deterministic parser found nothing in.
    /// Returns nil unless the model is available AND produced a non-empty
    /// amount guess; the caller (scanInference.ts) then re-parses/validates
    /// exactly like the forgiving fallback tier. 5s hard timeout — longer
    /// than polish because the alternative here is the failure copy, not a
    /// slightly plainer prefill.
    static func rescue(_ page: ScanDocumentText.Page) async -> RescueGuess? {
        #if canImport(FoundationModels)
        guard #available(iOS 26.0, *), isAvailable else { return nil }
        let text = (page.lines.map(\.text)
            + page.tables.flatMap { $0.rows.map { $0.joined(separator: "  ") } })
            .joined(separator: "\n")
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
        guard let extracted else { return nil }
        let amount = extracted.amount.trimmingCharacters(in: .whitespaces)
        guard !amount.isEmpty else { return nil }

        let direction = extracted.direction.lowercased() == "credit" ? "credit" : "debit"
        return RescueGuess(
            merchantRaw: extracted.merchant.trimmingCharacters(in: .whitespaces),
            date: extracted.date.trimmingCharacters(in: .whitespaces),
            amount: amount,
            direction: direction
        )
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
