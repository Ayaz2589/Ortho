import { describe, it, expect } from 'vitest'
import { parseAmountToCents, isAmountToken } from '../../scripts/import/engine/money'

describe('parseAmountToCents', () => {
  it('parses plain and thousands-separated amounts to exact cents', () => {
    expect(parseAmountToCents('38.50')).toBe(3850)
    expect(parseAmountToCents('2,800.00')).toBe(280000)
    expect(parseAmountToCents('24,156.88')).toBe(2415688)
    expect(parseAmountToCents('0.03')).toBe(3)
    expect(parseAmountToCents('$25.00')).toBe(2500)
  })

  it('handles a negative sign', () => {
    expect(parseAmountToCents('-104.50')).toBe(-10450)
  })

  it('throws on malformed input (never a silent zero)', () => {
    expect(() => parseAmountToCents('abc')).toThrow()
    expect(() => parseAmountToCents('100')).toThrow() // no decimals
    expect(() => parseAmountToCents('1.5')).toThrow() // one decimal place
    expect(() => parseAmountToCents('')).toThrow()
  })
})

describe('isAmountToken', () => {
  it('recognizes a bare amount line', () => {
    expect(isAmountToken('38.50')).toBe(true)
    expect(isAmountToken('2,000.00')).toBe(true)
    expect(isAmountToken('$25.00')).toBe(true)
  })

  it('rejects non-amount lines', () => {
    expect(isAmountToken('EFT ASTORIA * NY')).toBe(false)
    expect(isAmountToken('05/04 MOBILE DEPOSIT 2,800.00')).toBe(false)
    expect(isAmountToken('1962740')).toBe(false)
  })
})
