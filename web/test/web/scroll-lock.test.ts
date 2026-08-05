// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { scrollbarCompensation, lockScroll } from '@/lib/scrollLock'

// A modal locking the page scroller with `overflow: hidden` removes its scrollbar,
// which widens the content box and shifts centered content sideways. lockScroll
// measures the exact width removed and re-adds it as padding so nothing moves.

describe('scrollbarCompensation', () => {
  it('is the growth in client width when the scrollbar is removed', () => {
    expect(scrollbarCompensation(985, 1000)).toBe(15)
  })

  it('is zero when the width does not change (stable gutter / overlay scrollbar)', () => {
    expect(scrollbarCompensation(1000, 1000)).toBe(0)
  })

  it('never goes negative if the width somehow shrinks', () => {
    expect(scrollbarCompensation(1000, 985)).toBe(0)
  })
})

describe('lockScroll', () => {
  afterEach(() => {
    document.body.removeAttribute('style')
  })

  it('sets overflow hidden and restores the previous inline styles on unlock', () => {
    const el = document.createElement('div')
    el.style.overflow = 'auto'
    el.style.paddingRight = '20px'
    document.body.appendChild(el)

    const unlock = lockScroll(el)
    expect(el.style.overflow).toBe('hidden')

    unlock()
    expect(el.style.overflow).toBe('auto')
    expect(el.style.paddingRight).toBe('20px')

    el.remove()
  })

  it('stacks safely: restores only when every nested lock is released', () => {
    const el = document.createElement('div')
    el.style.overflow = 'auto'
    document.body.appendChild(el)

    const unlockA = lockScroll(el)
    const unlockB = lockScroll(el)
    expect(el.style.overflow).toBe('hidden')

    unlockB()
    expect(el.style.overflow).toBe('hidden') // still held by A
    unlockA()
    expect(el.style.overflow).toBe('auto') // now truly unlocked

    el.remove()
  })

  it('unlock is idempotent (a double release does not disturb a re-lock)', () => {
    const el = document.createElement('div')
    el.style.overflow = 'auto'
    document.body.appendChild(el)

    const unlock = lockScroll(el)
    unlock()
    unlock() // no-op
    const unlock2 = lockScroll(el)
    expect(el.style.overflow).toBe('hidden')
    unlock2()
    expect(el.style.overflow).toBe('auto')

    el.remove()
  })
})
