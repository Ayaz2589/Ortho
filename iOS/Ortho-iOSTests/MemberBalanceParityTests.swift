import XCTest
@testable import Ortho_iOS

// Parity: the Swift `balanceBetween` must match the shared golden vectors
// (web-generated). Add `shared/test-vectors/member-balance.json` to this test
// target's "Copy Bundle Resources" so it loads from the test bundle.
// Mirror of web/test/member-balance.parity.test.ts. See specs/012-household-reimbursement.
//
// The vector rows carry non-UUID scaffolding fields (`id: ""`, `created_by: "u"`,
// `household_id: "h"`) that the strict `Transaction` decoder rejects, so we decode
// a MINIMAL struct (only the fields `balanceBetween` reads) and build `Transaction`
// values from it. The person ids ARE UUID-form, exactly as `balanceBetween` needs.
final class MemberBalanceParityTests: XCTestCase {

    private struct TxJSON: Decodable {
        let kind: String
        let paid_by: String?
        let amount_cents: Int64
        let owner_ids: [String]
        let shares: [String: Int64]
    }
    private struct Case: Decodable {
        let name: String
        let viewer: String
        let other: String
        let transactions: [TxJSON]
        let expected: Int64
    }
    private struct Vectors: Decodable { let cases: [Case] }

    /// Build a `Transaction` carrying only what `balanceBetween` reads. Owners,
    /// shares, and paid_by come straight from the vector (UUID-form ids).
    private func makeTransaction(_ j: TxJSON) -> Transaction {
        let kind = TransactionKind(rawValue: j.kind) ?? .expense
        let owners = Set(j.owner_ids.compactMap(UUID.init(uuidString:)))
        let shares = Dictionary(uniqueKeysWithValues: j.shares.compactMap { key, value in
            UUID(uuidString: key).map { ($0, value) }
        })
        return Transaction(
            merchant: "",
            category: kind == .transfer ? .transfer : .groceries,
            kind: kind,
            amount: j.amount_cents,
            ownerIDs: owners,
            shares: shares,
            source: "",
            date: Date(),
            createdBy: UUID(),
            paidBy: j.paid_by.flatMap(UUID.init(uuidString:))
        )
    }

    func testBalanceParityVsGoldenVectors() throws {
        let url = try XCTUnwrap(
            Bundle(for: Self.self).url(forResource: "member-balance", withExtension: "json"),
            "Add shared/test-vectors/member-balance.json to this test target's Copy Bundle Resources"
        )
        let data = try Data(contentsOf: url)
        let vectors = try JSONDecoder().decode(Vectors.self, from: data)
        XCTAssertFalse(vectors.cases.isEmpty)
        XCTAssertEqual(vectors.cases.count, 9, "expected the 9 golden cases")

        for c in vectors.cases {
            let viewer = try XCTUnwrap(UUID(uuidString: c.viewer), "case \(c.name): bad viewer id")
            let other = try XCTUnwrap(UUID(uuidString: c.other), "case \(c.name): bad other id")
            let txs = c.transactions.map(makeTransaction)
            let got = balanceBetween(viewer: viewer, other: other, transactions: txs)
            XCTAssertEqual(got, c.expected, "case: \(c.name)")
        }
    }

    // MARK: - Unit tests (pure Balances + minimal structs; never constructs AppState)

    private let alice = UUID()
    private let bob = UUID()

    /// $150 expense split alice $100 / bob $50, alice paid → bob owes alice $50.
    private func sampleExpense() -> Transaction {
        Transaction(
            merchant: "Whole Foods", category: .groceries, kind: .expense,
            amount: 15000, ownerIDs: [alice, bob],
            shares: [alice: 10000, bob: 5000],
            source: "Card", date: Date(), createdBy: UUID(), paidBy: alice
        )
    }

    /// A $50 reimbursement bob → alice that should settle the sample expense.
    private func sampleTransfer(_ cents: Int64) -> Transaction {
        Transaction(
            merchant: "", category: .transfer, kind: .transfer,
            amount: cents, ownerIDs: [alice],
            shares: [alice: cents],
            source: "", date: Date(), createdBy: UUID(), paidBy: bob
        )
    }

    func testFullReimbursementSettlesToZero() {
        let txs = [sampleExpense(), sampleTransfer(5000)]
        // From alice's view: +5000 (bob's share) − 5000 (bob paid back) = 0.
        XCTAssertEqual(balanceBetween(viewer: alice, other: bob, transactions: txs), 0)
        // And symmetric from bob's view.
        XCTAssertEqual(balanceBetween(viewer: bob, other: alice, transactions: txs), 0)
    }

    func testPartialReimbursementReducesBalance() {
        let txs = [sampleExpense(), sampleTransfer(2000)]
        XCTAssertEqual(balanceBetween(viewer: alice, other: bob, transactions: txs), 3000)
    }

    /// A transfer must contribute to NO spend/income/per-owner aggregate.
    /// We assert against the same pure summations AppState uses, without
    /// constructing AppState (which builds a real SupabaseClient).
    func testTransferExcludedFromSpendIncomePerOwnerAggregates() {
        let expense = sampleExpense()
        let transfer = sampleTransfer(5000)

        func spend(_ txs: [Transaction]) -> Int64 {
            txs.filter { $0.kind == .expense }.reduce(0) { $0 + $1.amount }
        }
        func income(_ txs: [Transaction]) -> Int64 {
            txs.filter { $0.kind == .income }.reduce(0) { $0 + $1.amount }
        }
        func perOwner(_ txs: [Transaction], _ p: Person.ID) -> Int64 {
            txs.filter { $0.kind == .expense && $0.ownerIDs.contains(p) }
               .reduce(0) { $0 + ($1.effectiveShares[p] ?? 0) }
        }

        let before: [Transaction] = [expense]
        let after: [Transaction] = [expense, transfer]

        XCTAssertEqual(spend(before), spend(after), "transfer changed total spend")
        XCTAssertEqual(income(before), income(after), "transfer changed total income")
        XCTAssertEqual(perOwner(before, alice), perOwner(after, alice), "transfer changed alice's spend share")
        XCTAssertEqual(perOwner(before, bob), perOwner(after, bob), "transfer changed bob's spend share")
        // The transfer itself contributes zero to the per-owner expense roll-up.
        XCTAssertEqual(perOwner([transfer], alice), 0)
        XCTAssertEqual(perOwner([transfer], bob), 0)
    }
}
