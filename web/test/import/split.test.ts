import { describe, it, expect } from 'vitest'
import { evenSplit, validateCustomSplit } from '../../scripts/import/engine/split'

describe('evenSplit', () => {
  it('splits evenly between two owners (web parity)', () => {
    expect(evenSplit(['a', 'b'])).toEqual({ a: 50, b: 50 })
  })

  it('mirrors the apps rounding for three owners', () => {
    const three = evenSplit(['a', 'b', 'c'])
    expect(three.a).toBeCloseTo(33.333, 2)
    expect(three.b).toBeCloseTo(33.333, 2)
    expect(three.c).toBeCloseTo(33.333, 2)
  })
})

describe('validateCustomSplit', () => {
  it('accepts percentages that total 100', () => {
    expect(validateCustomSplit({ a: 70, b: 30 }, ['a', 'b'])).toEqual({ ok: true })
    expect(validateCustomSplit({ a: 33.33, b: 33.33, c: 33.34 }, ['a', 'b', 'c'])).toEqual({ ok: true })
  })

  it('rejects totals that are not 100', () => {
    expect(validateCustomSplit({ a: 70, b: 20 }, ['a', 'b']).ok).toBe(false)
  })

  it('rejects when the owners are not exactly covered', () => {
    expect(validateCustomSplit({ a: 100 }, ['a', 'b']).ok).toBe(false)
    expect(validateCustomSplit({ a: 50, b: 50, c: 0 }, ['a', 'b']).ok).toBe(false)
  })

  it('rejects negative percentages', () => {
    expect(validateCustomSplit({ a: 120, b: -20 }, ['a', 'b']).ok).toBe(false)
  })
})
