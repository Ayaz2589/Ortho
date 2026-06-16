// Pure, cross-platform transaction-split math — the source of truth mirrored by
// iOS `TransactionSplits.swift` and locked by the shared golden vectors
// (shared/test-vectors/transaction-splits.json). Integer USD cents only; the
// percent/even paths use IEEE-754 double arithmetic identically to Swift's
// `Double`, so the two implementations cannot diverge. See
// specs/007-household-splits/contracts/split-function.md.

export type SplitMethod = 'even' | 'percent' | 'value'

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
