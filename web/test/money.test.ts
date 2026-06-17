import { describe, it, expect } from 'vitest'
import {
  formatMoney,
  toUSDCents,
  CURRENCY_CONFIG,
  type CurrencyKey,
} from '@/lib/finance/money'

describe('formatMoney', () => {
  describe('USD (2 fraction digits, divisor 100)', () => {
    it.each([
      // cents, leadingPlus, expected
      [1234, false, '$12.34'],
      [0, false, '$0.00'],
      [-1234, false, '-$12.34'],
      [1234, true, '+$12.34'], // leadingPlus adds '+' for positive
      [0, true, '$0.00'], // zero is not positive -> no '+'
      [-1234, true, '-$12.34'], // negative always uses '-', never '+'
    ])('formats %i cents (leadingPlus=%s) as %s', (cents, leadingPlus, expected) => {
      expect(formatMoney(cents, 'usd', 1, leadingPlus)).toBe(expected)
    })

    it('defaults to usd, rate 1, no leadingPlus', () => {
      expect(formatMoney(500)).toBe('$5.00')
    })
  })

  describe('EUR (2 fraction digits)', () => {
    it('formats positive', () => {
      expect(formatMoney(1000, 'eur')).toBe('€10.00')
    })
    it('formats negative with leading minus', () => {
      expect(formatMoney(-1000, 'eur')).toBe('-€10.00')
    })
    it('adds leading plus only when requested and positive', () => {
      expect(formatMoney(1000, 'eur', 1, true)).toBe('+€10.00')
    })
  })

  describe('JPY (0 fraction digits, no decimals — USD-cents invariant)', () => {
    it('divides USD cents by 100 then applies the rate (1234 cents = $12.34 = ¥12 at rate 1)', () => {
      // Storage is always USD cents; JPY just renders 0 decimals. No special divisor.
      expect(formatMoney(1234, 'jpy')).toBe('¥12')
    })
    it('formats zero without decimals', () => {
      expect(formatMoney(0, 'jpy')).toBe('¥0')
    })
    it('formats negative without decimals', () => {
      expect(formatMoney(-1234, 'jpy')).toBe('-¥12')
    })
    it('adds leading plus for positive', () => {
      expect(formatMoney(1234, 'jpy', 1, true)).toBe('+¥12')
    })
    it('renders a realistic JPY rate at the correct magnitude', () => {
      // $87.42 (8742 cents) at 1 USD = 150 JPY -> ¥13,113
      expect(formatMoney(8742, 'jpy', 150)).toBe('¥13,113')
    })
  })

  describe('rate scaling', () => {
    it('scales the amount by a non-1 rate (USD)', () => {
      // (1000 / 100) * 2 = 20.00
      expect(formatMoney(1000, 'usd', 2)).toBe('$20.00')
    })
    it('scales fractional rate (EUR)', () => {
      // (1000 / 100) * 0.92 = 9.20
      expect(formatMoney(1000, 'eur', 0.92)).toBe('€9.20')
    })
    it('scales JPY by rate on the USD-cents value', () => {
      // (100 / 100) * 1.5 = 1.5 -> ¥2 (0-decimal, rounded half away from zero)
      expect(formatMoney(100, 'jpy', 1.5)).toBe('¥2')
    })
  })
})

describe('locale-aware formatting (FR-004)', () => {
  it('uses the provided locale for grouping + decimal separators', () => {
    // de-DE groups with '.' and uses ',' as the decimal separator.
    expect(formatMoney(123456, 'eur', 1, false, 'de-DE')).toContain('1.234,56')
    // fr-FR uses ',' as the decimal separator (and a space for grouping).
    expect(formatMoney(123456, 'eur', 1, false, 'fr-FR')).toContain('234,56')
  })
  it('defaults to en-US grouping when no locale is given', () => {
    expect(formatMoney(123456, 'usd')).toBe('$1,234.56')
  })
})

describe('toUSDCents', () => {
  it('round-trips with formatMoney divisor logic for USD', () => {
    // 12.34 dollars -> 1234 USD cents
    expect(toUSDCents(12.34, 'usd', 1)).toBe(1234)
  })

  it('returns an integer (rounds)', () => {
    const result = toUSDCents(12.345, 'usd', 1)
    expect(Number.isInteger(result)).toBe(true)
    // 12.345 * 100 = 1234.5 -> rounds to 1235
    expect(result).toBe(1235)
  })

  it('rate === 0 -> 0', () => {
    expect(toUSDCents(99.99, 'usd', 0)).toBe(0)
    expect(toUSDCents(99.99, 'eur', 0)).toBe(0)
  })

  it('converts from a non-1 rate back to USD cents', () => {
    // 1 USD = 2 EUR; 20 EUR display -> 10 USD -> 1000 cents
    expect(toUSDCents(20, 'eur', 2)).toBe(1000)
  })

  it('JPY conversion is currency-agnostic (USD cents)', () => {
    // usdAmount = 150 / 150 = 1 USD; 1 * 100 = 100 cents
    expect(toUSDCents(150, 'jpy', 150)).toBe(100)
  })

  it('JPY at rate 1', () => {
    // usdAmount = 1234 / 1 = 1234 USD; 1234 * 100 = 123400 cents
    expect(toUSDCents(1234, 'jpy', 1)).toBe(123400)
  })

  it('defaults to usd, rate 1', () => {
    expect(toUSDCents(5)).toBe(500)
  })

  it.each<[CurrencyKey]>([['usd'], ['eur'], ['cad'], ['gbp']])(
    'formatMoney(toUSDCents(x)) round-trips for %s (rate 1)',
    (currency) => {
      const cents = toUSDCents(42.5, currency, 1)
      expect(formatMoney(cents, currency, 1)).toMatch(/42\.50$/)
    }
  )
})

describe('CURRENCY_CONFIG', () => {
  it('has the expected keys', () => {
    expect(Object.keys(CURRENCY_CONFIG).sort()).toEqual(
      ['bdt', 'cad', 'cny', 'eur', 'gbp', 'jpy', 'usd'].sort()
    )
  })

  it.each<[CurrencyKey, string, string, number]>([
    ['usd', 'USD', '$', 2],
    ['cad', 'CAD', 'CA$', 2],
    ['gbp', 'GBP', '£', 2],
    ['eur', 'EUR', '€', 2],
    ['jpy', 'JPY', '¥', 0],
    ['cny', 'CNY', '¥', 2],
    ['bdt', 'BDT', '৳', 2],
  ])('%s has shape { code, symbol, fractionDigits }', (key, code, symbol, digits) => {
    const config = CURRENCY_CONFIG[key]
    expect(config).toEqual({ code, symbol, fractionDigits: digits })
  })
})
