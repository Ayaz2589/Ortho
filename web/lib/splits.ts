// Pure, cross-platform transaction-split math — the source of truth mirrored by
// iOS `TransactionSplits.swift` and locked by the shared golden vectors
// (shared/test-vectors/transaction-splits.json). Integer USD cents only; the
// percent/even paths use IEEE-754 double arithmetic identically to Swift's
// `Double`, so the two implementations cannot diverge. See
// specs/007-household-splits/contracts/split-function.md.

export type SplitMethod = 'even' | 'percent' | 'value'

/**
 * Canonical owner order for share *computation*: owner-id strings sorted
 * ascending. Both clients sort identically (iOS sorts `Person.ID.uuidString`;
 * the relative order of two hex UUID strings is the same regardless of case),
 * so the deterministic leftover cent (even/percent) lands on the same owner
 * regardless of the order owners were entered or stored in. `computeShares`
 * stays order-sensitive — callers canonicalize before computing shares for
 * storage or the even fallback. Locked by the `ownerOrdering` golden vectors.
 */
export function orderedOwnerIds(ids: string[]): string[] {
  return [...ids].sort()
}

export type SplitInput =
  | { method: 'even' }
  | { method: 'percent'; percents: Record<string, number> }
  | { method: 'value'; values: Record<string, number> }

/** Percentages may total 100 ± this much and still be accepted (matches iOS). */
export const PERCENT_TOLERANCE = 0.5

/**
 * Cents per owner. `owners` is the ordered owner list (length ≥ 1). The result
 * always sums to `amountCents` for `even`/`percent`; for `value` it returns the
 * entered cents (the caller must `validateSplit` first). Leftover cents from
 * flooring are handed out **one per owner in list order**, wrapping if needed.
 */
export function computeShares(
  amountCents: number,
  owners: string[],
  split: SplitInput
): Record<string, number> {
  const out: Record<string, number> = {}
  const n = owners.length
  if (n === 0) return out
  if (n === 1) {
    out[owners[0]] = amountCents
    return out
  }

  if (split.method === 'value') {
    for (const id of owners) out[id] = split.values[id] ?? 0
    return out
  }

  // even or percent: floor each owner's target, then distribute the leftover.
  let assigned = 0
  for (const id of owners) {
    const target =
      split.method === 'percent' ? (amountCents * (split.percents[id] ?? 0)) / 100 : amountCents / n
    const base = Math.floor(target)
    out[id] = base
    assigned += base
  }
  let leftover = amountCents - assigned
  let i = 0
  while (leftover > 0) {
    out[owners[i % n]] += 1
    leftover -= 1
    i += 1
  }
  // Over-allocation guard: entered percents may total up to 100 + PERCENT_TOLERANCE,
  // so the floored bases can sum to MORE than amountCents (negative leftover). Reclaim
  // the excess one cent per owner in list order, skipping owners already at zero so no
  // share goes negative. Terminates because the positive bases sum to `assigned`
  // (> amountCents ≥ 0), leaving enough reclaimable cents. No-op for even splits and
  // percents totalling ≤ 100, so the golden vectors are unchanged.
  while (leftover < 0) {
    const id = owners[i % n]
    if (out[id] > 0) {
      out[id] -= 1
      leftover += 1
    }
    i += 1
  }
  return out
}

export type SplitValidation = { ok: true } | { ok: false; reason: 'percent_sum' | 'value_sum' | 'no_owners' }

/** Gate for saving: percents total 100 (±tolerance); values total the amount exactly. */
export function validateSplit(amountCents: number, owners: string[], split: SplitInput): SplitValidation {
  if (owners.length === 0) return { ok: false, reason: 'no_owners' }
  if (split.method === 'even') return { ok: true }
  if (split.method === 'percent') {
    const sum = owners.reduce((s, id) => s + (split.percents[id] ?? 0), 0)
    return Math.abs(sum - 100) <= PERCENT_TOLERANCE ? { ok: true } : { ok: false, reason: 'percent_sum' }
  }
  const sum = owners.reduce((s, id) => s + (split.values[id] ?? 0), 0)
  return sum === amountCents ? { ok: true } : { ok: false, reason: 'value_sum' }
}

/** Even-split cents per owner — convenience for the common default. */
export function evenShares(amountCents: number, owners: string[]): Record<string, number> {
  return computeShares(amountCents, owners, { method: 'even' })
}

/** Derived display percentage for an owner's cents share (0 when amount is 0). */
export function sharePercent(shareCents: number, amountCents: number): number {
  if (amountCents === 0) return 0
  return Math.round((shareCents / amountCents) * 100)
}

export type SplitSeed =
  | { method: 'even' }
  | { method: 'value'; values: Record<string, number> }

/**
 * Reconstruct the split-editor seed for an existing transaction's stored
 * per-owner cents, so editing/copying round-trips losslessly. Returns
 * `{method:'even'}` when the stored shares already equal an even split (the
 * editor keeps its even default); otherwise `{method:'value', values}` with the
 * EXACT stored cents, so a custom split reopens showing the real per-owner
 * amounts and a no-op re-save preserves them to the cent. The invariant
 * `computeShares(amount, owners, asSplitInput(seedSplit(...))) === storedCents`
 * holds. Mirrored by iOS `TransactionSplits.seedSplit` and locked by the shared
 * golden vectors.
 */
export function seedSplit(
  amountCents: number,
  owners: string[],
  storedCents: Record<string, number>
): SplitSeed {
  const even = computeShares(amountCents, owners, { method: 'even' })
  const isEven = owners.every((id) => (storedCents[id] ?? 0) === even[id])
  if (isEven) return { method: 'even' }
  const values: Record<string, number> = {}
  for (const id of owners) values[id] = storedCents[id] ?? 0
  return { method: 'value', values }
}
