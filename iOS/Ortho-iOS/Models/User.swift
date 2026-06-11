import Foundation

/// A household member. `colorKey` references a value in `OrthoColorOption.all`
/// — the same color is used everywhere the user appears (avatar, transaction
/// row owner tag, charts).
///
/// `User.id` equals the Supabase `auth.uid()` — a real Ortho user is one
/// row in `public.users` keyed by their auth UUID (see Identity decision in
/// `Tasks.md`). Local device-only people use `LocalUser` instead.
struct User: Identifiable, Hashable, Codable {
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

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case initial
        case colorKey = "color_key"
    }
}

extension User {
    var palette: OrthoColorOption { OrthoColorOption.find(colorKey) }

    /// Returned by `AppState.user(_:)` when an ID doesn't match a current
    /// household member (e.g. the user was deleted but the transaction kept
    /// their owner reference, as Settings' footer promises).
    static let placeholder = User(
        id: UUID(uuidString: "00000000-0000-0000-0000-000000000000")!,
        name: "Removed",
        initial: "·",
        colorKey: "sand"
    )
}

// MARK: - Sample data

extension User {
    /// Stable UUIDs so sample transactions can reference seeded users by id.
    static let mayaSample = User(
        id: UUID(uuidString: "11111111-1111-1111-1111-111111111111")!,
        name: "Maya",
        initial: "M",
        colorKey: "peach"
    )
    static let jordanSample = User(
        id: UUID(uuidString: "22222222-2222-2222-2222-222222222222")!,
        name: "Jordan",
        initial: "J",
        colorKey: "slate"
    )

    static let sample: [User] = [mayaSample, jordanSample]
}
