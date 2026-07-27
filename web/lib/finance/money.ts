const CURRENCY_CONFIG = {
  usd: { code: 'USD', symbol: '$', fractionDigits: 2 },
  cad: { code: 'CAD', symbol: 'CA$', fractionDigits: 2 },
  gbp: { code: 'GBP', symbol: '£', fractionDigits: 2 },
  eur: { code: 'EUR', symbol: '€', fractionDigits: 2 },
  jpy: { code: 'JPY', symbol: '¥', fractionDigits: 0 },
  cny: { code: 'CNY', symbol: 'CN¥', fractionDigits: 2 },
  bdt: { code: 'BDT', symbol: '৳', fractionDigits: 2 },
} as const

export type CurrencyKey = keyof typeof CURRENCY_CONFIG

/**
 * Round half away from zero to `fractionDigits` decimals — matches iOS
 * `NSDecimalRound(.plain)`, so the two clients agree on every conversion tie.
 * For non-negative money this equals `Math.round`; the explicit rule keeps
 * parity for any sign. Locked by the `currency.json` golden vectors.
 */
export function roundHalfAwayFromZero(x: number, fractionDigits: number = 0): number {
  const f = Math.pow(10, fractionDigits)
  return (Math.sign(x) * Math.round(Math.abs(x) * f)) / f
}

/**
 * USD cents → display amount in `currency`, rounded to that currency's fraction
 * digits. Mirror of iOS `Money.toDisplayAmount`. Money is ALWAYS stored as USD
 * cents, so we always divide by 100; `rate` (1 USD = N of `currency`) maps to
 * the display currency. Zero-fraction currencies (JPY) therefore render at the
 * correct magnitude — there is no special-case divisor.
 */
export function toDisplayAmount(
  cents: number,
  currency: CurrencyKey = 'usd',
  rate: number = 1
): number {
  const config = CURRENCY_CONFIG[currency]
  return roundHalfAwayFromZero((cents / 100) * rate, config.fractionDigits)
}

/**
 * Format an amount in USD cents to a display string.
 *
 * @param cents - Amount in USD cents (the canonical storage unit)
 * @param currency - Currency key (default: 'usd')
 * @param rate - Exchange rate from USD to the target currency (1 USD = rate units; default: 1)
 * @param leadingPlus - Whether to prefix positive values with '+' (default: false)
 * @param locale - BCP-47 locale driving digit grouping / decimal separators (default: 'en-US').
 *   Symbol placement is NOT locale-driven: the configured symbol is always a prefix.
 */
// We deliberately format the *number* only (decimal style) and prepend our own
// configured currency symbol, rather than letting `style: 'currency'` place the
// locale's symbol. Intl positions the symbol per-locale (e.g. "1.234,56 US$" in
// de-DE) and picks its own symbol (dropping the CA/CN disambiguators), which
// broke the "symbol + amount" rule. Prefixing CURRENCY_CONFIG.symbol keeps
// placement and the shared-symbol country prefix (CA$, CN¥) constant everywhere,
// while the decimal formatter still honours each locale's grouping/decimals.
//
// Constructing an Intl.NumberFormat is one of the heaviest routine JS ops, and
// formatMoney runs per ledger row (hundreds per render). Cache one formatter per
// (locale, fractionDigits) tuple — the only inputs that affect the decimal
// output — so the result is byte-identical while the formatter is built once
// (spec 023 P2).
const decimalFormatters = new Map<string, Intl.NumberFormat>()
function decimalFormatter(locale: string, fractionDigits: number): Intl.NumberFormat {
  const key = `${locale}|${fractionDigits}`
  let fmt = decimalFormatters.get(key)
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, {
      style: 'decimal',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    })
    decimalFormatters.set(key, fmt)
  }
  return fmt
}

export function formatMoney(
  cents: number,
  currency: CurrencyKey = 'usd',
  rate: number = 1,
  leadingPlus: boolean = false,
  locale: string = 'en-US'
): string {
  const config = CURRENCY_CONFIG[currency]
  // USD-cents storage invariant: always divide by 100, then apply the FX rate.
  const amount = (cents / 100) * rate

  const formatted = decimalFormatter(locale, config.fractionDigits).format(Math.abs(amount))

  // Unicode minus (U+2212) for shown negatives, per the constitution's money rules.
  // Always "symbol + amount": sign, then the configured symbol, then the number.
  const sign = amount < 0 ? '−' : leadingPlus && amount > 0 ? '+' : ''
  return `${sign}${config.symbol}${formatted}`
}

/**
 * Convert a display amount in a given currency back to USD cents.
 *
 * @param displayAmount - The amount in the display currency's base unit (e.g. dollars for USD, yen for JPY)
 * @param fromCurrency - The source currency key
 * @param rate - Exchange rate from USD to the fromCurrency (1 USD = rate fromCurrency units)
 */
export function toUSDCents(
  displayAmount: number,
  fromCurrency: CurrencyKey = 'usd',
  rate: number = 1
): number {
  // fromCurrency is accepted for symmetry with toDisplayAmount; the cents math
  // is currency-agnostic (storage is always USD cents).
  void fromCurrency
  // Guard rate <= 0 (matches iOS `guard rate > 0`): a zero or negative rate has
  // no meaningful inverse, so return 0 rather than Infinity/a negative.
  const usdAmount = rate <= 0 ? 0 : displayAmount / rate
  return roundHalfAwayFromZero(usdAmount * 100)
}

export { CURRENCY_CONFIG }
