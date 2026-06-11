import Foundation

/// User-selectable display currency. Amounts are always stored as USD cents
/// (`Int64`) on `Transaction.amount`; conversion to this currency happens at
/// every render via `Money.string(cents:currency:rate:)` and
/// `AppState.formatMoney(_:)`.
enum Currency: String, CaseIterable, Identifiable, Hashable, Codable {
    case usd, cad, gbp, eur, jpy, cny, bdt

    var id: String { rawValue }

    /// ISO 4217 code — used as `NumberFormatter.currencyCode` for symbol +
    /// grouping + fraction digits per locale.
    var code: String { rawValue.uppercased() }

    var displayName: LocalizedStringResource {
        switch self {
        case .usd: "US Dollar"
        case .cad: "Canadian Dollar"
        case .gbp: "UK Pound"
        case .eur: "Euro"
        case .jpy: "Japanese Yen"
        case .cny: "Chinese Yuan"
        case .bdt: "Bangladeshi Taka"
        }
    }

    /// 2 for most currencies, 0 for those with no minor unit (JPY).
    /// Used by amount-field formatting and `Money.toDisplayAmount`.
    var fractionDigits: Int {
        switch self {
        case .jpy: 0
        default:   2
        }
    }

    /// Approximate rate (1 USD = N of this currency) used until a live
    /// fetch lands or when the network is unreachable. Live rates from
    /// floatrates.com override these via `AppState.fxRates`.
    var fallbackRateFromUSD: Decimal {
        switch self {
        case .usd: 1
        case .cad: 1.35
        case .gbp: 0.78
        case .eur: 0.92
        case .jpy: 150
        case .cny: 7.20
        case .bdt: 110
        }
    }
}
