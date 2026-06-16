import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { filterTransactions, type FilterCriteria, type FilterContext } from '../lib/transactionFilters'
import type { Transaction } from '../lib/types'

const here = dirname(fileURLToPath(import.meta.url))
const { cases } = JSON.parse(
  readFileSync(resolve(here, '../../shared/test-vectors/transaction-filters.json'), 'utf8')
) as {
  cases: Array<{
    name: string
    transactions: Transaction[]
    context: FilterContext
    criteria: FilterCriteria
    expectedIds: string[]
  }>
}

describe('transaction filter parity vs golden vectors', () => {
  for (const c of cases) {
    it(c.name, () => {
      const got = filterTransactions(c.transactions, c.criteria, c.context).map((t) => t.id)
      expect(got).toEqual(c.expectedIds)
    })
  }
})
