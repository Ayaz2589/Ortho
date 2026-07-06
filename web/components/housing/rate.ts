/** Mortgage interest-rate round-trip for the property edit form.
 *
 * The stored rate is Postgres `numeric(7,4)` (up to 4 decimals). Loading it into
 * the form must NOT truncate to two decimals (the old `.toFixed(2)` silently
 * rewrote 6.375 → 6.38 on any save), so a no-op edit round-trips losslessly.
 */

/** Render a stored rate for the input at full precision (trailing zeros trimmed
 *  by `String`). `parseRate(rateToInput(r)) === r` for every stored value. */
export function rateToInput(ratePercent: number): string {
  return String(ratePercent)
}

/** Parse a rate string from the form back to a number (blank/invalid → 0).
 *  Mirrors the modal's numeric parse so load and save agree. */
export function parseRate(s: string): number {
  const v = parseFloat(s.replace(/[,\s]/g, ''))
  return isNaN(v) ? 0 : v
}
