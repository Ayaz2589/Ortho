import Foundation
import Supabase

/// Server-backed operations for `Household` membership + identity.
///
/// Carries the find-or-create logic that used to live inline in
/// `AppState.bootstrapUserSession`, plus the two membership-management
/// calls Settings needs (rename household, remove member).
///
/// Partner invites (spec 017) live in `InvitesAPI`: invite creation writes a
/// `pending_invites` row and redemption calls the `accept_invite` RPC — the
/// out-of-band-code flow this comment historically reserved. Members joined
/// that way are real `auth.users`, so the FK chain holds.
struct HouseholdsAPI {
    private let client: SupabaseClient

    init(client: SupabaseClient) {
        self.client = client
    }

    /// Returns the user's active household, creating one (and the
    /// corresponding `household_members` row) only when the user belongs to
    /// none. A user can belong to several households (spec 017): the pick is
    /// deterministic — the persisted `preferredID` when it is still a
    /// membership, else the OLDEST membership — never first-row roulette
    /// (FR-018). Also reports the user's role in the picked household, which
    /// gates the invite controls (owner) and the identity claim (member).
    func findOrCreate(
        for userID: User.ID,
        preferredID: Household.ID? = nil,
        defaultName: String = "Home"
    ) async throws -> (id: UUID, name: String, role: Role) {
        let memberships: [HouseholdMembershipRow] = try await client
            .from("household_members")
            .select("household_id, role, created_at")
            .eq("user_id", value: userID)
            .order("created_at", ascending: true)
            .execute()
            .value

        if let picked = memberships.first(where: { $0.householdID == preferredID })
            ?? memberships.first {
            let rows: [HouseholdNameRow] = try await client
                .from("households")
                .select("name")
                .eq("id", value: picked.householdID)
                .execute()
                .value
            return (id: picked.householdID, name: rows.first?.name ?? defaultName, role: picked.role)
        }

        let newID = UUID()
        try await client
            .from("households")
            .insert(HouseholdInsertRow(
                id: newID,
                ownerID: userID,
                name: defaultName
            ))
            .execute()
        try await client
            .from("household_members")
            .insert(HouseholdMemberInsertRow(
                householdID: newID,
                userID: userID,
                role: .owner
            ))
            .execute()
        return (id: newID, name: defaultName, role: .owner)
    }

    func updateName(_ name: String, householdID: Household.ID) async throws {
        try await client
            .from("households")
            .update(HouseholdNameUpdate(name: name))
            .eq("id", value: householdID)
            .execute()
    }

    // MARK: - People (household_people)

    func fetchPeople(householdID: Household.ID) async throws -> [Person] {
        try await client
            .from("household_people")
            .select()
            .eq("household_id", value: householdID)
            .order("sort_order", ascending: true)
            .execute()
            .value
    }

    /// Insert the account holder's Person row if one isn't already linked.
    func ensureAccountPerson(
        householdID: Household.ID,
        userID: User.ID,
        name: String,
        initial: String,
        colorKey: String
    ) async throws {
        // Select only `id` — decode into a minimal row, NOT `Person` (which
        // requires name/household_id/etc. and would throw keyNotFound on a
        // partial projection, wiping the whole people load).
        let existing: [PersonIDRow] = try await client
            .from("household_people")
            .select("id")
            .eq("household_id", value: householdID)
            .eq("linked_user_id", value: userID)
            .execute()
            .value
        guard existing.isEmpty else { return }
        let person = Person(
            householdID: householdID,
            name: name,
            initial: initial,
            colorKey: colorKey,
            linkedUserID: userID,
            sortOrder: 0
        )
        try await client.from("household_people").insert(person).execute()
    }

    func createPerson(_ person: Person) async throws {
        try await client.from("household_people").insert(person).execute()
    }

    /// spec 017 US3 — the guarded identity claim: link the signed-in account
    /// to a roster person ONLY if the row is still unlinked (a lost race
    /// updates 0 rows and returns false; `unique(household_id,
    /// linked_user_id)` backstops server-side). Mirrors web `claimPerson`.
    func claimPerson(personID: Person.ID, userID: User.ID) async throws -> Bool {
        let updated: [PersonIDRow] = try await client
            .from("household_people")
            .update(LinkedUserUpdate(linkedUserID: userID))
            .eq("id", value: personID)
            .is("linked_user_id", value: nil)
            .select("id")
            .execute()
            .value
        return !updated.isEmpty
    }

    func updatePerson(_ person: Person) async throws {
        try await client
            .from("household_people")
            .update(person)
            .eq("id", value: person.id)
            .execute()
    }
}

// MARK: - DTOs

/// A `household_members` row projection — which household(s) the signed-in
/// user belongs to and with what role (spec 017: role gates invite controls
/// and the identity claim).
private struct HouseholdMembershipRow: Decodable {
    let householdID: UUID
    let role: Role
    enum CodingKeys: String, CodingKey {
        case householdID = "household_id"
        case role
    }
}

/// The claim update payload (spec 017) — sets only `linked_user_id`.
private struct LinkedUserUpdate: Encodable {
    let linkedUserID: UUID
    enum CodingKeys: String, CodingKey {
        case linkedUserID = "linked_user_id"
    }
}

private struct HouseholdNameRow: Decodable {
    let name: String
}

/// Minimal projection for existence checks against `household_people` — decodes
/// a `select("id")` without requiring the full `Person` shape.
private struct PersonIDRow: Decodable {
    let id: UUID
}

private struct HouseholdInsertRow: Encodable {
    let id: UUID
    let ownerID: UUID
    let name: String
    enum CodingKeys: String, CodingKey {
        case id
        case ownerID = "owner_id"
        case name
    }
}

private struct HouseholdMemberInsertRow: Encodable {
    let householdID: UUID
    let userID: UUID
    let role: Role
    enum CodingKeys: String, CodingKey {
        case householdID = "household_id"
        case userID      = "user_id"
        case role
    }
}

private struct HouseholdNameUpdate: Encodable {
    let name: String
}
