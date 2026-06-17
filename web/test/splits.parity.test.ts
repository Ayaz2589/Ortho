import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { computeShares, validateSplit, seedSplit, type SplitInput, type SplitSeed } from '@/lib/splits'

// Locks computeShares/validateSplit/seedSplit against the shared golden vectors
// that the iOS XCTest suite also asserts — neither language can drift.
interface SplitCase { name: string; amountCents: number; owners: string[]; split: SplitInput; expected: Record<string, number> }
interface ValCase { name: string; amountCents: number; owners: string[]; split: SplitInput; result: { ok: boolean; reason?: string } }
interface SeedCase { name: string; amountCents: number; owners: string[]; storedCents: Record<string, number>; expected: SplitSeed; roundTrip: Record<string, number> }

const vectors = JSON.parse(
  readFileSync(resolve(__dirname, '../../shared/test-vectors/transaction-splits.json'), 'utf8')
) as { cases: SplitCase[]; validations: ValCase[]; seeds: SeedCase[] }

describe('transaction-splits golden vectors — computeShares', () => {
  for (const c of vectors.cases) {
    it(c.name, () => {
      const shares = computeShares(c.amountCents, c.owners, c.split)
      expect(shares).toEqual(c.expected)
      const sum = Object.values(shares).reduce((a, b) => a + b, 0)
      if (c.split.method !== 'value' && c.owners.length > 0) expect(sum).toBe(c.amountCents)
    })
  }
})

describe('transaction-splits golden vectors — validateSplit', () => {
  for (const c of vectors.validations) {
    it(c.name, () => {
      expect(validateSplit(c.amountCents, c.owners, c.split)).toEqual(c.result)
    })
  }
})

describe('transaction-splits golden vectors — seedSplit (lossless edit prefill)', () => {
  for (const c of vectors.seeds) {
    it(c.name, () => {
      const seed = seedSplit(c.amountCents, c.owners, c.storedCents)
      expect(seed).toEqual(c.expected)
      // Applying the seed re-derives the stored cents exactly — a no-op
      // edit/copy round-trips losslessly (no silent re-even-split).
      const split: SplitInput =
        seed.method === 'even' ? { method: 'even' } : { method: 'value', values: seed.values }
      expect(computeShares(c.amountCents, c.owners, split)).toEqual(c.roundTrip)
      expect(c.roundTrip).toEqual(c.storedCents)
    })
  }
})
