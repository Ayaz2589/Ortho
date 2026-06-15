// Money parsing for statement amounts. All values are integer USD cents.

/** True if `s` is a bare amount token like "38.50", "2,800.00", "$25.00". */
export function isAmountToken(s: string): boolean {
  return /^\$?-?[\d,]+\.\d{2}$/.test(s.trim())
}

/**
 * Parse a printed amount to exact integer cents. Strips `$`, thousands commas,
 * and whitespace. Requires exactly two decimal places. Throws on anything else
 * so a mis-parse is loud, never silently zero.
 */
export function parseAmountToCents(raw: string): number {
  const cleaned = raw.replace(/[$,\s]/g, '')
  if (!/^-?\d+\.\d{2}$/.test(cleaned)) {
    throw new Error(`INVALID_AMOUNT: ${JSON.stringify(raw)}`)
  }
  const negative = cleaned.startsWith('-')
  const digits = cleaned.replace('-', '').replace('.', '')
  const cents = parseInt(digits, 10)
  return negative ? -cents : cents
}
