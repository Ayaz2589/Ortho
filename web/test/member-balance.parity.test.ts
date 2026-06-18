import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { balanceBetween } from '@/lib/balances'
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

describe('member balance parity vs golden vectors', () => {
  for (const c of cases) {
    it(c.name, () => {
      expect(balanceBetween(c.viewer, c.other, c.transactions)).toBe(c.expected)
    })
  }
})
