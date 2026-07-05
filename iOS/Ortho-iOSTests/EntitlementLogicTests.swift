import CryptoKit
import XCTest
@testable import Ortho_iOS

/// spec 018 — the entitlement gate derivation lock.
///
/// The literal vectors below are embedded VERBATIM from
/// `specs/018-subscription-system/contracts/entitlement-state.md` (the 017
/// `InviteCodec` pattern: identical table in the core, web, and iOS suites,
/// plus a canonical-serialization digest so any drift in vectors or
/// serialization fails the drifted surface). Amend the contract before
/// touching anything here. Siblings: `services/billing/test/derive.test.ts`
/// (canonical) and `web/test/entitlements.test.ts`.
@MainActor
final class EntitlementLogicTests: XCTestCase {

    // MARK: - Literal vectors (contract, VERBATIM)

    private static let vectorNow = "2026-07-05T12:00:00Z"

    private static let vectors: [(id: String, status: String, expires: String?, expected: String)] = [
        ("V01", "admin", nil, "admin"),
        ("V02", "admin", "2020-01-01T00:00:00Z", "admin"),
        ("V03", "trialing", "2026-07-20T00:00:00Z", "trialing"),
        ("V04", "trialing", "2026-07-04T12:00:00Z", "trialing"),
        ("V05", "trialing", "2026-07-03T12:00:00Z", "lapsed"),
        ("V06", "trialing", "2026-07-03T11:59:59Z", "lapsed"),
        ("V07", "trialing", nil, "lapsed"),
        ("V08", "active", "2026-08-01T00:00:00Z", "active"),
        ("V09", "active", "2026-07-04T00:00:00Z", "active"),
        ("V10", "active", "2026-07-01T00:00:00Z", "lapsed"),
        ("V11", "active", nil, "lapsed"),
        ("V12", "past_due", "2026-07-10T00:00:00Z", "grace"),
        ("V13", "past_due", "2026-07-01T00:00:00Z", "grace"),
        ("V14", "past_due", "2026-06-18T00:00:00Z", "lapsed"),
        ("V15", "canceled", "2026-07-10T00:00:00Z", "active"),
        ("V16", "canceled", "2026-07-05T12:00:00Z", "lapsed"),
        ("V17", "canceled", "2026-07-05T11:59:59Z", "lapsed"),
        ("V18", "paused", "2026-08-01T00:00:00Z", "lapsed"),
        ("V19", "unpaid", "2026-08-01T00:00:00Z", "lapsed"),
    ]

    private static let vectorsSHA256 =
        "88715c8317256e5c6162e6479e3451e94bff56edbc70c0853c1fd0aaa36a48e2"

    // MARK: - Helpers

    private func date(_ iso: String) throws -> Date {
        try XCTUnwrap(EntitlementLogic.parseTimestamp(iso), "unparseable timestamp: \(iso)")
    }

    private func derive(_ status: String, _ expires: String?, now: String) throws -> GateState {
        let parsedStatus = try XCTUnwrap(EntitlementStatus(rawValue: status),
                                         "unknown status: \(status)")
        let parsedExpires = try expires.map { try date($0) }
        return EntitlementLogic.deriveGateState(
            status: parsedStatus,
            accessExpiresAt: parsedExpires,
            now: try date(now)
        )
    }

    // MARK: - Binding constants

    func test_bindingConstants() {
        XCTAssertEqual(EntitlementLogic.leewayHours, 48)
        XCTAssertEqual(EntitlementLogic.dunningGraceDays, 14)
        XCTAssertEqual(EntitlementLogic.trialDays, 31)
    }

    // MARK: - Canonical serialization digest

    func test_canonicalSerializationMatchesContractDigest() {
        let serialized = Self.vectors
            .map { "\($0.id)|\($0.status)|\($0.expires ?? "null")|\($0.expected)" }
            .joined(separator: "\n")
        let digest = SHA256.hash(data: Data(serialized.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
        XCTAssertEqual(digest, Self.vectorsSHA256)
    }

    // MARK: - Literal vectors V01–V19

    func test_literalVectors() throws {
        for v in Self.vectors {
            let got = try derive(v.status, v.expires, now: Self.vectorNow)
            XCTAssertEqual(got.rawValue, v.expected,
                           "\(v.id): \(v.status) / \(v.expires ?? "null") → expected \(v.expected), got \(got.rawValue)")
        }
    }

    // MARK: - Window boundaries are strict (<) on both sides of the second
    // (mirrors services/billing/test/derive.test.ts)

    func test_leewayBoundary_trialing() throws {
        // expires + 48h leeway edge
        XCTAssertEqual(try derive("trialing", "2026-07-03T12:00:00Z", now: "2026-07-05T11:59:59Z"),
                       .trialing, "one second inside leeway")
        XCTAssertEqual(try derive("trialing", "2026-07-03T12:00:00Z", now: "2026-07-05T12:00:00Z"),
                       .lapsed, "exactly at leeway boundary")
    }

    func test_leewayBoundary_active() throws {
        XCTAssertEqual(try derive("active", "2026-07-03T12:00:00Z", now: "2026-07-05T11:59:59Z"),
                       .active, "one second inside leeway")
        XCTAssertEqual(try derive("active", "2026-07-03T12:00:00Z", now: "2026-07-05T12:00:00Z"),
                       .lapsed, "exactly at leeway boundary")
    }

    func test_dunningEnvelopeBoundary_pastDue() throws {
        // expires + 48h + 14d envelope edge
        XCTAssertEqual(try derive("past_due", "2026-06-19T12:00:00Z", now: "2026-07-05T11:59:59Z"),
                       .grace, "one second inside dunning envelope")
        XCTAssertEqual(try derive("past_due", "2026-06-19T12:00:00Z", now: "2026-07-05T12:00:00Z"),
                       .lapsed, "exactly at dunning boundary")
    }

    func test_paidThroughBoundary_canceled() throws {
        // canceled paid-through edge: expires, NO leeway
        XCTAssertEqual(try derive("canceled", "2026-07-05T12:00:00Z", now: "2026-07-05T11:59:59Z"),
                       .active, "one second before paid-through end")
        XCTAssertEqual(try derive("canceled", "2026-07-05T12:00:00Z", now: "2026-07-05T12:00:00Z"),
                       .lapsed, "exactly at paid-through end")
    }

    // MARK: - Admin ignores expiry entirely

    func test_adminIgnoresExpiry() throws {
        for expires in [nil, "1970-01-01T00:00:00Z", "2999-01-01T00:00:00Z"] {
            XCTAssertEqual(try derive("admin", expires, now: Self.vectorNow), .admin)
        }
    }

    // MARK: - Defensive null expiry for every non-admin status

    func test_nullExpiryLapsesEveryNonAdminStatus() throws {
        for status in ["trialing", "active", "past_due", "paused", "unpaid", "canceled"] {
            XCTAssertEqual(try derive(status, nil, now: Self.vectorNow), .lapsed,
                           "\(status) with null expiry must lapse")
        }
    }

    // MARK: - daysRemaining (mirrors web/test/entitlements.test.ts)

    func test_daysRemaining() throws {
        let now = try date(Self.vectorNow)
        XCTAssertEqual(EntitlementLogic.daysRemaining(accessExpiresAt: try date("2026-07-10T12:00:00Z"), now: now), 5)
        XCTAssertEqual(EntitlementLogic.daysRemaining(accessExpiresAt: try date("2026-07-05T12:00:01Z"), now: now), 1)
        XCTAssertEqual(EntitlementLogic.daysRemaining(accessExpiresAt: try date("2026-07-01T00:00:00Z"), now: now), 0)
        XCTAssertEqual(EntitlementLogic.daysRemaining(accessExpiresAt: nil, now: now), 0)
    }

    // MARK: - Timestamp parsing (timestamptz arrives with or without fractional seconds)

    func test_parseTimestampAcceptsBothWireShapes() throws {
        let plain = try date("2026-07-05T12:00:00Z")
        let fractional = try date("2026-07-05T12:00:00.000Z")
        XCTAssertEqual(plain, fractional)
        // PostgREST commonly emits the +00:00 offset form.
        XCTAssertEqual(try date("2026-07-05T12:00:00+00:00"), plain)
        XCTAssertNil(EntitlementLogic.parseTimestamp(nil))
    }

    func test_parseTimestampHandlesMicrosecondFractions() throws {
        // PostgREST timestamptz JSON can carry MICROSECOND fractions;
        // `ISO8601DateFormatter` only parses millisecond fractions reliably,
        // so the parser truncates the fraction to 3 digits first. Reference
        // instant: 2026-07-05T12:00:00Z = 1_783_252_800 epoch seconds.
        let base: TimeInterval = 1_783_252_800

        let noFraction = try date("2026-07-05T12:00:00Z")
        let millisecond = try date("2026-07-05T12:00:00.123Z")
        let microZ = try date("2026-07-05T12:00:00.123456Z")
        let microOffset = try date("2026-07-05T12:00:00.123456+00:00")

        XCTAssertEqual(noFraction.timeIntervalSince1970, base)
        XCTAssertEqual(millisecond.timeIntervalSince1970, base + 0.123, accuracy: 0.0005)
        // Microseconds truncate to the same millisecond instant, whatever
        // the timezone suffix shape.
        XCTAssertEqual(microZ, millisecond)
        XCTAssertEqual(microOffset, millisecond)
    }
}
