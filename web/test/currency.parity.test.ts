import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { toDisplayAmount, toUSDCents, type CurrencyKey } from '@/lib/finance/money'

// Locks toDisplayAmount / toUSDCents against the shared golden vectors that the
// iOS CurrencyParityTests also assert — the two clients must convert money
// identically (same rounding, USD-cents invariant) across every currency.
interface ToDisplayCase { name: string; cents: number; currency: CurrencyKey; rate: number; expected: number }
interface ToUsdCase { name: string; amount: number; currency: CurrencyKey; rate: number; expected: number }

const vectors = JSON.parse(
  readFileSync(resolve(__dirname, '../../shared/test-vectors/currency.json'), 'utf8')
) as { toDisplay: ToDisplayCase[]; toUsdCents: ToUsdCase[] }

describe('currency golden vectors — toDisplayAmount (USD cents → display amount)', () => {
  for (const c of vectors.toDisplay) {
    it(c.name, () => {
      expect(toDisplayAmount(c.cents, c.currency, c.rate)).toBe(c.expected)
    })
  }
})

describe('currency golden vectors — toUSDCents (display amount → USD cents)', () => {
  for (const c of vectors.toUsdCents) {
    it(c.name, () => {
      const result = toUSDCents(c.amount, c.currency, c.rate)
      expect(result).toBe(c.expected)
      expect(Number.isInteger(result)).toBe(true)
    })
  }
})
