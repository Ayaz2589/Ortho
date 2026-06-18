import Foundation

// Pure, cross-platform member-balance math — mirror of web/lib/balances.ts.
// Locked by the shared golden vectors (shared/test-vectors/member-balance.json);
// see Ortho-iOSTests/MemberBalanceParityTests.swift. Integer cents only, no
// rounding. See specs/012-household-reimbursement.

/// Net cents owed between two household members, from the `viewer`'s perspective.
/// Positive ⇒ `other` owes `viewer`; negative ⇒ `viewer` owes `other`; 0 ⇒ settled.
///
/// - **Expense** (with a payer): every owner who is NOT the payer owes the payer
///   that owner's share. So if `viewer` paid, `other` owes their share (+); if
///   `other` paid, `viewer` owes their share (−). The payer's own share is owed
///   by nobody (we only read the other party's share).
/// - **Transfer** (reimbursement): `paidBy` is the sender, the single owner is
///   the recipient, `amount` is the amount. `other → viewer` reduces what
///   `other` owes (−); `viewer → other` reduces what `viewer` owes, i.e. raises
///   the net (+).
///
/// Mirrors web `balanceBetween` exactly.
func balanceBetween(
    viewer: Person.ID,
    other: Person.ID,
    transactions: [Transaction]
) -> Int64 {
    var net: Int64 = 0
    for t in transactions {
        switch t.kind {
        case .expense:
            guard let payer = t.paidBy else { continue }
            if payer == viewer {
                net += t.shares[other] ?? 0
            } else if payer == other {
                net -= t.shares[viewer] ?? 0
            }
        case .transfer:
            guard let from = t.paidBy, let to = t.ownerIDs.first else { continue }
            if from == other && to == viewer {
                net -= t.amount
            } else if from == viewer && to == other {
                net += t.amount
            }
        case .income:
            continue
        }
    }
    return net
}

/// Per-other-member net balance for `viewer` (positive ⇒ they owe the viewer).
/// Convenience over `balanceBetween`; only `balanceBetween` is vectored.
func balancesForViewer(
    viewer: Person.ID,
    memberIDs: [Person.ID],
    transactions: [Transaction]
) -> [(personID: Person.ID, net: Int64)] {
    memberIDs
        .filter { $0 != viewer }
        .map { (personID: $0, net: balanceBetween(viewer: viewer, other: $0, transactions: transactions)) }
}
