import { describe, expect, it } from 'vitest'
import { computeShares, validateSplit, sharePercent, type SplitInput } from '@/lib/splits'

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)

describe('computeShares', () => {
  it('single owner takes the full amount, any method', () => {
    expect(computeShares(9999, ['a'], { method: 'even' })).toEqual({ a: 9999 })
    expect(computeShares(9999, ['a'], { method: 'value', values: { a: 5000 } })).toEqual({ a: 9999 })
    expect(computeShares(9999, ['a'], { method: 'percent', percents: { a: 10 } })).toEqual({ a: 9999 })
  })

  it('even split divides evenly when divisible', () => {
    expect(computeShares(10000, ['a', 'b'], { method: 'even' })).toEqual({ a: 5000, b: 5000 })
  })

  it('even split assigns leftover cents to earliest owners in order', () => {
    expect(computeShares(10001, ['a', 'b'], { method: 'even' })).toEqual({ a: 5001, b: 5000 })
    expect(computeShares(1000, ['a', 'b', 'c'], { method: 'even' })).toEqual({ a: 334, b: 333, c: 333 })
    expect(computeShares(10001, ['a', 'b', 'c'], { method: 'even' })).toEqual({ a: 3334, b: 3334, c: 3333 })
  })

  it('leftover follows owner-list order, not id order', () => {
    expect(computeShares(10001, ['b', 'a'], { method: 'even' })).toEqual({ b: 5001, a: 5000 })
  })

  it('percent split — clean', () => {
    expect(computeShares(10000, ['a', 'b'], { method: 'percent', percents: { a: 70, b: 30 } })).toEqual({ a: 7000, b: 3000 })
  })

  it('percent split — uneven percentages, no leftover', () => {
    const r = computeShares(10000, ['a', 'b', 'c'], { method: 'percent', percents: { a: 33.33, b: 33.33, c: 33.34 } })
    expect(r).toEqual({ a: 3333, b: 3333, c: 3334 })
    expect(sum(r)).toBe(10000)
  })

  it('percent split — leftover cent goes to the first owner', () => {
    const r = computeShares(100, ['a', 'b', 'c'], { method: 'percent', percents: { a: 33.33, b: 33.33, c: 33.34 } })
    expect(r).toEqual({ a: 34, b: 33, c: 33 })
    expect(sum(r)).toBe(100)
  })

  it('value split returns entered cents', () => {
    expect(computeShares(10000, ['a', 'b'], { method: 'value', values: { a: 6000, b: 4000 } })).toEqual({ a: 6000, b: 4000 })
    expect(computeShares(10001, ['a', 'b'], { method: 'value', values: { a: 5001, b: 5000 } })).toEqual({ a: 5001, b: 5000 })
  })

  it('always sums to the amount for even/percent', () => {
    for (const amt of [1, 99, 100, 1000, 10001, 33333, 999999]) {
      for (const owners of [['a', 'b'], ['a', 'b', 'c'], ['a', 'b', 'c', 'd']]) {
        expect(sum(computeShares(amt, owners, { method: 'even' }))).toBe(amt)
      }
    }
  })

  it('no owners → empty', () => {
    expect(computeShares(100, [], { method: 'even' })).toEqual({})
  })

  it('reclaims cents when percents total just over 100 (within tolerance)', () => {
    // 50.4 + 50 = 100.4 passes validateSplit (±0.5) but floors to 5040+5000=10040,
    // 40¢ over. The reclaim path must pull shares back to sum exactly to the amount.
    const r = computeShares(10000, ['a', 'b'], { method: 'percent', percents: { a: 50.4, b: 50 } })
    expect(sum(r)).toBe(10000)
    expect(r).toEqual({ a: 5020, b: 4980 })
  })

  it('never emits a negative share for any accepted percent split', () => {
    // Sweep amounts and owner counts with the maximum accepted over-allocation
    // (one owner carrying the full +0.5 tolerance), which is the worst case for
    // driving a low-percent owner below zero.
    for (const amt of [1, 99, 100, 1000, 10001, 33333, 999999]) {
      for (const owners of [['a', 'b'], ['a', 'b', 'c'], ['a', 'b', 'c', 'd']]) {
        const each = 100 / owners.length
        const percents: Record<string, number> = {}
        owners.forEach((id, idx) => (percents[id] = idx === 0 ? each + 0.5 : each))
        const r = computeShares(amt, owners, { method: 'percent', percents })
        expect(sum(r)).toBe(amt)
        for (const id of owners) expect(r[id]).toBeGreaterThanOrEqual(0)
      }
    }
  })
})

describe('validateSplit', () => {
  it('even is always valid with ≥1 owner', () => {
    expect(validateSplit(100, ['a'], { method: 'even' })).toEqual({ ok: true })
  })
  it('no owners → no_owners', () => {
    expect(validateSplit(100, [], { method: 'even' })).toEqual({ ok: false, reason: 'no_owners' })
  })
  it('percent must total 100 within tolerance', () => {
    expect(validateSplit(100, ['a', 'b'], { method: 'percent', percents: { a: 50, b: 50 } })).toEqual({ ok: true })
    expect(validateSplit(100, ['a', 'b'], { method: 'percent', percents: { a: 50, b: 49 } })).toEqual({ ok: false, reason: 'percent_sum' })
    expect(validateSplit(100, ['a', 'b'], { method: 'percent', percents: { a: 50, b: 50.4 } })).toEqual({ ok: true }) // within ±0.5
  })
  it('value must total the amount exactly', () => {
    expect(validateSplit(10000, ['a', 'b'], { method: 'value', values: { a: 6000, b: 4000 } })).toEqual({ ok: true })
    expect(validateSplit(10000, ['a', 'b'], { method: 'value', values: { a: 6000, b: 3999 } })).toEqual({ ok: false, reason: 'value_sum' })
  })
})

describe('sharePercent', () => {
  it('derives a rounded display percentage', () => {
    expect(sharePercent(7000, 10000)).toBe(70)
    expect(sharePercent(3334, 10001)).toBe(33)
    expect(sharePercent(0, 0)).toBe(0)
  })
})
