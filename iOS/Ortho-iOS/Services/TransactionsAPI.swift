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
    /// row per owner. The two inserts are sequential; if the shares insert
    /// fails after the parent succeeded, we delete the just-inserted parent
    /// before rethrowing so we never leave an orphaned, share-less row (which
    /// rehydrate would misread as "creator owns the full amount"). v2 work
    /// could wrap this in a `create_transaction_with_shares` RPC for atomicity.
    func create(_ tx: Transaction) async throws {
        let row = TransactionRecord.from(tx)
        try await client
            .from("transactions")
            .insert(row)
            .execute()

        let shares = Self.shareRows(for: tx)
        guard !shares.isEmpty else { return }
        do {
            try await client
                .from("transaction_shares")
                .insert(shares)
                .execute()
        } catch {
            // Roll back the orphaned parent. Best-effort: if the cleanup itself
            // fails (network), surface the ORIGINAL shares error to the caller.
            try? await client
                .from("transactions")
                .delete()
                .eq("id", value: tx.id)
                .execute()
            throw error
        }
    }

    /// Update an existing transaction. Replaces every share row rather than
    /// computing a diff — simpler, and the share count is always small.
    ///
    /// The old shares are deleted before the new ones are inserted, so a
    /// failure on the insert would otherwise leave the row share-less
    /// (rehydrate then misreads it as "creator owns the full amount"). To
    /// avoid that, `previous` is the pre-edit snapshot: if the new-shares
    /// insert throws, we re-insert the PREVIOUS shares so the server returns
    /// to a consistent state, then rethrow.
    func update(_ tx: Transaction, previous: Transaction) async throws {
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
        do {
            try await client
                .from("transaction_shares")
                .insert(shares)
                .execute()
        } catch {
            // The new shares didn't land and the old ones are already gone —
            // restore the previous shares so the row isn't left share-less.
            // Best-effort restore; the original error is what the caller sees.
            let restore = Self.shareRows(for: previous)
            if !restore.isEmpty {
                try? await client
                    .from("transaction_shares")
                    .insert(restore)
                    .execute()
            }
            throw error
        }
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

    /// One cents-share row per owner (always materialized; values sum to the amount).
    private static func shareRows(for tx: Transaction) -> [TransactionShareRow] {
        let shares = tx.effectiveShares
        return tx.ownerIDs.map { personID in
            TransactionShareRow(
                transactionID: tx.id,
                personID: personID,
                amountCents: shares[personID] ?? 0
            )
        }
    }

    /// Stitch transaction rows back together with their cents shares. A row with
    /// no shares falls back to its creator's person at the full amount — EXCEPT
    /// a `transfer`, whose single owner is the recipient (the payer being
    /// reimbursed), not the creator. Treating a share-less transfer as
    /// "creator owns all" would corrupt the balance, so the fallback is
    /// transfer-aware: it prefers `paid_by`'s counterpart and never invents a
    /// creator-owned expense for a transfer.
    private static func rehydrate(
        rows: [TransactionRecord],
        shares: [TransactionShareRow]
    ) -> [Transaction] {
        let sharesByTx = Dictionary(grouping: shares, by: \.transactionID)
        return rows.map { row in
            let txShares = sharesByTx[row.id] ?? []
            let ownerIDs: Set<Person.ID>
            let shareMap: [Person.ID: Int64]
            if txShares.isEmpty {
                if row.kind == .transfer {
                    // A transfer with no share rows is a malformed/legacy row.
                    // Keep it owner-less (and balance-inert) rather than minting
                    // a phantom "creator owns the full amount" expense-shaped row.
                    ownerIDs = []
                    shareMap = [:]
                } else {
                    ownerIDs = [row.createdBy]
                    shareMap = [row.createdBy: row.amountCents]
                }
            } else {
                ownerIDs = Set(txShares.map(\.personID))
                shareMap = Dictionary(uniqueKeysWithValues: txShares.map { ($0.personID, $0.amountCents) })
            }
            return Transaction(
                id: row.id,
                merchant: row.merchant,
                category: row.category,
                kind: row.kind,
                amount: row.amountCents,
                ownerIDs: ownerIDs,
                shares: shareMap,
                source: row.source,
                date: row.date,
                householdID: row.householdID,
                createdBy: row.createdBy,
                paidBy: row.paidBy
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
    let amountCents: Int64
    let source: String
    let date: Date
    let createdBy: UUID
    let paidBy: UUID?

    static func from(_ tx: Transaction) -> TransactionRecord {
        TransactionRecord(
            id: tx.id,
            householdID: tx.householdID,
            merchant: tx.merchant,
            category: tx.category,
            kind: tx.kind,
            amountCents: tx.amount,
            source: tx.source,
            date: tx.date,
            createdBy: tx.createdBy,
            paidBy: tx.paidBy
        )
    }

    enum CodingKeys: String, CodingKey {
        case id
        case householdID = "household_id"
        case merchant
        case category
        case kind
        case amountCents = "amount_cents"
        case source
        case date
        case createdBy = "created_by"
        case paidBy = "paid_by"
    }
}

private struct TransactionShareRow: Codable {
    let transactionID: UUID
    let personID: UUID
    let amountCents: Int64

    enum CodingKeys: String, CodingKey {
        case transactionID = "transaction_id"
        case personID = "person_id"
        case amountCents = "amount_cents"
    }
}
