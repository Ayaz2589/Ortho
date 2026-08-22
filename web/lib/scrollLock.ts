/**
 * Body/scroll-container lock that does NOT shift the page.
 *
 * When a modal or drawer opens, we stop the background from scrolling by setting
 * `overflow: hidden` on whichever element scrolls (the app's `<main>`). But that
 * removes the element's vertical scrollbar, which — with classic (non-overlay)
 * scrollbars and no reserved gutter — widens its content box, so centered content
 * visibly jumps sideways when the panel opens. (`scrollbar-gutter: stable` fixes
 * this only where it's honored: not older Safari, and only at the widths where the
 * class is applied.)
 *
 * `lockScroll` sidesteps all of that by measuring the exact width the scrollbar
 * frees and re-adding it as right padding, so the content box keeps its size no
 * matter the browser. It's self-correcting: where the gutter is already stable (or
 * scrollbars are overlay), the measured growth is 0 and nothing is padded.
 */

/** Width (px) freed when `overflow: hidden` removes a scrollbar — the growth in the
 *  element's client width, clamped at 0. Pure given the before/after measurements. */
export function scrollbarCompensation(clientWidthBefore: number, clientWidthAfter: number): number {
  return Math.max(0, clientWidthAfter - clientWidthBefore)
}

interface LockState {
  count: number
  prevOverflow: string
  prevPaddingRight: string
}

// Ref-counted per element so nested/stacked locks (two drawers open on the same
// `<main>`) are safe: only the FIRST lock captures the truly-unlocked inline
// styles and applies the compensation, and only the LAST unlock restores them —
// intermediate locks can't record each other's locked state as "previous".
const locks = new WeakMap<HTMLElement, LockState>()

/**
 * Lock scrolling on `el` with `overflow: hidden`, compensating for the removed
 * scrollbar so nothing shifts. Returns an idempotent unlock function that restores
 * the exact inline `overflow`/`paddingRight` that were there before the first lock
 * (so class-provided padding is untouched).
 */
export function lockScroll(el: HTMLElement): () => void {
  const existing = locks.get(el)
  if (existing) {
    existing.count++
  } else {
    const prevOverflow = el.style.overflow
    const prevPaddingRight = el.style.paddingRight

    const before = el.clientWidth
    el.style.overflow = 'hidden'
    const removed = scrollbarCompensation(before, el.clientWidth)
    if (removed > 0) {
      const basePadding = parseFloat(getComputedStyle(el).paddingRight) || 0
      el.style.paddingRight = `${basePadding + removed}px`
    }

    locks.set(el, { count: 1, prevOverflow, prevPaddingRight })
  }

  let released = false
  return () => {
    if (released) return
    released = true
    const state = locks.get(el)
    if (!state) return
    state.count--
    if (state.count <= 0) {
      el.style.overflow = state.prevOverflow
      el.style.paddingRight = state.prevPaddingRight
      locks.delete(el)
    }
  }
}
