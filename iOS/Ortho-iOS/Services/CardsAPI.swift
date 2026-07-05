import Foundation
import Supabase

/// Server-backed CRUD for `Card`. Talks to `public.cards`. RLS scopes
/// visibility to household members; no extra filter is needed client-side
/// for `fetch()`.
///
/// Cards have no user-editable fields besides `name`, and rename support
/// isn't surfaced in the UI today, so there's no `update` method. Add and
/// delete cover every flow.
struct CardsAPI {
    private let client: SupabaseClient

    init(client: SupabaseClient) {
        self.client = client
    }

    func fetch(householdID: Household.ID? = nil) async throws -> [Card] {
        // spec 017: scope to the active household — a multi-household user's
        // other cards must not merge into this household's pickers.
        var query = client.from("cards").select()
        if let householdID {
            query = query.eq("household_id", value: householdID)
        }
        let rows: [CardRecord] = try await query
            .order("created_at", ascending: true)
            .execute()
            .value
        return rows.map { row in
            Card(id: row.id, householdID: row.householdID, name: row.name)
        }
    }

    func create(_ card: Card) async throws {
        let row = CardRecord(
            id: card.id,
            householdID: card.householdID,
            name: card.name
        )
        try await client
            .from("cards")
            .insert(row)
            .execute()
    }

    func delete(id: Card.ID) async throws {
        try await client
            .from("cards")
            .delete()
            .eq("id", value: id)
            .execute()
    }
}

// MARK: - Row DTO

private struct CardRecord: Codable {
    let id: UUID
    let householdID: UUID
    let name: String

    enum CodingKeys: String, CodingKey {
        case id
        case householdID = "household_id"
        case name
    }
}
