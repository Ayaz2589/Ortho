import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { balanceBetween } from '@/lib/finance/balances'
import type { Transaction } from '@/lib/types'

const here = dirname(fileURLToPath(import.meta.url))
const { cases } = JSON.parse(
  readFileSync(resolve(here, '../../shared/test-vectors/member-balance.json'), 'utf8')
) as {
  cases: Array<{
    name: string
    viewer: string
    other: string
    transactions: Transaction[]
    expected: number
  }>
}

// spec 053 — the nine historical cases, restored from c70acef^ as the regression lock for
// the pairwise expense/transfer rules the N-person rebuild must preserve exactly.
describe('member balance parity vs golden vectors', () => {
  for (const c of cases) {
    it(c.name, () => {
      expect(balanceBetween(c.viewer, c.other, c.transactions)).toBe(c.expected)
    })
  }
})
