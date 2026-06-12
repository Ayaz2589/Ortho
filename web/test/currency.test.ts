import { describe, it, expect } from 'vitest'
import {
  CURRENCIES,
  CURRENCY_NAMES,
  FALLBACK_RATE_FROM_USD,
  currencyCode,
  currencySymbol,
  fractionDigits,
  type CurrencyKey,
} from '@/lib/finance/currency'
import { CURRENCY_CONFIG } from '@/lib/finance/money'

describe('CURRENCIES', () => {
  it('is in the exact expected order (matches iOS Currency enum)', () => {
    expect(CURRENCIES).toEqual(['usd', 'cad', 'gbp', 'eur', 'jpy', 'cny', 'bdt'])
  })
})

describe('lookup tables cover every CurrencyKey', () => {
  it('CURRENCY_NAMES has a non-empty entry for every currency', () => {
    for (const key of CURRENCIES) {
      expect(CURRENCY_NAMES[key]).toBeTruthy()
      expect(typeof CURRENCY_NAMES[key]).toBe('string')
    }
    // no extra keys beyond CURRENCIES
    expect(Object.keys(CURRENCY_NAMES).sort()).toEqual([...CURRENCIES].sort())
  })

  it('FALLBACK_RATE_FROM_USD has a positive numeric entry for every currency', () => {
    for (const key of CURRENCIES) {
      const rate = FALLBACK_RATE_FROM_USD[key]
      expect(typeof rate).toBe('number')
      expect(rate).toBeGreaterThan(0)
    }
    expect(Object.keys(FALLBACK_RATE_FROM_USD).sort()).toEqual([...CURRENCIES].sort())
  })

  it('USD fallback rate is 1', () => {
    expect(FALLBACK_RATE_FROM_USD.usd).toBe(1)
  })
})

describe('accessors return the configured values', () => {
  it.each<[CurrencyKey]>(CURRENCIES.map((c) => [c]))(
    'currencyCode/currencySymbol/fractionDigits match CURRENCY_CONFIG for %s',
    (key) => {
      expect(currencyCode(key)).toBe(CURRENCY_CONFIG[key].code)
      expect(currencySymbol(key)).toBe(CURRENCY_CONFIG[key].symbol)
      expect(fractionDigits(key)).toBe(CURRENCY_CONFIG[key].fractionDigits)
    }
  )

  it('returns concrete known values', () => {
    expect(currencyCode('usd')).toBe('USD')
    expect(currencySymbol('gbp')).toBe('£')
    expect(fractionDigits('jpy')).toBe(0)
    expect(fractionDigits('usd')).toBe(2)
  })
})
