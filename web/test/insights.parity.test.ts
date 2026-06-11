import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { generateInsights } from '../lib/finance/insights'

const here = dirname(fileURLToPath(import.meta.url))
const vectors = JSON.parse(
  readFileSync(resolve(here, '../../shared/test-vectors/insights.json'), 'utf8')
) as Array<{ input: any; expected: any }>

const local = (s: string) => {
  const [y, m, day] = s.split('-').map(Number)
  return new Date(y, m - 1, day)
}

describe('insight engine parity vs golden vectors', () => {
  for (const { input, expected } of vectors) {
    it(input.name, () => {
      const got = generateInsights(
        input.transactions,
        input.budgets,
        input.properties,
        local(input.referenceDate)
      ).map((i) => ({
        id: i.id,
        severity: i.severity,
        category: i.category,
        magnitude_cents: i.magnitude_cents,
      }))
      expect(got).toEqual(expected)
    })
  }
})
