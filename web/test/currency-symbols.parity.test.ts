import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { currencySymbol, type CurrencyKey } from '@/lib/finance/currency'

// Locks the per-currency SYMBOL against the shared golden vector the iOS
// CurrencySymbolParityTests also assert. Both clients read a FIXED table (no
// locale derivation): CNY was '¥' on web but locale-derived 'CN¥' on iOS — now
// both 'CN¥', disambiguated from JPY '¥'.
const vectors = JSON.parse(
  readFileSync(resolve(__dirname, '../../shared/test-vectors/currency-symbols.json'), 'utf8')
) as Record<CurrencyKey, string>

describe('currency-symbols golden vector — symbols match iOS', () => {
  for (const [key, symbol] of Object.entries(vectors) as Array<[CurrencyKey, string]>) {
    it(`${key} → ${symbol}`, () => {
      expect(currencySymbol(key)).toBe(symbol)
    })
  }
  it('CNY is CN¥ (not ¥) so it never collides with JPY', () => {
    expect(vectors.cny).toBe('CN¥')
    expect(vectors.cny).not.toBe(vectors.jpy)
  })
})
