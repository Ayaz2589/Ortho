import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { availableMonths, availableRanges, monthReferenceDate, stepMonth } from '@/components/dashboard/range'
import type { DashboardRange } from '@/components/dashboard/range'
import type { Transaction } from '@/lib/types'

const here = dirname(fileURLToPath(import.meta.url))
const V = JSON.parse(
  readFileSync(resolve(here, '../../shared/test-vectors/dashboard-month-scope.json'), 'utf8')
) as {
  availableMonths: Array<{ name: string; dates: string[]; expected: string[] }>
  availableRanges: Array<{ name: string; dates: string[]; now: string; expected: DashboardRange[] }>
  monthReferenceDate: Array<{ name: string; month: string; expected: string }>
  stepMonth: Array<{ name: string; months: string[]; current: string; direction: 'prev' | 'next'; expected: string | null }>
}

describe('dashboard month-scope parity vs golden vectors', () => {
  describe('availableMonths', () => {
    for (const c of V.availableMonths) {
      it(c.name, () => {
        const txns = c.dates.map((date) => ({ date }) as Transaction)
        expect(availableMonths(txns)).toEqual(c.expected)
      })
    }
  })

  // Spec 013 US4: the last unvectored month-scope function.
  describe('availableRanges', () => {
    it('section exists in the vector file', () => {
      expect(V.availableRanges?.length ?? 0).toBeGreaterThan(0)
    })
    for (const c of V.availableRanges ?? []) {
      it(c.name, () => {
        const txns = c.dates.map((date) => ({ date }) as Transaction)
        expect(availableRanges(txns, new Date(c.now))).toEqual(c.expected)
      })
    }
  })

  describe('monthReferenceDate', () => {
    for (const c of V.monthReferenceDate) {
      it(c.name, () => {
        expect(monthReferenceDate(c.month).toISOString()).toBe(c.expected)
      })
    }
  })

  describe('stepMonth', () => {
    for (const c of V.stepMonth) {
      it(c.name, () => {
        expect(stepMonth(c.months, c.current, c.direction)).toBe(c.expected)
      })
    }
  })
})
