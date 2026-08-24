// Pure helpers for the split-editor UI fields (per-owner text inputs), shared by
// the New/Edit transaction form (TxForm) and the CSV import row editor
// (CsvRowEditModal) so the two editors seed + rebalance percentages identically.
// These are UI-seeding helpers only — the authoritative share math lives in
// `lib/splits.ts` (computeShares/validateSplit) and is what the golden vectors lock.

/** Even percentages across owners; the last absorbs the rounding remainder
 *  (33.33 + 33.33 + 33.34 = 100). Mirrors iOS `seedEvenPercents`. */
export function evenPercentStrings(owners: string[]): Record<string, string> {
  const n = owners.length
  if (n === 0) return {}
  const base = Math.floor((100 / n) * 100) / 100
  const totals = new Array<number>(n).fill(base)
  totals[n - 1] += Math.round((100 - base * n) * 100) / 100
  const out: Record<string, string> = {}
  owners.forEach((id, i) => (out[id] = totals[i].toFixed(2)))
  return out
}

/** Even by-amount fields in display currency (a starting point the user edits).
 *  Mirrors iOS `seedEvenValues`. `amountText` is the display-currency total. */
export function evenValueStrings(
  owners: string[],
  amountText: string,
  fd: number
): Record<string, string> {
  const n = owners.length
  const total = parseFloat(amountText.replace(/,/g, ''))
  if (n === 0 || !isFinite(total) || total <= 0) return {}
  const scale = Math.pow(10, fd)
  const base = Math.floor((total / n) * scale) / scale
  const amounts = new Array<number>(n).fill(base)
  amounts[n - 1] += Math.round((total - base * n) * scale) / scale
  const out: Record<string, string> = {}
  owners.forEach((id, i) => (out[id] = amounts[i].toFixed(fd)))
  return out
}

/** Percent field write — writes the edited owner's value verbatim, then
 *  rebalances the OTHER owners so the total stays 100: proportionally to their
 *  existing weights when any are non-zero, evenly otherwise. Mirrors iOS
 *  `rebalance(after:)`. Returns the next per-owner text map. */
export function rebalancePercents(
  prev: Record<string, string>,
  id: string,
  v: string,
  owners: string[]
): Record<string, string> {
  const next = { ...prev, [id]: v }
  const others = owners.filter((o) => o !== id)
  if (others.length === 0) return next
  const editedParsed = parseFloat(v.trim())
  const clamped = Math.max(0, Math.min(100, isFinite(editedParsed) ? editedParsed : 0))
  const remaining = Math.max(0, 100 - clamped)
  const current = others.map((o) => {
    const p = parseFloat((next[o] ?? '').trim())
    return isFinite(p) ? p : 0
  })
  const currentSum = current.reduce((s, x) => s + x, 0)
  const rawNew =
    currentSum > 0
      ? current.map((x) => (x / currentSum) * remaining)
      : others.map(() => remaining / others.length)
  // Round each to 2dp; the last absorbs the rounding error so the displayed
  // total is exactly the remaining share. The absorber is clamped at 0 —
  // combined round-ups could push it negative, and a negative percentage
  // saves a negative stored share (review 2026-08-24) — with the deficit
  // reclaimed from the rounded-up owners.
  const rounded: number[] = []
  rawNew.forEach((x, i) => {
    if (i < rawNew.length - 1) rounded.push(Math.round(x * 100) / 100)
    else rounded.push(Math.round((remaining - rounded.reduce((s, y) => s + y, 0)) * 100) / 100)
  })
  let deficit = -Math.min(0, rounded[rounded.length - 1])
  if (deficit > 0) {
    rounded[rounded.length - 1] = 0
    for (let i = 0; i < rounded.length - 1 && deficit > 0.0001; i++) {
      const take = Math.min(rounded[i], deficit)
      rounded[i] = Math.round((rounded[i] - take) * 100) / 100
      deficit = Math.round((deficit - take) * 100) / 100
    }
  }
  others.forEach((o, i) => (next[o] = rounded[i].toFixed(2)))
  return next
}
