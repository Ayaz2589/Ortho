import { CURRENCY_CONFIG, type CurrencyKey } from './money'

/**
 * Ordered list of supported currencies — matches the iOS `Currency` enum order.
 * Money is always stored as USD cents; display conversion happens at render time.
 */
export const CURRENCIES: CurrencyKey[] = ['usd', 'cad', 'gbp', 'eur', 'jpy', 'cny', 'bdt']

export const CURRENCY_NAMES: Record<CurrencyKey, string> = {
  usd: 'US Dollar',
  cad: 'Canadian Dollar',
  gbp: 'British Pound',
  eur: 'Euro',
  jpy: 'Japanese Yen',
  cny: 'Chinese Yuan',
  bdt: 'Bangladeshi Taka',
}

/** 1 USD = N units of currency. Used when live FX is unavailable. */
export const FALLBACK_RATE_FROM_USD: Record<CurrencyKey, number> = {
  usd: 1,
  cad: 1.35,
  gbp: 0.78,
  eur: 0.92,
  jpy: 150,
  cny: 7.2,
  bdt: 110,
}

export function currencyCode(key: CurrencyKey): string {
  return CURRENCY_CONFIG[key].code
}

export function currencySymbol(key: CurrencyKey): string {
  return CURRENCY_CONFIG[key].symbol
}

export function fractionDigits(key: CurrencyKey): number {
  return CURRENCY_CONFIG[key].fractionDigits
}

export type { CurrencyKey }
