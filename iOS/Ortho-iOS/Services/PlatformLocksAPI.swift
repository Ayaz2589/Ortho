import Foundation
import Supabase

/// Single-active-platform lock — the iOS half of the `platform_locks` parity
/// (web claims `platform='web'`; iOS claims `'ios'`). Whoever signs in last
/// owns the lock; the other client yields. Mirrors web/lib/store.tsx's
/// upsert-on-bootstrap / delete-on-sign-out, so the "one active device"
/// guarantee holds regardless of which client is used.
struct PlatformLocksAPI {
    let client: SupabaseClient

    static let platform = "ios"

    private struct LockRow: Encodable {
        let userID: UUID
        let platform: String
        let lockedAt: String
        enum CodingKeys: String, CodingKey {
            case userID = "user_id"
            case platform
            case lockedAt = "locked_at"
        }
    }

    private struct PlatformRow: Decodable { let platform: String }

    /// Claim the lock for iOS (upsert) so web yields to this device.
    func claim(userID: UUID) async throws {
        let row = LockRow(userID: userID,
                          platform: Self.platform,
                          lockedAt: ISO8601DateFormatter().string(from: Date()))
        try await client.from("platform_locks").upsert(row, onConflict: "user_id").execute()
    }

    /// Release the lock on sign-out.
    func release(userID: UUID) async throws {
        try await client.from("platform_locks").delete().eq("user_id", value: userID).execute()
    }

    /// The platform that currently owns the lock for this user (nil if none).
    func current(userID: UUID) async throws -> String? {
        let rows: [PlatformRow] = try await client
            .from("platform_locks")
            .select("platform")
            .eq("user_id", value: userID)
            .execute()
            .value
        return rows.first?.platform
    }
}
