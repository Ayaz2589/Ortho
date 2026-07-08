// US3 — editing a property must never truncate the stored mortgage rate (spec 019).
import { describe, it, expect } from 'vitest'
import { rateToInput, parseRate } from '@/components/housing/rate'

describe('mortgage-rate edit round-trip (contract C5)', () => {
  it('preserves full stored precision on a no-op edit (no 2-decimal truncation)', () => {
    // numeric(7,4) values: loading then saving unchanged must return the same value.
    for (const r of [6.375, 6.125, 6.876, 6.5, 6, 7.0001, 3.3333, 0]) {
      expect(parseRate(rateToInput(r))).toBe(r)
    }
  })

  it('renders the exact stored value, unlike the old toFixed(2)', () => {
    expect(rateToInput(6.375)).toBe('6.375')
    expect(rateToInput(6.125)).toBe('6.125')
    // Documents the bug being fixed: the old load path truncated here.
    expect((6.375).toFixed(2)).toBe('6.38')
  })
})
