// Merchant-name suggestions for CSV import review. People buy from the same
// places often (Uber Eats, Subway), so the household's own ledger is the best
// source of canonical names. We rank the distinct merchants the household has
// used by frequency, and — for a given (messy) CSV descriptor — surface the
// existing names that look like the same merchant, so the reviewer can normalize
// "UBER EATS 8005928996 CA" back to the "Uber Eats" they already use.
import { normalizeMerchant, merchantsSimilar } from './duplicateMatch'

/** Distinct merchant names from a transaction list, most-used first. */
export function rankedMerchants(transactions: { merchant: string }[]): string[] {
  const freq = new Map<string, { name: string; n: number }>()
  for (const t of transactions) {
    const key = normalizeMerchant(t.merchant)
    if (!key) continue
    const seen = freq.get(key)
    if (seen) seen.n++
    else freq.set(key, { name: t.merchant, n: 1 })
  }
  return [...freq.values()].sort((a, b) => b.n - a.n).map((e) => e.name)
}

/**
 * Known merchant names similar to `raw`, most-frequent first, capped at `limit`.
 * Returns [] when `raw` already matches a known name (nothing to normalize) so
 * the suggestion disappears once the reviewer accepts one.
 */
export function suggestMerchants(raw: string, known: string[], limit = 3): string[] {
  const rawNorm = normalizeMerchant(raw)
  if (!rawNorm) return []
  // Already one of the known names → nothing to suggest.
  if (known.some((name) => normalizeMerchant(name) === rawNorm)) return []

  const out: string[] = []
  const seen = new Set<string>()
  for (const name of known) {
    const key = normalizeMerchant(name)
    if (seen.has(key)) continue
    if (merchantsSimilar(raw, name)) {
      seen.add(key)
      out.push(name)
      if (out.length >= limit) break
    }
  }
  return out
}
