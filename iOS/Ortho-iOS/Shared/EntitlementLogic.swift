import Foundation

// Pure, cross-surface entitlement gate derivation (spec 018) — HAND-MIRRORED
// from services/billing/src/derive.ts (the canonical copy) and
// web/lib/entitlements.ts. All three are locked by the identical literal
// vectors V01–V19 + digest in
// specs/018-subscription-system/contracts/entitlement-state.md — amend the
// contract before touching semantics here. Rules evaluate top-down, first
// match wins; every expiry comparison is STRICT `<` (an instant exactly on a
// window boundary is outside it).

/// Provider-shaped stored status — matches the Postgres `entitlement_status`
/// enum literals via `rawValue` (data-model §1).
enum EntitlementStatus: String, Codable {
    case trialing
    case active
    case pastDue = "past_due"
    case paused
    case unpaid
    case canceled
    case admin
}

/// The single fact the shell gates on (FR-005).
enum GateState: String {
    case admin
    case trialing
    case active
    case grace
    case lapsed
}

enum EntitlementLogic {
    // BINDING values — single definition site on this surface
    // (contracts/entitlement-state.md).
    static let leewayHours = 48
    static let dunningGraceDays = 14
    static let trialDays = 31

    private static let hourSeconds: TimeInterval = 3_600
    private static let daySeconds: TimeInterval = 86_400

    /// Rules evaluate top-down, first match wins; expiry comparisons are
    /// STRICT `<`. `now` is always injected — never the real clock inside
    /// this function (Constitution VI).
    static func deriveGateState(
        status: EntitlementStatus,
        accessExpiresAt: Date?,
        now: Date
    ) -> GateState {
        if status == .admin { return .admin }
        guard let expires = accessExpiresAt else { return .lapsed }

        let leeway = Double(leewayHours) * hourSeconds

        switch status {
        case .trialing:
            return now < expires.addingTimeInterval(leeway) ? .trialing : .lapsed
        case .active:
            return now < expires.addingTimeInterval(leeway) ? .active : .lapsed
        case .pastDue:
            let envelope = leeway + Double(dunningGraceDays) * daySeconds
            return now < expires.addingTimeInterval(envelope) ? .grace : .lapsed
        case .canceled:
            // Paid-through: access until the period end, deliberately with NO leeway.
            return now < expires ? .active : .lapsed
        case .paused, .unpaid:
            return .lapsed
        case .admin:
            return .admin // unreachable — handled by the first rule
        }
    }

    /// Whole days until expiry (ceil, floor 0, nil → 0) — Settings
    /// "X days left" copy. Mirrors web `daysRemaining`.
    static func daysRemaining(accessExpiresAt: Date?, now: Date) -> Int {
        guard let expires = accessExpiresAt else { return 0 }
        let seconds = expires.timeIntervalSince(now)
        return seconds > 0 ? Int(ceil(seconds / daySeconds)) : 0
    }

    /// The one shell decision (FR-006…FR-009): only a successfully loaded,
    /// genuinely lapsed entitlement blocks the app. A `nil` gate (row not
    /// loaded yet, load failed, or test-data mode) NEVER gates — load
    /// failures route to the recovery UI instead (FR-008).
    static func shouldShowPaywall(gate: GateState?) -> Bool {
        gate == .lapsed
    }

    // MARK: - Timestamp parsing

    /// Server timestamps are Postgres `timestamptz` — ISO-8601 UTC, with or
    /// without fractional seconds. PostgREST can emit MICROSECOND fractions
    /// (e.g. "2026-07-05T12:00:00.123456+00:00"), but
    /// `ISO8601DateFormatter`'s `.withFractionalSeconds` reliably parses only
    /// millisecond (3-digit) fractions — so the fraction is truncated to at
    /// most 3 digits before formatting. Fixed formatters (same idiom as
    /// `SupabaseCoding.dateDecodingStrategy`), never locale-dependent.
    static func parseTimestamp(_ iso: String?) -> Date? {
        guard let iso else { return nil }
        return iso8601Plain.date(from: iso)
            ?? iso8601Fractional.date(from: truncateFraction(iso))
    }

    /// Normalize a fractional-seconds part to at most 3 digits: string
    /// surgery on the digits between '.' and the timezone suffix ('Z' or
    /// '±HH:MM'). Strings without a fraction — or with anything unexpected
    /// where the fraction should be — pass through untouched.
    private static func truncateFraction(_ iso: String) -> String {
        guard let dot = iso.firstIndex(of: ".") else { return iso }
        let fractionStart = iso.index(after: dot)
        // The fraction ends at the timezone suffix: 'Z' or a '+'/'-' offset.
        // (The date's own '-' separators sit BEFORE the dot, so scanning
        // forward from the fraction cannot hit them.)
        var suffixStart = iso.endIndex
        var i = fractionStart
        while i < iso.endIndex {
            let c = iso[i]
            if c == "Z" || c == "z" || c == "+" || c == "-" {
                suffixStart = i
                break
            }
            i = iso.index(after: i)
        }
        let fraction = iso[fractionStart..<suffixStart]
        guard fraction.count > 3, fraction.allSatisfy({ $0.isASCII && $0.isNumber }) else { return iso }
        return String(iso[..<fractionStart]) + fraction.prefix(3) + String(iso[suffixStart...])
    }

    private static let iso8601Fractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let iso8601Plain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()
}
