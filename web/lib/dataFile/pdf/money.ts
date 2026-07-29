// spec 032 — PDF-safe money formatting for the visible layer.
//
// The app UI formats money with symbols and a Unicode minus. The PDF visible
// layer instead uses the ISO CODE ("USD 1,234.00") and ASCII minus so that ANY
// language × currency combination renders with any font (including the built-in
// Helvetica) without hitting a non-encodable glyph (e.g. the taka symbol ৳ or
// U+2212). Amounts are still the correctly-converted display amounts; only the
// glyph choices are made PDF-safe. The canonical payload is untouched.

import { CURRENCY_CONFIG, toDisplayAmount, type CurrencyKey } from '../../finance/money'

const fmtCache = new Map<string, Intl.NumberFormat>()

export function formatMoneyForPdf(
  cents: number,
  currency: CurrencyKey = 'usd',
  rate: number = 1,
  leadingPlus: boolean = false,
  locale: string = 'en-US'
): string {
  const cfg = CURRENCY_CONFIG[currency]
  const amount = toDisplayAmount(cents, currency, rate)
  const key = `${locale}|${cfg.code}`
  let fmt = fmtCache.get(key)
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: cfg.code,
      currencyDisplay: 'code',
    })
    fmtCache.set(key, fmt)
  }
  let s = fmt.format(amount)
  if (leadingPlus && amount > 0) s = `+${s}`
  // Normalize the Unicode minus to ASCII so Helvetica/WinAnsi can encode it.
  return s.replace(/−/g, '-')
}
