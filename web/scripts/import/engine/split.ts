// Split math for multi-owner (shared) transactions. Even splits reuse the web's
// effectiveSplits for exact parity (including its rounding). Custom splits must
// cover exactly the owners and total 100.
import { effectiveSplits } from '../../../lib/format'
import type { Transaction } from '../../../lib/types'

/** Even split percentages per owner — identical to the apps' default. */
export function evenSplit(ownerIds: string[]): Record<string, number> {
  return effectiveSplits({ owner_ids: ownerIds, splits: null } as Transaction)
}

/** Validate operator-entered custom percentages. */
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
  const sum = Object.values(input).reduce((a, b) => a + b, 0)
  if (Math.round(sum * 100) / 100 !== 100) {
    return { ok: false, error: `split must total 100% (got ${sum})` }
  }
  return { ok: true }
}
