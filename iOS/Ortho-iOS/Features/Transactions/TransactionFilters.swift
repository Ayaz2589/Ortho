import Foundation

// Pure, cross-platform transaction filtering — mirror of web/lib/transactionFilters.ts.
// Locked by the shared golden vectors (shared/test-vectors/transaction-filters.json);
// see Ortho-iOSTests/TransactionFilterParityTests.swift. See specs/006-transaction-filters.

struct FilterCriteria: Equatable {
    enum Kind: String, CaseIterable { case all, expense, income, transfer }

    var query: String = ""
    var categories: Set<TransactionCategory> = []
    var kind: Kind = .all
    var sources: Set<String> = []
    var owners: Set<User.ID> = []
    /// Inclusive lower bound (`date >= from`).
    var dateFrom: Date? = nil
    /// Exclusive upper bound (`date < to`). Half-open `[from, to)`.
    var dateTo: Date? = nil

    static let empty = FilterCriteria()
}

struct FilterContext {
    /// ownerId → display name, for search-by-owner-name.
    var ownerNames: [User.ID: String]
}

/// Subset of `txs` passing ALL dimensions (OR within a multi-select). Order preserved.
func filterTransactions(_ txs: [Transaction], _ c: FilterCriteria, _ ctx: FilterContext) -> [Transaction] {
    // `.whitespacesAndNewlines` matches JS `String.prototype.trim()` (which also
    // strips newlines) so a trailing "\n" in the query behaves identically.
    let q = c.query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return txs.filter { tx in
        // search
        if !q.isEmpty {
            var hit = tx.merchant.lowercased().contains(q)
                || tx.source.lowercased().contains(q)
                || tx.category.rawValue.lowercased().contains(q)
            if !hit {
                for id in tx.ownerIDs {
                    if let name = ctx.ownerNames[id], name.lowercased().contains(q) { hit = true; break }
                }
            }
            if !hit { return false }
        }
        // category
        if !c.categories.isEmpty && !c.categories.contains(tx.category) { return false }
        // kind
        if c.kind != .all && tx.kind.rawValue != c.kind.rawValue { return false }
        // source
        if !c.sources.isEmpty && !c.sources.contains(tx.source) { return false }
        // owner
        if !c.owners.isEmpty && tx.ownerIDs.isDisjoint(with: c.owners) { return false }
        // date (half-open)
        if let from = c.dateFrom, tx.date < from { return false }
        if let to = c.dateTo, tx.date >= to { return false }
        return true
    }
}

/// Count of non-default dimensions (for the "N filters active" badge).
func activeFilterCount(_ c: FilterCriteria) -> Int {
    var n = 0
    if !c.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { n += 1 }
    if !c.categories.isEmpty { n += 1 }
    if c.kind != .all { n += 1 }
    if !c.sources.isEmpty { n += 1 }
    if !c.owners.isEmpty { n += 1 }
    if c.dateFrom != nil || c.dateTo != nil { n += 1 }
    return n
}

/// Distinct non-empty sources present in the transactions, alphabetized.
func availableSources(_ txs: [Transaction]) -> [String] {
    var set = Set<String>()
    for tx in txs {
        let s = tx.source.trimmingCharacters(in: .whitespacesAndNewlines)
        if !s.isEmpty { set.insert(s) }
    }
    // Localized, case-insensitive order — mirrors web `a.localeCompare(b)` (a
    // locale-aware collation), NOT Swift's default Unicode code-point `sorted()`.
    return set.sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
}

/// "2026-05" → half-open UTC month window. Timezone-stable (matches the TS).
///
/// Input is validated STRICTLY against `^\d{4}-\d{2}$`: "2026-5", "26-5",
/// "2026-005", and "2026--5" are all rejected (exactly like web's regex).
/// Web THROWS `INVALID_MONTH` on a bad string; every Swift call site here uses
/// `if let (from, to) = monthBounds(...)`, so the mirrored strictness surfaces
/// as the documented safe failure `nil` (a bad month yields no window) rather
/// than a trap.
func monthBounds(_ yyyymm: String) -> (dateFrom: Date, dateTo: Date)? {
    // Strict shape: 4 ASCII digits, '-', 2 ASCII digits. `split` is too lenient
    // (it drops empty fields), so validate the exact layout character by character.
    let chars = Array(yyyymm)
    func isDigit(_ c: Character) -> Bool { c.isASCII && c.isNumber }
    guard chars.count == 7, chars[4] == "-",
          isDigit(chars[0]), isDigit(chars[1]), isDigit(chars[2]), isDigit(chars[3]),
          isDigit(chars[5]), isDigit(chars[6]),
          let y = Int(String(chars[0...3])),
          let mo = Int(String(chars[5...6])),
          (1...12).contains(mo) else { return nil }
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = TimeZone(identifier: "UTC")!
    guard let from = cal.date(from: DateComponents(year: y, month: mo, day: 1)),
          let to = cal.date(byAdding: .month, value: 1, to: from) else { return nil }
    return (from, to)
}
