import Foundation
import Supabase

/// Server-backed operations for `Household` membership + identity.
///
/// Carries the find-or-create logic that used to live inline in
/// `AppState.bootstrapUserSession`, plus the two membership-management
/// calls Settings needs (rename household, remove member).
///
/// Adding members is intentionally not surfaced — that flow belongs to the
/// Invitations work item (creates a `pending_invites` row + emails OTP +
/// redeems via the `accept_invite` RPC). Building it as "in-memory user"
/// would FK-violate `public.users.id → auth.users.id` the moment one
/// touched a shared transaction.
struct HouseholdsAPI {
    private let client: SupabaseClient

    init(client: SupabaseClient) {
        self.client = client
    }

    /// Returns the user's primary household, creating it (and the
    /// corresponding `household_members` row) when none exists. Used by
    /// the auth bootstrap to guarantee shared-scope inserts have a valid
    /// `household_id` target.
    func findOrCreate(
        for userID: User.ID,
        defaultName: String = "Home"
    ) async throws -> (id: UUID, name: String) {
        let memberships: [HouseholdMembershipRow] = try await client
            .from("household_members")
            .select("household_id")
            .eq("user_id", value: userID)
            .execute()
            .value

        if let first = memberships.first {
            let rows: [HouseholdNameRow] = try await client
                .from("households")
                .select("name")
                .eq("id", value: first.householdID)
                .execute()
                .value
            return (id: first.householdID, name: rows.first?.name ?? defaultName)
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
        return (id: newID, name: defaultName)
    }

    func updateName(_ name: String, householdID: Household.ID) async throws {
        try await client
            .from("households")
            .update(HouseholdNameUpdate(name: name))
            .eq("id", value: householdID)
            .execute()
    }

    func removeMember(
        userID: User.ID,
        from householdID: Household.ID
    ) async throws {
        try await client
            .from("household_members")
            .delete()
            .eq("household_id", value: householdID)
            .eq("user_id", value: userID)
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
        let existing: [Person] = try await client
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

    func updatePerson(_ person: Person) async throws {
        try await client
            .from("household_people")
            .update(person)
            .eq("id", value: person.id)
            .execute()
    }
}

// MARK: - DTOs

/// One column of `household_members` — enough to find which household(s)
/// the signed-in user belongs to.
private struct HouseholdMembershipRow: Decodable {
    let householdID: UUID
    enum CodingKeys: String, CodingKey {
        case householdID = "household_id"
    }
}

private struct HouseholdNameRow: Decodable {
    let name: String
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
