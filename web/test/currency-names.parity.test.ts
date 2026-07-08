import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { CURRENCY_NAMES, type CurrencyKey } from '@/lib/finance/currency'

// Locks the per-currency DISPLAY NAME against the shared golden vector the iOS
// CurrencyNameParityTests also assert — the two clients must name every currency
// identically (GBP was 'British Pound' on web vs 'UK Pound' on iOS; now both 'UK Pound').
const vectors = JSON.parse(
  readFileSync(resolve(__dirname, '../../shared/test-vectors/currency-names.json'), 'utf8')
) as Record<CurrencyKey, string>

describe('currency-names golden vector — display names match iOS', () => {
  for (const [key, name] of Object.entries(vectors) as Array<[CurrencyKey, string]>) {
    it(`${key} → ${name}`, () => {
      expect(CURRENCY_NAMES[key]).toBe(name)
    })
  }
  it('covers all 7 currencies', () => {
    expect(Object.keys(vectors).length).toBe(7)
  })
})
