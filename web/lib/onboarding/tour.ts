/**
 * spec 047 — the learn-more tour's pure deck logic.
 *
 * Split out of TourDeck.tsx deliberately. The component's own behavior is thin
 * (render a screen, wire four buttons); the parts with real edge cases are the ENDS of
 * the deck and the question "was that a swipe or a scroll?". Constitution VI wants
 * those pinned by fast, deterministic tests rather than exercised only through a DOM.
 *
 * No React, no DOM, no storage, no clock.
 */

/**
 * How far a touch must travel horizontally before it counts as a swipe.
 *
 * 44px is not an invented constant: it is the touch-target floor Principle V already
 * requires, so a gesture shorter than the smallest thing you could tap is treated as a
 * tap with tremor, not a page turn.
 */
export const SWIPE_THRESHOLD_PX = 44

/**
 * Any number → a valid screen index in [0, total-1].
 *
 * Total, because the spec's edge cases ("direct entry to a middle screen", "an
 * unrecognized value") all say the same thing: resolve to a valid position rather than
 * erroring. Fractions are floored — a fractional index would read past the array and
 * render `undefined` — and a non-positive total collapses to 0 so an empty deck cannot
 * produce -1.
 */
export function clampScreen(index: number, total: number): number {
  if (!(total > 0)) return 0
  // NaN fails every comparison, so it must be caught before the min/max below.
  if (Number.isNaN(index)) return 0
  if (index <= 0) return 0
  if (index >= total - 1) return total - 1
  return Math.floor(index)
}

/** One screen forward, saturating at the last. */
export function nextScreen(index: number, total: number): number {
  // Saturating rather than wrapping: a carousel would carry someone past the finish
  // action and around for another lap, hiding the way out.
  return clampScreen(index + 1, total)
}

/** One screen back, saturating at the first. */
export function prevScreen(index: number, total: number): number {
  return clampScreen(index - 1, total)
}

/**
 * What a completed touch gesture meant. `dx`/`dy` are end-minus-start, so a leftward
 * drag (finger right→left, revealing the next screen) is negative `dx`.
 *
 * The `|dx| > |dy|` guard is the important half: without it, a vertical scroll that
 * drifts a few degrees sideways steals the page and the tour feels broken. Equal travel
 * is ambiguous and therefore does nothing.
 */
export function swipeIntent(dx: number, dy: number): 'next' | 'prev' | 'none' {
  const horizontal = Math.abs(dx)
  if (horizontal < SWIPE_THRESHOLD_PX) return 'none'
  if (horizontal <= Math.abs(dy)) return 'none'
  return dx < 0 ? 'next' : 'prev'
}

/**
 * Fill a position template — `{0}` current (1-based), `{1}` total.
 *
 * Positional placeholders, matching `makeT()` in lib/i18n/index.ts, so translators meet
 * one convention across the whole product. Positional also survives the word-order
 * changes that named keys would tempt a translator to "fix" (Japanese and Chinese put
 * the total first).
 */
export function formatPosition(template: string, current: number, total: number): string {
  return template.replace(/\{(\d+)\}/g, (match, index) => {
    if (index === '0') return String(current)
    if (index === '1') return String(total)
    return match
  })
}
