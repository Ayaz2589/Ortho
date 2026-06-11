import Foundation

/// A user's role inside a household. v1 ships `owner` + `member`; `admin`
/// is deferred (adding it later is a single Postgres `ALTER TYPE` + new
/// policy branches — see `Tasks.md` Decisions).
///
/// Raw values match the Postgres `role` enum (`'owner' | 'member'`) so the
/// type round-trips through Supabase JSON without a CodingKeys map.
enum Role: String, Codable, Hashable, CaseIterable {
    case owner
    case member

    /// Localized display name. `rawValue` is the wire-format and must
    /// never be shown in the UI.
    var displayName: LocalizedStringResource {
        switch self {
        case .owner:  "Owner"
        case .member: "Member"
        }
    }
}
