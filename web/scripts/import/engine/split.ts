// Split entry for multi-owner transactions in the CLI. The operator enters
// percentages (even by default); cents are computed at persist time via the
// shared `computeShares` (lib/splits.ts) so CLI rows match app rows exactly.
import { validateSplit } from '../../../lib/splits'

/** Even split percentages per owner — the default when no custom split given. */
export function evenSplit(ownerIds: string[]): Record<string, number> {
  if (ownerIds.length === 0) return {}
  const even = 100 / ownerIds.length
  const out: Record<string, number> = {}
  ownerIds.forEach((id) => (out[id] = even))
  return out
}

/** Validate operator-entered custom percentages. Owner-coverage and
 *  negativity checks stay CLI-side (they shape the interactive prompt), but
 *  the sum check delegates to the apps' shared `validateSplit` so the CLI
 *  accepts exactly what the apps accept — ±0.5 tolerance included
 *  (spec 013 US5/A3). */
export function validateCustomSplit(
  input: Record<string, number>,
  ownerIds: string[]
): { ok: true } | { ok: false; error: string } {
  const keys = Object.keys(input)
  if (keys.length !== ownerIds.length || !ownerIds.every((id) => id in input)) {
    return { ok: false, error: 'split must cover exactly the selected owners' }
  }
  if (Object.values(input).some((v) => !Number.isFinite(v) || v < 0)) {
    return { ok: false, error: 'percentages must be non-negative numbers' }
  }
  const shared = validateSplit(0, ownerIds, { method: 'percent', percents: input })
  if (!shared.ok) {
    const sum = Object.values(input).reduce((a, b) => a + b, 0)
    return { ok: false, error: `split must total 100% (got ${sum})` }
  }
  return { ok: true }
}
