import Foundation
import Supabase

/// Server-backed CRUD for `Transaction`. Talks to the `transactions` and
/// `transaction_shares` tables. RLS handles visibility — `fetch()` returns
/// everything the signed-in user can see (their personal rows + every
/// household they're a member of), no filter needed client-side.
///
/// The Swift `Transaction` collapses two tables into one value, so the API
/// glues them: on read it joins shares back onto rows; on write it splits
/// a Transaction into the parent row + N share rows. For `.shared` scope a
/// share row is materialized per owner (with the explicit or derived
/// percent). For `.personal` scope no share rows are written — the owner is
/// implicit via `created_by`.
struct TransactionsAPI {
    private let client: SupabaseClient

    init(client: SupabaseClient) {
        self.client = client
    }

    // MARK: - Read

    /// All transactions visible to the current user. RLS enforces visibility
    /// — no explicit filter here. Ordered by date desc to match the activity
    /// list's natural read order.
    func fetch() async throws -> [Transaction] {
        let rows: [TransactionRecord] = try await client
            .from("transactions")
            .select()
            .order("date", ascending: false)
            .execute()
            .value

        let shares: [TransactionShareRow] = try await client
            .from("transaction_shares")
            .select()
            .execute()
            .value

        return Self.rehydrate(rows: rows, shares: shares)
    }

    // MARK: - Write

    /// Insert a new transaction. For `.shared` scope, materializes one share
    /// row per owner. The two inserts are sequential; if shares fail after
    /// the parent succeeded, the row is left without shares (recoverable by
    /// retrying or by an `update` call). v2 work could wrap this in a
    /// `create_transaction_with_shares` RPC for atomicity.
    func create(_ tx: Transaction) async throws {
        let row = TransactionRecord.from(tx)
        try await client
            .from("transactions")
            .insert(row)
            .execute()

        let shares = Self.shareRows(for: tx)
        guard !shares.isEmpty else { return }
        try await client
            .from("transaction_shares")
            .insert(shares)
            .execute()
    }

    /// Update an existing transaction. Replaces every share row rather than
    /// computing a diff — simpler, and the share count is always small.
    func update(_ tx: Transaction) async throws {
        let row = TransactionRecord.from(tx)
        try await client
            .from("transactions")
            .update(row)
            .eq("id", value: tx.id)
            .execute()

        try await client
            .from("transaction_shares")
            .delete()
            .eq("transaction_id", value: tx.id)
            .execute()

        let shares = Self.shareRows(for: tx)
        guard !shares.isEmpty else { return }
        try await client
            .from("transaction_shares")
            .insert(shares)
            .execute()
    }

    /// Delete a transaction. The FK from `transaction_shares.transaction_id`
    /// uses `ON DELETE CASCADE` so child shares vanish automatically.
    func delete(id: Transaction.ID) async throws {
        try await client
            .from("transactions")
            .delete()
            .eq("id", value: id)
            .execute()
    }

    // MARK: - Internals

    private static func shareRows(for tx: Transaction) -> [TransactionShareRow] {
        guard tx.scope == .shared else { return [] }
        return tx.effectiveSplits.map { (userID, percent) in
            TransactionShareRow(
                transactionID: tx.id,
                userID: userID,
                percent: percent
            )
        }
    }

    /// Stitch transaction rows back together with their shares to produce
    /// Swift `Transaction` values. For `.personal` rows the owner set is
    /// `[createdBy]` by convention (no `transaction_shares` rows exist).
    private static func rehydrate(
        rows: [TransactionRecord],
        shares: [TransactionShareRow]
    ) -> [Transaction] {
        let sharesByTx = Dictionary(grouping: shares, by: \.transactionID)
        return rows.map { row in
            let txShares = sharesByTx[row.id] ?? []
            let ownerIDs: Set<User.ID>
            let splits: [User.ID: Decimal]?
            switch row.scope {
            case .personal:
                ownerIDs = [row.createdBy]
                splits = nil
            case .shared:
                ownerIDs = Set(txShares.map(\.userID))
                splits = txShares.isEmpty
                    ? nil
                    : Dictionary(uniqueKeysWithValues: txShares.map { ($0.userID, $0.percent) })
            }
            return Transaction(
                id: row.id,
                merchant: row.merchant,
                category: row.category,
                kind: row.kind,
                amount: row.amountCents,
                scope: row.scope,
                ownerIDs: ownerIDs,
                splits: splits,
                source: row.source,
                date: row.date,
                householdID: row.householdID,
                createdBy: row.createdBy
            )
        }
    }
}

// MARK: - Row DTOs

/// Mirrors the columns on `public.transactions`. Decoded directly from
/// PostgREST responses. Kept private — call sites should only see the
/// rehydrated `Transaction`.
private struct TransactionRecord: Codable {
    let id: UUID
    let householdID: UUID?
    let merchant: String
    let category: TransactionCategory
    let kind: TransactionKind
    let scope: TransactionScope
    let amountCents: Int64
    let source: String
    let date: Date
    let createdBy: UUID

    static func from(_ tx: Transaction) -> TransactionRecord {
        TransactionRecord(
            id: tx.id,
            householdID: tx.householdID,
            merchant: tx.merchant,
            category: tx.category,
            kind: tx.kind,
            scope: tx.scope,
            amountCents: tx.amount,
            source: tx.source,
            date: tx.date,
            createdBy: tx.createdBy
        )
    }

    enum CodingKeys: String, CodingKey {
        case id
        case householdID = "household_id"
        case merchant
        case category
        case kind
        case scope
        case amountCents = "amount_cents"
        case source
        case date
        case createdBy = "created_by"
    }
}

private struct TransactionShareRow: Codable {
    let transactionID: UUID
    let userID: UUID
    let percent: Decimal

    enum CodingKeys: String, CodingKey {
        case transactionID = "transaction_id"
        case userID = "user_id"
        case percent
    }
}
