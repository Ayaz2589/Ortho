import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { computeShares, validateSplit, type SplitInput } from '@/lib/splits'

// Locks computeShares/validateSplit against the shared golden vectors that the
// iOS XCTest suite also asserts — neither language can drift.
interface SplitCase { name: string; amountCents: number; owners: string[]; split: SplitInput; expected: Record<string, number> }
interface ValCase { name: string; amountCents: number; owners: string[]; split: SplitInput; result: { ok: boolean; reason?: string } }

const vectors = JSON.parse(
  readFileSync(resolve(__dirname, '../../shared/test-vectors/transaction-splits.json'), 'utf8')
) as { cases: SplitCase[]; validations: ValCase[] }

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
