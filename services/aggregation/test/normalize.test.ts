// The money-safety heart (spec 028, research D4). A sign error here would swap
// income and spending, so this is the heaviest-covered module.
import { describe, expect, it } from 'vitest'
import {
  amountToCents,
  base64Decode,
  base64Encode,
  dedupeKey,
  decodeSetupToken,
  deriveProviderItemId,
  hash128Hex,
  hexToUuid,
  ledgerId,
} from '../src/index'

describe('amountToCents — signed decimal string → (abs cents, kind)', () => {
  it('maps a negative (outflow) to expense with absolute cents', () => {
    expect(amountToCents('-33.45')).toEqual({ amountCents: 3345, kind: 'expense', zero: false })
  })

  it('maps a positive (inflow) to income — SimpleFIN sign is inverted vs Plaid', () => {
    expect(amountToCents('100')).toEqual({ amountCents: 10000, kind: 'income', zero: false })
    expect(amountToCents('+12.34')).toEqual({ amountCents: 1234, kind: 'income', zero: false })
  })

  it('pads a single fractional digit to two', () => {
    expect(amountToCents('-33.4')).toEqual({ amountCents: 3340, kind: 'expense', zero: false })
  })

  it('truncates extra fractional digits deterministically (no rounding, no float)', () => {
    expect(amountToCents('-33.459')).toEqual({ amountCents: 3345, kind: 'expense', zero: false })
    expect(amountToCents('0.1')).toEqual({ amountCents: 10, kind: 'income', zero: false })
  })

  it('avoids floating-point drift on classic cases', () => {
    // 0.1 + 0.2 in float ≠ 0.3; string math must be exact.
    expect(amountToCents('0.30')?.amountCents).toBe(30)
    expect(amountToCents('19.99')?.amountCents).toBe(1999)
  })

  it('classifies exact zero as income and flags it', () => {
    expect(amountToCents('0')).toEqual({ amountCents: 0, kind: 'income', zero: true })
    expect(amountToCents('0.00')).toEqual({ amountCents: 0, kind: 'income', zero: true })
    expect(amountToCents('-0.00')).toEqual({ amountCents: 0, kind: 'income', zero: true })
  })

  it('tolerates surrounding whitespace', () => {
    expect(amountToCents('  -5.00 ')).toEqual({ amountCents: 500, kind: 'expense', zero: false })
  })

  it('rejects thousands separators, letters, and multiple dots', () => {
    expect(amountToCents('1,234.56')).toBeNull()
    expect(amountToCents('12.3.4')).toBeNull()
    expect(amountToCents('abc')).toBeNull()
    expect(amountToCents('')).toBeNull()
    expect(amountToCents('$5.00')).toBeNull()
  })
})

describe('base64 codec (pure, runtime-agnostic)', () => {
  it('round-trips ASCII', () => {
    const s = 'https://bridge.simplefin.org/simplefin/claim/DEMO-TOKEN'
    expect(base64Decode(base64Encode(s))).toBe(s)
  })

  it('decodes URL-safe and unpadded input', () => {
    const s = 'user:p@ss'
    const std = base64Encode(s)
    expect(base64Decode(std.replace(/=+$/, ''))).toBe(s)
  })

  it('returns null on invalid characters', () => {
    expect(base64Decode('not base64 !!!')).toBeNull()
  })
})

describe('decodeSetupToken', () => {
  it('base64-decodes a token to its claim URL', () => {
    const claimUrl = 'https://bridge.simplefin.org/simplefin/claim/ABC123'
    const token = base64Encode(claimUrl)
    expect(decodeSetupToken(token)).toBe(claimUrl)
  })

  it('rejects a token that does not decode to an http(s) URL', () => {
    expect(decodeSetupToken(base64Encode('not-a-url'))).toBeNull()
    expect(decodeSetupToken('!!!not base64')).toBeNull()
  })
})

describe('deriveProviderItemId', () => {
  it('is deterministic and prefixed', () => {
    const url = 'https://u:p@bridge.simplefin.org/simplefin'
    const id = deriveProviderItemId(url)
    expect(id).toMatch(/^sfin_[0-9a-f]{32}$/)
    expect(deriveProviderItemId(url)).toBe(id)
  })

  it('differs for different Access URLs', () => {
    expect(deriveProviderItemId('https://a:b@h/x')).not.toBe(deriveProviderItemId('https://a:b@h/y'))
  })
})

describe('dedupe key + deterministic ledger id (research D6)', () => {
  it('keys on (account, txn) so cross-account id reuse does not collide', () => {
    expect(dedupeKey('acctA', 'txn1')).not.toBe(dedupeKey('acctB', 'txn1'))
    expect(ledgerId('acctA', 'txn1')).not.toBe(ledgerId('acctB', 'txn1'))
  })

  it('is stable across calls (idempotent re-sync)', () => {
    expect(ledgerId('acctA', 'txn1')).toBe(ledgerId('acctA', 'txn1'))
  })

  it('formats as a canonical UUID', () => {
    expect(ledgerId('acctA', 'txn1')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('hexToUuid pads and segments correctly', () => {
    expect(hexToUuid('0123456789abcdef0123456789abcdef')).toBe(
      '01234567-89ab-cdef-0123-456789abcdef'
    )
  })

  it('hash128Hex is 32 hex chars', () => {
    expect(hash128Hex('anything')).toMatch(/^[0-9a-f]{32}$/)
  })
})
