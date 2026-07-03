// Optional on-device refinement via Apple's Foundation Models (spec 014,
// research R4). Strictly additive polish on the heuristic baseline:
//   • merchant display cleanup ("TST* BLUE BOTTLE 04722" → "Blue Bottle")
//   • a category suggestion ONLY when history and the rule table were silent
// Never amounts, never dates — those stay deterministic. Any failure,
// timeout (~2 s), or unavailability returns the input unchanged (FR-018).
// Receipt path only; statement rows already get the CLI rule table.
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
#endif
