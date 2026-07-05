import Foundation
import Supabase

/// Read-side access to the caller's entitlement row plus the billing edge
/// functions (spec 018, contracts/billing-functions.md). Clients NEVER write
/// entitlement state (FR-017): the only mutation reachable from here is the
/// SECURITY DEFINER `ensure_entitlement` RPC, which can only create the
/// initial 31-day trial row (idempotent — replays cannot reset or extend it).
/// The app never talks to Stripe directly and never collects payment; the
/// function calls below only mint hosted-page URLs and read operator-set
/// prices.
struct EntitlementsAPI {
    private let client: SupabaseClient

    init(client: SupabaseClient) {
        self.client = client
    }

    /// Ensure the caller's entitlement row exists (insert-if-absent trial)
    /// and read it back — one round trip; the RPC's return value doubles as
    /// the bootstrap fetch (data-model §4).
    func ensureEntitlement() async throws -> EntitlementDTO {
        try await client
            .rpc("ensure_entitlement")
            .execute()
            .value
    }

    /// Refetch the caller's row (paywall "Check again", manual refresh).
    /// RLS restricts the select to the caller's own row; `nil` when the row
    /// doesn't exist yet.
    func fetchOwn() async throws -> EntitlementDTO? {
        let rows: [EntitlementDTO] = try await client
            .from("entitlements")
            .select()
            .limit(1)
            .execute()
            .value
        return rows.first
    }

    /// Mint a Stripe Checkout URL for the chosen plan ("monthly"/"yearly").
    /// Never auto-retried (duplicate sessions); the caller opens the URL
    /// externally — payment happens entirely on Stripe's hosted page.
    func createCheckout(plan: String) async throws -> URL {
        let response: BillingURLResponse = try await client.functions.invoke(
            "billing-checkout",
            options: FunctionInvokeOptions(body: ["plan": plan])
        )
        guard let url = URL(string: response.url) else {
            throw URLError(.badURL)
        }
        return url
    }

    /// Mint a Stripe Customer Portal URL (subscribers manage billing there).
    func createPortal() async throws -> URL {
        let response: BillingURLResponse = try await client.functions.invoke(
            "billing-portal",
            options: FunctionInvokeOptions(body: [String: String]())
        )
        guard let url = URL(string: response.url) else {
            throw URLError(.badURL)
        }
        return url
    }

    /// Operator-configured plan prices for the paywall — prices exist ONLY
    /// in Stripe (FR-011/SC-008), never hardcoded client-side.
    func fetchPlans() async throws -> PlansDTO {
        let response: PlansResponse = try await client.functions.invoke("billing-plans")
        return response.plans
    }
}

// MARK: - DTOs

/// The `entitlements` row as PostgREST returns it (data-model §2). Timestamps
/// stay ISO-8601 strings on this type — mirroring web's `DbEntitlement` —
/// and are parsed at the derivation boundary via
/// `EntitlementLogic.parseTimestamp`.
struct EntitlementDTO: Codable {
    let userID: UUID
    let status: EntitlementStatus
    let accessExpiresAt: String?
    /// "monthly" | "yearly"; nil while trialing/admin.
    let plan: String?
    /// "trial" | "stripe" | "operator".
    let source: String
    let stripeCustomerID: String?
    let stripeSubscriptionID: String?
    let lastEventAt: String?
    let createdAt: String
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case userID = "user_id"
        case status
        case accessExpiresAt = "access_expires_at"
        case plan
        case source
        case stripeCustomerID = "stripe_customer_id"
        case stripeSubscriptionID = "stripe_subscription_id"
        case lastEventAt = "last_event_at"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

/// One plan's price as billing-plans returns it — keys are camelCase in the
/// JSON (`amountCents`), per the house integer-cents convention.
struct PlanDTO: Codable {
    let amountCents: Int
    let currency: String
    let interval: String
}

struct PlansDTO: Codable {
    let monthly: PlanDTO
    let yearly: PlanDTO
}

private struct PlansResponse: Codable {
    let plans: PlansDTO
}

/// `{ "url": … }` — shared response shape of billing-checkout/billing-portal.
private struct BillingURLResponse: Codable {
    let url: String
}
