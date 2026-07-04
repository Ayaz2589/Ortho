import { describe, it, expect } from 'vitest'
import { validateAmount, validateMerchant, validateCategory, parseDay, todayISO } from '../../scripts/import/engine/validate'

describe('validateAmount', () => {
  it('parses dollars to positive integer cents', () => {
    expect(validateAmount('12.34')).toBe(1234)
    expect(validateAmount('$1,000.00')).toBe(100000)
  })
  it('rejects zero, negative, and unparseable input', () => {
    expect(() => validateAmount('0.00')).toThrow()
    expect(() => validateAmount('-5.00')).toThrow()
    expect(() => validateAmount('abc')).toThrow()
    expect(() => validateAmount('10')).toThrow() // no decimals
  })
})

describe('validateMerchant', () => {
  it('trims and requires non-empty', () => {
    expect(validateMerchant('  Corner Coffee ')).toBe('Corner Coffee')
    expect(() => validateMerchant('   ')).toThrow()
  })
})

describe('validateCategory', () => {
  it('accepts an enum value and rejects others', () => {
    expect(validateCategory('dining')).toBe('dining')
    expect(() => validateCategory('food')).toThrow()
  })
})

describe('parseDay / todayISO', () => {
  it('parses YYYY-MM-DD to noon UTC (timezone-stable)', () => {
    expect(parseDay('2026-05-04')).toBe('2026-05-04T12:00:00.000Z')
  })
  it('rejects malformed dates', () => {
    expect(() => parseDay('5/4/26')).toThrow()
    expect(() => parseDay('2026-5-4')).toThrow()
  })
  it('todayISO uses the injected clock at noon UTC', () => {
    expect(todayISO(new Date('2026-06-15T09:30:00Z'))).toBe('2026-06-15T12:00:00.000Z')
  })
  it('todayISO uses the America/New_York day, not the UTC day (evening ET)', () => {
    // 01:00Z on Jul 4 is 21:00 ET on Jul 3 — the row belongs to Jul 3, matching
    // the noon-UTC-of-the-NY-day convention (regression guard for the UTC-day bug).
    expect(todayISO(new Date('2026-07-04T01:00:00Z'))).toBe('2026-07-03T12:00:00.000Z')
  })
})
