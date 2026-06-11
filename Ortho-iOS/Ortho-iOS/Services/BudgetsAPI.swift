import Foundation
import Supabase

/// Server-backed CRUD for `Budget`. The DB enforces `UNIQUE (household_id,
/// category)`, so create-or-update collapses to a single `upsert` call —
/// matching the user-facing "set the dining budget to $X" gesture which
/// doesn't distinguish first set from later edit.
struct BudgetsAPI {
    private let client: SupabaseClient

    init(client: SupabaseClient) {
        self.client = client
    }

    func fetch() async throws -> [Budget] {
        try await client
            .from("budgets")
            .select()
            .execute()
            .value
    }

    /// Insert or update by `(household_id, category)`. On insert, the server
    /// fills `created_at` / `updated_at`. The `updated_at` trigger refreshes
    /// the latter on every update.
    func upsert(_ budget: Budget) async throws {
        try await client
            .from("budgets")
            .upsert(budget, onConflict: "household_id,category")
            .execute()
    }

    func delete(id: Budget.ID) async throws {
        try await client
            .from("budgets")
            .delete()
            .eq("id", value: id)
            .execute()
    }
}
