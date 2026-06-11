import Foundation
import Supabase

/// Server-backed CRUD for `RentalPayment`. RLS filters by property →
/// household membership, so `fetch()` returns everything the user can see
/// without an explicit filter. No `update` method — the UI only supports
/// add and delete.
struct RentalPaymentsAPI {
    private let client: SupabaseClient

    init(client: SupabaseClient) {
        self.client = client
    }

    func fetch() async throws -> [RentalPayment] {
        let rows: [RentalPaymentRow] = try await client
            .from("rental_payments")
            .select()
            .order("date", ascending: false)
            .execute()
            .value
        return rows.map { $0.toModel() }
    }

    func create(_ payment: RentalPayment) async throws {
        try await client
            .from("rental_payments")
            .insert(RentalPaymentRow.from(payment))
            .execute()
    }

    func delete(id: RentalPayment.ID) async throws {
        try await client
            .from("rental_payments")
            .delete()
            .eq("id", value: id)
            .execute()
    }
}

private struct RentalPaymentRow: Codable {
    let id: UUID
    let propertyID: UUID
    let amountCents: Int64
    /// `yyyy-MM-dd` string for the `date` column.
    let date: String
    let note: String?

    static func from(_ payment: RentalPayment) -> RentalPaymentRow {
        RentalPaymentRow(
            id: payment.id,
            propertyID: payment.propertyID,
            amountCents: payment.amount,
            date: SupabaseDateFormatters.string(from: payment.date),
            note: payment.note
        )
    }

    func toModel() -> RentalPayment {
        RentalPayment(
            id: id,
            propertyID: propertyID,
            amount: amountCents,
            date: SupabaseDateFormatters.date(from: date) ?? .now,
            note: note
        )
    }

    enum CodingKeys: String, CodingKey {
        case id
        case propertyID  = "property_id"
        case amountCents = "amount_cents"
        case date
        case note
    }
}
