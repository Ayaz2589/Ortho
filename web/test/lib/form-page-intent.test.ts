import { describe, expect, it } from 'vitest'
import { parseTxNewParams, parseIdParam, parseKindParam } from '@/lib/formPageIntent'

describe('parseTxNewParams', () => {
  it('reads a copyFrom id', () => {
    expect(parseTxNewParams('?copyFrom=tx-1')).toEqual({ copyFrom: 'tx-1' })
  })

  it('ignores the retired settle-up transfer params (spec 043)', () => {
    // The from/to/amount settle-up prefill was removed with the balances feature.
    expect(parseTxNewParams('?from=p1&to=p2&amount=1200')).toEqual({ copyFrom: null })
    expect(parseTxNewParams('?copyFrom=tx-1&from=p1&to=p2&amount=500')).toEqual({ copyFrom: 'tx-1' })
  })

  it('returns null copyFrom for a blank search', () => {
    expect(parseTxNewParams('')).toEqual({ copyFrom: null })
    expect(parseTxNewParams('?copyFrom=')).toEqual({ copyFrom: null })
  })
})

describe('parseIdParam', () => {
  it('reads a non-empty id', () => {
    expect(parseIdParam('?id=prop-9')).toBe('prop-9')
  })
  it('returns null for missing/empty id', () => {
    expect(parseIdParam('')).toBeNull()
    expect(parseIdParam('?id=')).toBeNull()
    expect(parseIdParam('?id=%20%20')).toBeNull()
  })
})

describe('parseKindParam', () => {
  it('reads a valid PropertyKind', () => {
    expect(parseKindParam('?kind=rental')).toBe('rental')
    expect(parseKindParam('?kind=primary_home')).toBe('primary_home')
    expect(parseKindParam('?kind=multifamily')).toBe('multifamily')
  })
  it('returns null for an unknown/absent kind', () => {
    expect(parseKindParam('?kind=castle')).toBeNull()
    expect(parseKindParam('')).toBeNull()
  })
})
