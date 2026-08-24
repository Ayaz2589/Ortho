import { describe, it, expect } from 'vitest'
import { rebalancePercents } from '@/lib/splitFields'

// Review 2026-08-24 (minor): rebalancePercents made the LAST other-owner
// absorb the 2dp rounding error with no floor at 0, so combined round-ups of
// earlier owners could push it negative — the percent input blocks typing '-',
// but the app itself wrote a negative percentage, which computeShares turned
// into a negative stored share. The absorber must clamp at 0 with the deficit
// reclaimed from the rounded-up owners.

describe('rebalancePercents clamps the absorbing owner at 0', () => {
  it('never emits a negative percentage (five-owner round-up case)', () => {
    // Editing a to 99.98 leaves 0.02 for four owners weighted 26/26/26/22: each of the first three raw
    // shares round UP to 0.01 (0.03 total), and the
    // absorber used to take 0.02 − 0.03 = −0.01.
    const owners = ['a', 'b', 'c', 'd', 'e']
    const next = rebalancePercents({ a: '20', b: '26', c: '26', d: '26', e: '22' }, 'a', '99.98', owners)
    for (const id of owners) {
      expect(parseFloat(next[id]), `owner ${id}`).toBeGreaterThanOrEqual(0)
    }
  })

  it('the total still adds to 100 within a cent of a percent', () => {
    const owners = ['a', 'b', 'c', 'd', 'e']
    const next = rebalancePercents({ a: '20', b: '26', c: '26', d: '26', e: '22' }, 'a', '99.98', owners)
    const total = owners.reduce((s, id) => s + parseFloat(next[id]), 0)
    expect(Math.abs(total - 100)).toBeLessThan(0.02)
  })
})
