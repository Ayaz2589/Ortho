import XCTest
@testable import Ortho_iOS

/// Spec 017 — the invite-code convention lock (cross-surface, hand-mirrored).
///
/// The literal cases marked "contract §6" MUST stay byte-identical to
/// `web/test/invites.test.ts` — see
/// `specs/017-partner-invite-join/contracts/invite-code.md` for the change
///-control rules. Pure logic only (spec-015 pattern): no live AppState, no
/// network, injected dates.
final class InviteCodecTests: XCTestCase {

    // MARK: - Generation

    func test_generateProducesTenAlphabetChars() {
        for _ in 0..<50 {
            let code = InviteCodec.generate()
            XCTAssertEqual(code.count, InviteCodec.codeLength)
            for ch in code {
                XCTAssertTrue(InviteCodec.alphabet.contains(ch), "unexpected char \(ch)")
            }
        }
    }

    func test_generateIsNotConstant() {
        let codes = Set((0..<20).map { _ in InviteCodec.generate() })
        XCTAssertGreaterThan(codes.count, 1)
    }

    /// Contract §6 T5 — round-trip property.
    func test_formatCanonicalizeRoundTrip() {
        for _ in 0..<20 {
            let g = InviteCodec.generate()
            XCTAssertEqual(InviteCodec.canonicalize(InviteCodec.format(g)), g)
        }
    }

    // MARK: - Contract §6 literals (identical in web/test/invites.test.ts)

    /// Contract §6 T1.
    func test_canonicalizeUppercasesAndStrips() {
        XCTAssertEqual(InviteCodec.canonicalize("abcde-23456"), "ABCDE23456")
    }

    /// Contract §6 T2.
    func test_canonicalizeMapsConfusables() {
        XCTAssertEqual(InviteCodec.canonicalize("oil0-o1ilo"), "011001110")
    }

    func test_canonicalizeStripsEveryNonAlphanumeric() {
        XCTAssertEqual(InviteCodec.canonicalize(" ab cd e_2:34•56 "), "ABCDE23456")
    }

    /// Contract §6 T3 — must equal Postgres
    /// `encode(digest('ABCDE23456','sha256'),'hex')`, i.e. what the
    /// `accept_invite` RPC computes for the same canonical token.
    func test_hashMatchesTheSharedLiteral() {
        XCTAssertEqual(
            InviteCodec.hashHex("ABCDE23456"),
            "82a15347a056ccbf451fbd1c865eed21ec190069eedd32b0c9dc6452887811cc"
        )
    }

    func test_hashIs64LowercaseHexChars() {
        let hex = InviteCodec.hashHex(InviteCodec.generate())
        XCTAssertEqual(hex.count, 64)
        XCTAssertTrue(hex.allSatisfy { "0123456789abcdef".contains($0) })
    }

    /// Contract §6 T4.
    func test_formatGroupsFiveFive() {
        XCTAssertEqual(InviteCodec.format("ABCDE23456"), "ABCDE-23456")
    }

    // MARK: - Status precedence (contract §7) — injected dates, never the clock

    func test_statusPrecedence() {
        let now = ISO8601DateFormatter().date(from: "2026-07-05T12:00:00Z")!
        let past = ISO8601DateFormatter().date(from: "2026-07-01T12:00:00Z")!
        let future = ISO8601DateFormatter().date(from: "2026-07-10T12:00:00Z")!

        // redeemed wins over everything
        XCTAssertEqual(InviteCodec.status(expiresAt: past, redeemedAt: past, now: now), .redeemed)
        XCTAssertEqual(InviteCodec.status(expiresAt: future, redeemedAt: past, now: now), .redeemed)
        // expired when expires_at ≤ now and not redeemed
        XCTAssertEqual(InviteCodec.status(expiresAt: past, redeemedAt: nil, now: now), .expired)
        XCTAssertEqual(InviteCodec.status(expiresAt: now, redeemedAt: nil, now: now), .expired)
        // pending otherwise
        XCTAssertEqual(InviteCodec.status(expiresAt: future, redeemedAt: nil, now: now), .pending)
    }

    // MARK: - Deterministic generation with an injected RNG

    func test_generateWithSeededRNGIsDeterministic() {
        struct FixedRNG: RandomNumberGenerator {
            var value: UInt64
            mutating func next() -> UInt64 {
                value = value &* 6364136223846793005 &+ 1442695040888963407
                return value
            }
        }
        var a = FixedRNG(value: 42)
        var b = FixedRNG(value: 42)
        XCTAssertEqual(InviteCodec.generate(using: &a), InviteCodec.generate(using: &b))
    }
}
