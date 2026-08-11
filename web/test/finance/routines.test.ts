import { describe, expect, it } from 'vitest'
import { normalizeMerchantKey } from '../../lib/finance/routines'

describe('normalizeMerchantKey', () => {
  it('strips a trailing POS store/location number', () => {
    expect(normalizeMerchantKey("Dunkin' #04521")).toBe('dunkin')
    expect(normalizeMerchantKey('DUNKIN 4521')).toBe('dunkin')
  })

  it('case-folds', () => {
    expect(normalizeMerchantKey('Blue Bottle Coffee')).toBe('blue bottle coffee')
    expect(normalizeMerchantKey('BLUE BOTTLE COFFEE')).toBe('blue bottle coffee')
  })

  it('collapses internal whitespace and punctuation', () => {
    expect(normalizeMerchantKey('Whole   Foods,  Inc.')).toBe('whole foods inc')
    expect(normalizeMerchantKey('  Netflix  ')).toBe('netflix')
  })

  it('is idempotent', () => {
    const once = normalizeMerchantKey("DD/BR #3401")
    expect(normalizeMerchantKey(once)).toBe(once)
  })

  it('does not strip short numbers that are part of the name itself', () => {
    // A 1-2 digit trailing number is plausibly part of the brand, not a store code —
    // only 3-6 digit POS/store codes are stripped (see routines-thresholds.ts).
    expect(normalizeMerchantKey('7 Eleven')).toBe('7 eleven')
  })
})
