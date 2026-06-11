import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  monthlyPaymentCents,
  currentPrincipalBalanceCents,
  currentEquityCents,
  equityFraction,
  maturityDate,
  yearsRemaining,
  upcomingAmortization,
} from '../lib/finance/mortgage'

const here = dirname(fileURLToPath(import.meta.url))
const vectors = JSON.parse(
  readFileSync(resolve(here, '../../shared/test-vectors/mortgage.json'), 'utf8')
) as Array<{ input: any; expected: any }>

const local = (s: string) => {
  const [y, m, day] = s.split('-').map(Number)
  return new Date(y, m - 1, day)
}
const ymd = (x: Date) =>
  `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`

describe('mortgage parity vs golden vectors', () => {
  for (const { input: i, expected } of vectors) {
    it(i.name, () => {
      const asOf = local(i.asOf)
      expect(monthlyPaymentCents(i.originalLoanCents, i.annualRatePercent, i.termYears)).toBe(
        expected.monthlyPaymentCents
      )
      expect(
        currentPrincipalBalanceCents(i.originalLoanCents, i.annualRatePercent, i.termYears, i.closingDate, asOf)
      ).toBe(expected.currentPrincipalBalanceCents)
      expect(
        currentEquityCents(i.purchasePriceCents, i.originalLoanCents, i.annualRatePercent, i.termYears, i.closingDate, asOf)
      ).toBe(expected.currentEquityCents)
      expect(
        equityFraction(i.purchasePriceCents, i.originalLoanCents, i.annualRatePercent, i.termYears, i.closingDate, asOf)
      ).toBeCloseTo(expected.equityFraction, 9)
      expect(ymd(maturityDate(i.closingDate, i.termYears))).toBe(expected.maturityDate)
      expect(yearsRemaining(i.closingDate, i.termYears, asOf)).toBe(expected.yearsRemaining)
      expect(
        upcomingAmortization(12, i.originalLoanCents, i.annualRatePercent, i.termYears, i.closingDate, asOf).map((e) => ({
          principalCents: e.principalCents,
          interestCents: e.interestCents,
        }))
      ).toEqual(expected.amortization12)
    })
  }
})
