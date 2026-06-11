import Foundation

/// Currency conversion + formatting. Internal storage is always USD cents
/// (`Int64`); the supplied `rate` (1 USD = N of `currency`) maps to the
/// display currency. Rates come from `AppState.rate(for:)`, which falls back
/// to `Currency.fallbackRateFromUSD` until a live FX fetch lands.
enum Money {
    /// Format USD-cents in the given currency. `leadingPlus` adds a "+"
    /// prefix (used for income rows).
    static func string(cents: Int64,
                       currency: Currency,
                       rate: Decimal,
                       leadingPlus: Bool = false) -> String {
        let amount = displayAmount(cents: cents, currency: currency, rate: rate)
        let absAmount = NSDecimalNumber(decimal: amount.magnitude)
        let body = formatter(for: currency).string(from: absAmount)
            ?? "\(currency.code) 0"
        guard leadingPlus else { return body }
        return "+\(body)"
    }

    /// Just the currency's symbol — used for the leading glyph in the
    /// add-transaction amount hero.
    static func symbol(for currency: Currency) -> String {
        formatter(for: currency).currencySymbol ?? currency.code
    }

    /// Parse a user-typed amount in `currency` and round to USD cents.
    /// Used by AddTransactionSheet on submit.
    static func toUSDCents(_ amount: Decimal,
                           from currency: Currency,
                           rate: Decimal) -> Int64 {
        guard rate > 0 else { return 0 }
        let usdDollars = amount / rate
        let centsDecimal = usdDollars * 100
        var rounded = centsDecimal
        var src = centsDecimal
        NSDecimalRound(&rounded, &src, 0, .plain)
        return NSDecimalNumber(decimal: rounded).int64Value
    }

    /// USD-cents → display amount for pre-filling the amount field in
    /// edit mode. Rounded to `currency.fractionDigits`.
    static func toDisplayAmount(cents: Int64,
                                in currency: Currency,
                                rate: Decimal) -> Decimal {
        let raw = displayAmount(cents: cents, currency: currency, rate: rate)
        var rounded = raw
        var src = raw
        NSDecimalRound(&rounded, &src, currency.fractionDigits, .plain)
        return rounded
    }

    // MARK: - Private

    private static func displayAmount(cents: Int64,
                                      currency: Currency,
                                      rate: Decimal) -> Decimal {
        let usdDollars = Decimal(cents) / 100
        return usdDollars * rate
    }

    /// Cached formatter per (currency, locale). NumberFormatter is
    /// expensive to construct — keep one alive per pair so rapid
    /// re-renders stay cheap. The locale dimension is required because a
    /// language switch (en→bn) must yield a fresh formatter so digit
    /// grouping and currency symbol placement update; otherwise we'd
    /// keep returning the EN-formatted version forever.
    private static var formatters: [String: NumberFormatter] = [:]

    private static func formatter(for currency: Currency) -> NumberFormatter {
        let locale = Localizer.currentLocale
        let key = "\(currency.code)|\(locale.identifier)"
        if let f = formatters[key] { return f }
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = currency.code
        f.locale = locale
        f.minimumFractionDigits = currency.fractionDigits
        f.maximumFractionDigits = currency.fractionDigits
        formatters[key] = f
        return f
    }
}
