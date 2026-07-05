import Foundation
import Supabase

/// A `pending_invites` row as the clients see it (spec 017). `token_hash` is
/// deliberately absent — the raw code exists only in the one-time reveal and
/// the hash never round-trips into UI state (FR-005). Mirrors the web
/// `PendingInvite` type in `web/lib/types.ts`.
struct PendingInvite: Identifiable, Hashable, Codable {
    let id: UUID
    let householdID: UUID
    let role: Role
    let expiresAt: Date
    let createdAt: Date
    let redeemedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case householdID = "household_id"
        case role
        case expiresAt = "expires_at"
        case createdAt = "created_at"
        case redeemedAt = "redeemed_at"
    }

    /// Client-derived status (contracts/invite-code.md §7) — never stored.
    func status(now: Date = .now) -> InviteCodec.Status {
        InviteCodec.status(expiresAt: expiresAt, redeemedAt: redeemedAt, now: now)
    }
}

/// Server-backed operations for partner invites (spec 017): create/list/revoke
/// ride the owner-only RLS policies on `pending_invites`; redemption is the
/// app's first RPC call site — the `accept_invite` function that shipped in
/// the v1 initial migration (see the dormant note in `HouseholdsAPI`).
struct InvitesAPI {
    private let client: SupabaseClient

    init(client: SupabaseClient) {
        self.client = client
    }

    /// The household's invites, newest first. Owners get rows; members get
    /// zero rows via RLS — an empty list, never an error (mirrors web loadAll).
    func fetch(householdID: Household.ID) async throws -> [PendingInvite] {
        try await client
            .from("pending_invites")
            .select("id, household_id, role, expires_at, created_at, redeemed_at")
            .eq("household_id", value: householdID)
            .order("created_at", ascending: false)
            .execute()
            .value
    }

    /// Persist a new invite. Only the SHA-256 of the canonical code is written
    /// (FR-005); the caller holds the raw code for its one-time reveal.
    func create(
        id: UUID,
        householdID: Household.ID,
        tokenHash: String,
        expiresAt: Date,
        createdBy: User.ID
    ) async throws {
        try await client
            .from("pending_invites")
            .insert(InviteInsertRow(
                id: id,
                householdID: householdID,
                role: .member,
                tokenHash: tokenHash,
                expiresAt: expiresAt,
                createdBy: createdBy
            ))
            .execute()
    }

    /// Revoke = delete (there is no UPDATE policy on `pending_invites` — by
    /// design; see the spec's assumptions). Owner-only via RLS.
    func revoke(id: PendingInvite.ID) async throws {
        try await client
            .from("pending_invites")
            .delete()
            .eq("id", value: id)
            .execute()
    }

    /// Redeem a CANONICAL token via the `accept_invite` RPC (never the display
    /// form — contract §4). Returns the joined household id. The RPC's single
    /// failure ("Invite is invalid, redeemed, or expired") surfaces as a thrown
    /// error the caller maps to the calm copy.
    func redeem(canonicalToken: String) async throws -> UUID {
        try await client
            .rpc("accept_invite", params: RedeemParams(pToken: canonicalToken))
            .execute()
            .value
    }
}

// MARK: - DTOs

private struct InviteInsertRow: Encodable {
    let id: UUID
    let householdID: UUID
    let role: Role
    let tokenHash: String
    let expiresAt: Date
    let createdBy: UUID

    enum CodingKeys: String, CodingKey {
        case id
        case householdID = "household_id"
        case role
        case tokenHash = "token_hash"
        case expiresAt = "expires_at"
        case createdBy = "created_by"
    }
}

private struct RedeemParams: Encodable {
    let pToken: String
    enum CodingKeys: String, CodingKey {
        case pToken = "p_token"
    }
}
