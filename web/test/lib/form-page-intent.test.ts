import { describe, expect, it } from 'vitest'
import { parseTxNewParams, parseIdParam, parseKindParam } from '@/lib/formPageIntent'

describe('parseTxNewParams', () => {
  it('reads a copyFrom id', () => {
    expect(parseTxNewParams('?copyFrom=tx-1')).toEqual({ copyFrom: 'tx-1', transfer: null })
  })

  it('reads a settle-up transfer (from/to/amount)', () => {
    expect(parseTxNewParams('?from=p1&to=p2&amount=1200')).toEqual({
      copyFrom: null,
      transfer: { from: 'p1', to: 'p2', amountCents: 1200 },
    })
  })

  it('transfer takes precedence when both are present', () => {
    expect(parseTxNewParams('?copyFrom=tx-1&from=p1&to=p2&amount=500')).toEqual({
      copyFrom: null,
      transfer: { from: 'p1', to: 'p2', amountCents: 500 },
    })
  })

  it('falls back to blank on missing/invalid transfer params', () => {
    expect(parseTxNewParams('?from=p1&to=p2')).toEqual({ copyFrom: null, transfer: null })
    expect(parseTxNewParams('?from=p1&to=p2&amount=')).toEqual({ copyFrom: null, transfer: null })
    expect(parseTxNewParams('?from=p1&to=p2&amount=abc')).toEqual({ copyFrom: null, transfer: null })
    expect(parseTxNewParams('?from=p1&to=p2&amount=12.5')).toEqual({ copyFrom: null, transfer: null })
    expect(parseTxNewParams('?from=p1&to=p2&amount=-5')).toEqual({ copyFrom: null, transfer: null })
  })

  it('returns all-null for a blank search', () => {
    expect(parseTxNewParams('')).toEqual({ copyFrom: null, transfer: null })
    expect(parseTxNewParams('?copyFrom=')).toEqual({ copyFrom: null, transfer: null })
  })

  it('accepts a zero amount as blank-ish but never crashes', () => {
    // amount=0 is a valid non-negative integer; the form itself blocks saving a 0.
    expect(parseTxNewParams('?from=p1&to=p2&amount=0')).toEqual({
      copyFrom: null,
      transfer: { from: 'p1', to: 'p2', amountCents: 0 },
    })
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
