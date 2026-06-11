import Foundation

/// An outstanding invitation to join a household. The raw token is generated
/// client-side, hashed (sha256), and only the hash is stored — the raw token
/// lives in the magic-link email + QR payload. Redemption goes through the
/// `accept_invite(token)` RPC.
///
/// Mirrors the Postgres `pending_invites` row.
struct PendingInvite: Identifiable, Hashable, Codable {
    let id: UUID
    var householdID: Household.ID
    /// Optional — if the invite isn't tied to a specific email, anyone who
    /// holds the raw token can redeem it (typical for QR-code flow).
    var email: String?
    var role: Role
    var tokenHash: String
    var expiresAt: Date
    var createdBy: User.ID
    var createdAt: Date
    /// Non-nil after `accept_invite` succeeds. Acts as a one-shot guard so
    /// the same token can't be reused.
    var redeemedAt: Date?

    init(id: UUID = UUID(),
         householdID: Household.ID,
         email: String? = nil,
         role: Role = .member,
         tokenHash: String,
         expiresAt: Date,
         createdBy: User.ID,
         createdAt: Date = .now,
         redeemedAt: Date? = nil) {
        self.id = id
        self.householdID = householdID
        self.email = email
        self.role = role
        self.tokenHash = tokenHash
        self.expiresAt = expiresAt
        self.createdBy = createdBy
        self.createdAt = createdAt
        self.redeemedAt = redeemedAt
    }

    enum CodingKeys: String, CodingKey {
        case id
        case householdID = "household_id"
        case email
        case role
        case tokenHash   = "token_hash"
        case expiresAt   = "expires_at"
        case createdBy   = "created_by"
        case createdAt   = "created_at"
        case redeemedAt  = "redeemed_at"
    }
}
