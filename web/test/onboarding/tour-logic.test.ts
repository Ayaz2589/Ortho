// spec 047 — the tour deck's pure edge cases. Extracted from the component precisely
// because this is where the mistakes live: the ends of the deck, and a swipe that is
// really a scroll. Node environment, no DOM.
import { describe, it, expect } from 'vitest'
import {
  SWIPE_THRESHOLD_PX,
  clampScreen,
  nextScreen,
  prevScreen,
  swipeIntent,
  formatPosition,
} from '@/lib/onboarding/tour'

const TOTAL = 5

describe('clampScreen', () => {
  it('leaves an in-range index alone', () => {
    for (let i = 0; i < TOTAL; i++) expect(clampScreen(i, TOTAL)).toBe(i)
  })

  it('pulls a negative index to the first screen', () => {
    expect(clampScreen(-1, TOTAL)).toBe(0)
    expect(clampScreen(-99, TOTAL)).toBe(0)
  })

  it('pulls an over-range index to the last screen', () => {
    expect(clampScreen(TOTAL, TOTAL)).toBe(TOTAL - 1)
    expect(clampScreen(99, TOTAL)).toBe(TOTAL - 1)
  })

  it('floors a fractional index rather than returning one', () => {
    // A fractional index would index past the array and render `undefined`.
    expect(clampScreen(2.7, TOTAL)).toBe(2)
    expect(Number.isInteger(clampScreen(2.7, TOTAL))).toBe(true)
  })

  it('resolves non-finite input to a valid screen instead of throwing', () => {
    // The spec's "direct entry" edge case: resolve to a valid position, never error.
    expect(clampScreen(Number.NaN, TOTAL)).toBe(0)
    expect(clampScreen(Number.POSITIVE_INFINITY, TOTAL)).toBe(TOTAL - 1)
    expect(clampScreen(Number.NEGATIVE_INFINITY, TOTAL)).toBe(0)
  })

  it('returns 0 for an empty or nonsensical total', () => {
    expect(clampScreen(3, 0)).toBe(0)
    expect(clampScreen(3, -2)).toBe(0)
  })
})

describe('nextScreen / prevScreen', () => {
  it('advances one screen at a time', () => {
    expect(nextScreen(0, TOTAL)).toBe(1)
    expect(nextScreen(3, TOTAL)).toBe(4)
  })

  it('goes back one screen at a time', () => {
    expect(prevScreen(4, TOTAL)).toBe(3)
    expect(prevScreen(1, TOTAL)).toBe(0)
  })

  it('saturates at the last screen rather than wrapping', () => {
    // Wrapping past the end would hide the finish action behind another lap.
    expect(nextScreen(TOTAL - 1, TOTAL)).toBe(TOTAL - 1)
  })

  it('saturates at the first screen rather than wrapping', () => {
    expect(prevScreen(0, TOTAL)).toBe(0)
  })
})

describe('swipeIntent', () => {
  it('reads a leftward swipe past the threshold as advancing', () => {
    expect(swipeIntent(-SWIPE_THRESHOLD_PX, 0)).toBe('next')
    expect(swipeIntent(-200, 10)).toBe('next')
  })

  it('reads a rightward swipe past the threshold as going back', () => {
    expect(swipeIntent(SWIPE_THRESHOLD_PX, 0)).toBe('prev')
    expect(swipeIntent(200, -10)).toBe('prev')
  })

  it('ignores a drag shorter than the threshold', () => {
    // A tap with a pixel of tremor must not page the deck.
    expect(swipeIntent(-(SWIPE_THRESHOLD_PX - 1), 0)).toBe('none')
    expect(swipeIntent(SWIPE_THRESHOLD_PX - 1, 0)).toBe('none')
    expect(swipeIntent(0, 0)).toBe('none')
  })

  it('ignores a vertically dominant diagonal, so page scrolling is never stolen', () => {
    // The standard failure of a naive swipe handler: a scroll that drifts sideways.
    expect(swipeIntent(-60, 120)).toBe('none')
    expect(swipeIntent(60, -120)).toBe('none')
  })

  it('acts on a horizontally dominant diagonal', () => {
    expect(swipeIntent(-120, 60)).toBe('next')
    expect(swipeIntent(120, 60)).toBe('prev')
  })

  it('treats equal horizontal and vertical travel as ambiguous, so nothing happens', () => {
    expect(swipeIntent(-80, 80)).toBe('none')
    expect(swipeIntent(80, 80)).toBe('none')
  })

  it('sets the threshold at the constitution touch-target floor', () => {
    // Not an invented constant: 44px is the minimum touch target Principle V requires.
    expect(SWIPE_THRESHOLD_PX).toBe(44)
  })
})

describe('formatPosition', () => {
  it('substitutes the positional placeholders the app catalogs use', () => {
    // Matches makeT() in lib/i18n/index.ts — {0}, {1}, not named keys.
    expect(formatPosition('{0} of {1}', 2, 5)).toBe('2 of 5')
  })

  it('substitutes into a translation with a different word order', () => {
    expect(formatPosition('{1} 中的 {0}', 3, 5)).toBe('5 中的 3')
  })

  it('substitutes every occurrence of a placeholder', () => {
    expect(formatPosition('{0}/{1} — {0}', 1, 5)).toBe('1/5 — 1')
  })

  it('leaves a template with no placeholders untouched', () => {
    expect(formatPosition('Step', 2, 5)).toBe('Step')
  })
})
