import { describe, expect, it } from 'vitest'
import { toCents, centsFromDollars, isCents, assertCents, type Cents } from '@/lib/finance/cents'

// spec 025 — US2: a branded Cents type that expresses the USD-cents storage
// invariant. Written test-first. Runtime behavior is checked here; the
// compile-time properties (branding, assignability) are enforced by
// `tsc --noEmit` on the type-level assertions at the bottom of this file.

describe('toCents', () => {
  it('accepts a whole-cent integer and returns it unchanged', () => {
    expect(toCents(1299)).toBe(1299)
    expect(toCents(0)).toBe(0)
    expect(toCents(-500)).toBe(-500)
  })
  it('rejects non-integers', () => {
    expect(() => toCents(12.5)).toThrow()
  })
  it('rejects NaN and Infinity', () => {
    expect(() => toCents(NaN)).toThrow()
    expect(() => toCents(Infinity)).toThrow()
    expect(() => toCents(-Infinity)).toThrow()
  })
})

describe('centsFromDollars', () => {
  it('converts dollars to whole cents, half away from zero', () => {
    expect(centsFromDollars(12.99)).toBe(1299)
    expect(centsFromDollars(0)).toBe(0)
    expect(centsFromDollars(-4.2)).toBe(-420)
  })
  it('rounds a sub-cent value away from zero', () => {
    // 0.005 → 0.5¢ → rounds away from zero to 1¢; −0.005 → −1¢.
    expect(centsFromDollars(0.005)).toBe(1)
    expect(centsFromDollars(-0.005)).toBe(-1)
  })
  it('always yields an integer', () => {
    for (const d of [1.1, 2.675, 99.999, 100.004]) {
      expect(Number.isInteger(centsFromDollars(d))).toBe(true)
    }
  })
  it('rejects a non-finite dollars input (honors the constructor contract)', () => {
    // A bare `as Cents` cast would mint NaN/Infinity as a "valid" Cents; the
    // constructor must reject them like toCents/assertCents do.
    expect(() => centsFromDollars(NaN)).toThrow()
    expect(() => centsFromDollars(Infinity)).toThrow()
    expect(() => centsFromDollars(-Infinity)).toThrow()
  })
})

describe('isCents / assertCents', () => {
  it('isCents is true only for finite integers', () => {
    expect(isCents(100)).toBe(true)
    expect(isCents(0)).toBe(true)
    expect(isCents(1.5)).toBe(false)
    expect(isCents(NaN)).toBe(false)
    expect(isCents(Infinity)).toBe(false)
  })
  it('assertCents throws on a non-integer and passes an integer through', () => {
    expect(() => assertCents(3.14)).toThrow()
    expect(assertCents(42)).toBe(42)
  })
})

// ── Type-level assertions (checked by tsc --noEmit, not by Vitest) ────────────
it('type-level: Cents is assignable to number; plain number is not a Cents', () => {
  const c: Cents = toCents(100)
  const asNumber: number = c // Cents MUST be assignable to number (no ripple)
  expect(asNumber).toBe(100)

  // @ts-expect-error a plain number is not assignable to Cents without a constructor
  const bad: Cents = 100
  void bad
})
