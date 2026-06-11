import Foundation

/// A device-only "person" the primary user can split personal expenses
/// with — for example a roommate, sibling, or friend who doesn't have the
/// Ortho app installed. **Never written to the backend.** Persisted only in
/// the JSON-on-disk client cache.
///
/// Shape mirrors `User` so the UI can render avatars/initials identically,
/// but the ID space is local: a `LocalUser.id` will never collide with a
/// real Supabase `auth.uid()` because local users are minted client-side
/// and stored separately.
///
/// Invariant: `LocalUser` only appears as a participant in personal-scope
/// transactions. Shared transactions require Ortho users (see
/// `TransactionScope` and the Identity & Permissions spec in `Tasks.md`).
struct LocalUser: Identifiable, Hashable, Codable {
    let id: UUID
    var name: String
    var initial: String
    var colorKey: String

    init(id: UUID = UUID(),
         name: String,
         initial: String,
         colorKey: String) {
        self.id = id
        self.name = name
        self.initial = initial
        self.colorKey = colorKey
    }
}

extension LocalUser {
    var palette: OrthoColorOption { OrthoColorOption.find(colorKey) }

    /// Shim that lets `UserRowView` (which takes a `User`) render a
    /// LocalUser without the View being aware of the distinction. The
    /// resulting User exists ONLY for rendering — it's never persisted
    /// or sent to Supabase, and `User.placeholder` style FK lookups
    /// won't find it.
    var asUser: User {
        User(id: id, name: name, initial: initial, colorKey: colorKey)
    }
}
