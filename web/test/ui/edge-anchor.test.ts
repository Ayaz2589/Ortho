import { describe, it, expect } from 'vitest'
import { edgeAnchoredShiftPct, edgeAnchoredTransform } from '@/lib/ui/edgeAnchor'

// Spec 058 — no horizontal scrolling anywhere on mobile.
//
// Root-cause class this pins: a marker positioned along a track with
// `left: <pct>%` + `transform: translateX(-50%)` is centred on its point, so at
// pct=0 half of it hangs off the LEFT edge of the track and at pct=100 half
// hangs off the RIGHT edge. Inside a widget detail panel — whose scroll region
// also resolves `overflow-x` to `auto` — that overhang is precisely what makes
// the panel pan sideways on a phone.
//
// Fix: anchor the marker to the track rather than centring it blindly. Shift it
// by -pct% of its OWN width, so it reads flush-left at 0, centred at 50 and
// flush-right at 100, and never crosses either edge at any point between.

describe('edgeAnchoredShiftPct', () => {
  it('leaves a marker at the start of the track flush with the left edge', () => {
    expect(edgeAnchoredShiftPct(0)).toBe(0)
  })

  it('centres a marker at the middle of the track', () => {
    expect(edgeAnchoredShiftPct(50)).toBe(-50)
  })

  it('pulls a marker at the end of the track flush with the right edge', () => {
    expect(edgeAnchoredShiftPct(100)).toBe(-100)
  })

  it('shifts proportionally in between', () => {
    expect(edgeAnchoredShiftPct(25)).toBe(-25)
    expect(edgeAnchoredShiftPct(80)).toBe(-80)
  })

  it('clamps a position outside the track back onto it', () => {
    expect(edgeAnchoredShiftPct(-30)).toBe(0)
    expect(edgeAnchoredShiftPct(140)).toBe(-100)
  })

  it('falls back to centred for a non-finite position', () => {
    expect(edgeAnchoredShiftPct(Number.NaN)).toBe(-50)
  })

  // The load-bearing invariant. For a marker of width w placed at pct along a
  // track of width W, its left edge sits at (pct/100)*W + (shift/100)*w. This
  // must stay within [0, W - w] for EVERY width and EVERY position — that is
  // what guarantees no marker can ever widen its panel and force a sideways pan.
  it('keeps a marker fully inside the track for any marker width and position', () => {
    const TRACK = 320
    for (const w of [9, 12, 24, 60, 120, 320]) {
      for (let pct = 0; pct <= 100; pct += 1) {
        const shift = edgeAnchoredShiftPct(pct)
        const left = (pct / 100) * TRACK + (shift / 100) * w
        expect(left).toBeGreaterThanOrEqual(-1e-9)
        expect(left + w).toBeLessThanOrEqual(TRACK + 1e-9)
      }
    }
  })

  it('is monotonic — a later position never shifts less than an earlier one', () => {
    let prev = Number.POSITIVE_INFINITY
    for (let pct = 0; pct <= 100; pct += 1) {
      const shift = edgeAnchoredShiftPct(pct)
      expect(shift).toBeLessThanOrEqual(prev)
      prev = shift
    }
  })
})

describe('edgeAnchoredTransform', () => {
  it('renders the shift as a CSS translateX the components can drop straight in', () => {
    expect(edgeAnchoredTransform(0)).toBe('translateX(0%)')
    expect(edgeAnchoredTransform(50)).toBe('translateX(-50%)')
    expect(edgeAnchoredTransform(100)).toBe('translateX(-100%)')
  })

  it('rounds to a sane precision rather than emitting float noise', () => {
    expect(edgeAnchoredTransform(100 / 3)).toBe('translateX(-33.33%)')
  })
})
