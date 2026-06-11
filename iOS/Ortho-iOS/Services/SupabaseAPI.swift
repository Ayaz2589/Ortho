import Foundation
import Supabase

/// Top-level error type surfaced to UI from any data-layer call. Wraps the
/// underlying SDK error so we don't leak Postgrest types into views, and
/// gives us a single place to format error messages.
enum SupabaseAPIError: LocalizedError {
    case notAuthenticated
    case missingCurrentHousehold
    case underlying(Error)

    var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            return "You're signed out. Sign in again to sync."
        case .missingCurrentHousehold:
            return "No active household. Create or join one to sync shared data."
        case .underlying(let error):
            return error.localizedDescription
        }
    }
}

/// Shared JSON coding strategies used by every API. The Supabase SDK lets us
/// hand it custom encoder/decoder configurations, but the `Codable` types in
/// `Services/` declare explicit `CodingKeys` (snake_case column names) so the
/// default strategies work fine. This is where to centralize date / number
/// strategies if they ever need to diverge from the defaults.
enum SupabaseCoding {
    /// `timestamptz` columns arrive as ISO-8601 with fractional seconds and
    /// a `Z` suffix; `date` columns arrive as `YYYY-MM-DD`. The custom
    /// strategy below decodes both into `Date`.
    static let dateDecodingStrategy: JSONDecoder.DateDecodingStrategy = .custom { decoder in
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        if let date = iso8601Fractional.date(from: raw) { return date }
        if let date = iso8601Plain.date(from: raw)      { return date }
        if let date = dateOnly.date(from: raw)          { return date }
        throw DecodingError.dataCorruptedError(
            in: container,
            debugDescription: "Unrecognized date string: \(raw)"
        )
    }

    static let dateEncodingStrategy: JSONEncoder.DateEncodingStrategy = .custom { date, encoder in
        var container = encoder.singleValueContainer()
        try container.encode(iso8601Fractional.string(from: date))
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

    private static let dateOnly: DateFormatter = SupabaseDateFormatters.dateOnly
}

/// Formatters reused by API DTOs that surface Postgres `date` columns
/// (lease dates, closing dates, rental-payment dates). Encoded as
/// `"yyyy-MM-dd"` strings on the wire — converting to `Date` at the DTO
/// boundary keeps the rest of the codebase using `Date` end-to-end.
enum SupabaseDateFormatters {
    static let dateOnly: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.calendar = Calendar(identifier: .iso8601)
        f.timeZone = TimeZone(identifier: "UTC")
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    static func string(from date: Date) -> String {
        dateOnly.string(from: date)
    }

    static func date(from string: String) -> Date? {
        dateOnly.date(from: string)
    }
}
