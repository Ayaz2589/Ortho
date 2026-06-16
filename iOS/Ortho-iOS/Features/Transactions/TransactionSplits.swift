import Foundation

// Pure, cross-platform transaction-split math — mirror of web/lib/splits.ts.
// Locked by the shared golden vectors (shared/test-vectors/transaction-splits.json);
// see Ortho-iOSTests/TransactionSplitParityTests.swift. The even/percent paths use
// `Double` (IEEE-754, identical to the TS `number`) so the two implementations
// cannot diverge. Integer USD cents. See specs/007-household-splits.

enum SplitMethod: String, CaseIterable { case even, percent, value }

/// How a multi-owner transaction is divided. Generic over the owner id so the
/// app uses `Person.ID` (UUID) while the parity test uses `String`.
enum SplitInput<ID: Hashable> {
    case even
    case percent([ID: Double])
    case value([ID: Int64])
}

/// Percentages may total 100 ± this and still be accepted (matches the TS).
let percentTolerance = 0.5

/// Cents per owner. `owners` is ordered (count ≥ 1). Always sums to `amountCents`
/// for `.even`/`.percent`; `.value` returns the entered cents (validate first).
/// Leftover cents from flooring are handed out one per owner in list order.
func computeShares<ID: Hashable>(_ amountCents: Int64, _ owners: [ID], _ split: SplitInput<ID>) -> [ID: Int64] {
    let n = owners.count
    var out: [ID: Int64] = [:]
    if n == 0 { return out }
    if n == 1 { out[owners[0]] = amountCents; return out }

    let targets: [Double]
    switch split {
    case .value(let values):
        for id in owners { out[id] = values[id] ?? 0 }
        return out
    case .even:
        targets = owners.map { _ in Double(amountCents) / Double(n) }
    case .percent(let pcts):
        targets = owners.map { Double(amountCents) * (pcts[$0] ?? 0) / 100.0 }
    }

    var assigned: Int64 = 0
    for (idx, id) in owners.enumerated() {
        let base = Int64(targets[idx].rounded(.down))
        out[id] = base
        assigned += base
    }
    var leftover = amountCents - assigned
    var i = 0
    while leftover > 0 {
        out[owners[i % n], default: 0] += 1
        leftover -= 1
        i += 1
    }
    return out
}

/// Save gate: percents total 100 (±tolerance); values total the amount exactly.
enum SplitValidation: Equatable {
    case ok
    case invalid(reason: String) // "percent_sum" | "value_sum" | "no_owners"
}

func validateSplit<ID: Hashable>(_ amountCents: Int64, _ owners: [ID], _ split: SplitInput<ID>) -> SplitValidation {
    if owners.isEmpty { return .invalid(reason: "no_owners") }
    switch split {
    case .even:
        return .ok
    case .percent(let pcts):
        let sum = owners.reduce(0.0) { $0 + (pcts[$1] ?? 0) }
        return abs(sum - 100) <= percentTolerance ? .ok : .invalid(reason: "percent_sum")
    case .value(let values):
        let sum = owners.reduce(Int64(0)) { $0 + (values[$1] ?? 0) }
        return sum == amountCents ? .ok : .invalid(reason: "value_sum")
    }
}

/// Even-split cents per owner — convenience for the common default.
func evenShares<ID: Hashable>(_ amountCents: Int64, _ owners: [ID]) -> [ID: Int64] {
    computeShares(amountCents, owners, .even)
}

/// Derived display percentage for an owner's cents share (0 when amount is 0).
func sharePercent(_ shareCents: Int64, of amountCents: Int64) -> Int {
    if amountCents == 0 { return 0 }
    return Int((Double(shareCents) / Double(amountCents) * 100).rounded())
}
