const CURRENCY_CONFIG = {
  usd: { code: 'USD', symbol: '$', fractionDigits: 2 },
  cad: { code: 'CAD', symbol: 'CA$', fractionDigits: 2 },
  gbp: { code: 'GBP', symbol: '£', fractionDigits: 2 },
  eur: { code: 'EUR', symbol: '€', fractionDigits: 2 },
  jpy: { code: 'JPY', symbol: '¥', fractionDigits: 0 },
  cny: { code: 'CNY', symbol: '¥', fractionDigits: 2 },
  bdt: { code: 'BDT', symbol: '৳', fractionDigits: 2 },
} as const

export type CurrencyKey = keyof typeof CURRENCY_CONFIG

/**
 * Format an amount in cents to a display string.
 *
 * @param cents - Amount in smallest currency unit (e.g. cents for USD)
 * @param currency - Currency key (default: 'usd')
 * @param rate - Exchange rate from USD cents to the target currency's base unit (default: 1)
 * @param leadingPlus - Whether to prefix positive values with '+' (default: false)
 */
export function formatMoney(
  cents: number,
  currency: CurrencyKey = 'usd',
  rate: number = 1,
  leadingPlus: boolean = false
): string {
  const config = CURRENCY_CONFIG[currency]
  const divisor = config.fractionDigits === 0 ? 1 : 100
  const amount = (cents / divisor) * rate

  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: config.code,
    minimumFractionDigits: config.fractionDigits,
    maximumFractionDigits: config.fractionDigits,
  }).format(Math.abs(amount))

  const sign = amount < 0 ? '-' : leadingPlus && amount > 0 ? '+' : ''
  return `${sign}${formatted}`
}

/**
 * Convert a display amount in a given currency back to USD cents.
 *
 * @param displayAmount - The amount in the display currency's base unit (e.g. dollars for USD)
 * @param fromCurrency - The source currency key
 * @param rate - Exchange rate from USD to the fromCurrency (i.e. 1 USD = rate fromCurrency units)
 */
export function toUSDCents(
  displayAmount: number,
  fromCurrency: CurrencyKey = 'usd',
  rate: number = 1
): number {
  const config = CURRENCY_CONFIG[fromCurrency]
  const divisor = config.fractionDigits === 0 ? 1 : 100

  // displayAmount is in base units (e.g. dollars); convert to USD cents
  const usdAmount = rate === 0 ? 0 : displayAmount / rate
  return Math.round(usdAmount * (100 / divisor) * divisor)
}

export { CURRENCY_CONFIG }
