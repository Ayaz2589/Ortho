// Inference tiers for parsed candidates (spec 014, FR-013/FR-015/FR-016;
// research R7): 1) the household's own history with the merchant, 2) the
// CLI-ported category rule table, 3) nothing — the form default stands.
// (The optional on-device refiner, tier 2.5 for merchant cleanup only, lives
// in ScanRefiner and NEVER runs inside parse — determinism contract.)
// Pure: everything arrives via ScanContext; no clock, no live collections.

import Foundation

enum ScanInference {

    /// Enrich one candidate in place: history/category/owners guesses plus
    /// greedy one-to-one duplicate claiming against `claimed` (FR-015).
    static func enrich(_ candidate: ParsedCandidate,
                       context: ScanContext,
                       claimed: inout Set<Transaction.ID>) -> ParsedCandidate {
        var c = candidate

        // Payment rows are default-skipped wholesale — no guesses (FR-012).
        // Credits prefill as income, whose category the form locks — no guess.
        if !c.isPaymentRow && c.direction == .debit {
            if let match = historyMatch(for: c.merchantRaw, in: context.history) {
                // Adopt the household's own spelling — their data, not a guess.
                c.merchant = match.displayMerchant
                c.categoryGuess = match.category
                c.guesses.insert(.category)
                if !match.owners.isEmpty {
                    c.ownersGuess = match.owners
                    c.guesses.insert(.owners)
                }
            } else if let rule = ScanHeuristics.ruleCategory(for: c.merchantRaw) {
                c.categoryGuess = rule
                c.guesses.insert(.category)
            }
        }

        // Duplicate: same calendar day + same amount, USD candidates only
        // (foreign totals aren't comparable to stored USD cents without a
        // rate). Each existing transaction is claimable once per session.
        if c.currency == .usd, let day = c.date {
            if let hit = context.existing.first(where: {
                !claimed.contains($0.id)
                    && $0.amountCents == c.amountCents
                    && sameDay($0.day, day)
            }) {
                c.duplicateOf = hit.id
                claimed.insert(hit.id)
            }
        }
        return c
    }

    /// History lookup: normalized-key equality or prefix containment either
    /// way ("TRADERJOES" ↔ "TRADERJOESNEWYORK"), minimum 4 chars so junk
    /// prefixes can't match. Ranking: dominant count, then recency.
    private static func historyMatch(for merchant: String,
                                     in history: [MerchantHistory]) -> MerchantHistory? {
        let key = ScanHeuristics.normalizeMerchant(merchant)
        guard key.count >= 4 else { return nil }
        let hits = history.filter { entry in
            let h = entry.normalizedMerchant
            guard h.count >= 4 else { return false }
            return h == key || key.hasPrefix(h) || h.hasPrefix(key)
        }
        return hits.max { a, b in
            if a.count != b.count { return a.count < b.count }
            return dayOrdinal(a.lastDay) < dayOrdinal(b.lastDay)
        }
    }

    private static func sameDay(_ a: DateComponents, _ b: DateComponents) -> Bool {
        a.year == b.year && a.month == b.month && a.day == b.day
    }

    private static func dayOrdinal(_ d: DateComponents?) -> Int {
        guard let d else { return 0 }
        return (d.year ?? 0) * 10000 + (d.month ?? 0) * 100 + (d.day ?? 0)
    }

    // MARK: - Context building (app side — the only non-fixture caller)

    /// Snapshot AppState data into a pure ScanContext. `now` is the demo
    /// reference date under -uiDemoScan, the real clock otherwise — injected
    /// here at the boundary so everything downstream stays deterministic.
    static func buildContext(transactions: [Transaction],
                             defaultCurrency: Currency,
                             calendar: Calendar,
                             now: Date) -> ScanContext {
        let existing = transactions.map { tx in
            ExistingTransactionDay(
                id: tx.id,
                day: calendar.dateComponents([.year, .month, .day], from: tx.date),
                amountCents: tx.amount
            )
        }

        // History: expenses only, grouped by normalized merchant; the
        // dominant category wins (ties → most recent); display spelling and
        // owners come from the group's most recent transaction.
        struct Group {
            var byCategory: [TransactionCategory: (count: Int, lastDate: Date)] = [:]
            var latest: Transaction
        }
        var groups: [String: Group] = [:]
        for tx in transactions where tx.kind == .expense {
            let key = ScanHeuristics.normalizeMerchant(tx.merchant)
            guard key.count >= 4 else { continue }
            var group = groups[key] ?? Group(latest: tx)
            let prior = group.byCategory[tx.category] ?? (0, .distantPast)
            group.byCategory[tx.category] = (prior.count + 1, max(prior.lastDate, tx.date))
            if tx.date > group.latest.date { group.latest = tx }
            groups[key] = group
        }

        let history: [MerchantHistory] = groups.map { key, group in
            let dominant = group.byCategory.max { a, b in
                if a.value.count != b.value.count { return a.value.count < b.value.count }
                return a.value.lastDate < b.value.lastDate
            }
            return MerchantHistory(
                normalizedMerchant: key,
                displayMerchant: group.latest.merchant,
                category: dominant?.key ?? group.latest.category,
                count: group.byCategory.values.reduce(0) { $0 + $1.count },
                lastDay: calendar.dateComponents([.year, .month, .day], from: group.latest.date),
                owners: orderedOwnerIds(Array(group.latest.ownerIDs))
            )
        }

        return ScanContext(
            existing: existing,
            history: history,
            defaultCurrency: defaultCurrency,
            referenceDay: calendar.dateComponents([.year, .month, .day], from: now)
        )
    }
}
