import Foundation
import CryptoKit

/// Invite-code codec — spec 017.
///
/// Hand-mirror of `web/lib/invites.ts` per the cross-surface convention
/// contract (`specs/017-partner-invite-join/contracts/invite-code.md`), kept
/// in sync BY HAND like the spec-014 ScanHeuristics tables and locked by
/// identical literal test cases in `InviteCodecTests` and the web suite —
/// deliberately NOT a golden vector (no money/date math).
///
/// The CANONICAL form (10 uppercase Crockford-base32 chars, no separator) is
/// the identity: its SHA-256 is what `pending_invites.token_hash` stores AND
/// what the `accept_invite` RPC hashes (`encode(digest(p_token,'sha256'),'hex')`)
/// — so a code minted on either surface redeems on both.
enum InviteCodec {
    /// Crockford base32 — I, L, O, U excluded (confusables handled by `canonicalize`).
    static let alphabet = Array("0123456789ABCDEFGHJKMNPQRSTVWXYZ")

    static let codeLength = 10

    /// Invite lifetime: exactly 7 × 24h from the creation instant (contract §7).
    static let ttl: TimeInterval = 7 * 24 * 60 * 60

    /// A fresh canonical 10-char code (~50 bits) from the system CSPRNG.
    static func generate<R: RandomNumberGenerator>(using rng: inout R) -> String {
        // 32 divides 256, so `byte & 31` is bias-free — same mapping as web.
        String((0..<codeLength).map { _ in alphabet[Int(UInt8.random(in: 0...255, using: &rng)) & 31] })
    }

    static func generate() -> String {
        var rng = SystemRandomNumberGenerator()
        return generate(using: &rng)
    }

    /// Display form: XXXXX-XXXXX. Display is derived; canonical is the identity.
    static func format(_ canonical: String) -> String {
        guard canonical.count > 5 else { return canonical }
        let mid = canonical.index(canonical.startIndex, offsetBy: 5)
        return "\(canonical[..<mid])-\(canonical[mid...])"
    }

    /// Normalize any typed form to canonical: uppercase, map the Crockford
    /// confusables (O→0, I→1, L→1), strip every non-alphanumeric. Applied on
    /// BOTH the create-side hash and redemption (contract §3).
    static func canonicalize(_ input: String) -> String {
        String(
            input.uppercased()
                .map { (ch: Character) -> Character in
                    switch ch {
                    case "O": return "0"
                    case "I", "L": return "1"
                    default: return ch
                    }
                }
                .filter { ("0"..."9").contains($0) || ("A"..."Z").contains($0) }
        )
    }

    /// Lowercase-hex SHA-256 of the canonical string — equals Postgres
    /// `encode(digest(p_token,'sha256'),'hex')` for the same token (contract §4).
    static func hashHex(_ canonical: String) -> String {
        SHA256.hash(data: Data(canonical.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }

    enum Status: String {
        case pending, redeemed, expired
    }

    /// Client-derived status; precedence redeemed → expired → pending (contract §7).
    static func status(expiresAt: Date, redeemedAt: Date?, now: Date) -> Status {
        if redeemedAt != nil { return .redeemed }
        if expiresAt <= now { return .expired }
        return .pending
    }
}
