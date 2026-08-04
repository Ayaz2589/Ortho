import { describe, it, expect } from 'vitest'
import { scrollFadeState } from '@/lib/dashboard/scrollFade'

// Spec (dashboard polish): a scroll container fades its content at the edges only
// where there is more to scroll — so an overflowed widget never hard-cuts a row,
// and a non-overflowing widget shows no fade at all. Pure geometry; the component
// just feeds it live scrollTop/clientHeight/scrollHeight.

describe('scrollFadeState', () => {
  it('shows no fade when the content fits (no overflow)', () => {
    expect(scrollFadeState({ scrollTop: 0, clientHeight: 100, scrollHeight: 100 })).toEqual({
      top: false,
      bottom: false,
    })
  })

  it('fades only the bottom at the top of an overflowing container', () => {
    expect(scrollFadeState({ scrollTop: 0, clientHeight: 100, scrollHeight: 300 })).toEqual({
      top: false,
      bottom: true,
    })
  })

  it('fades both edges when scrolled into the middle', () => {
    expect(scrollFadeState({ scrollTop: 100, clientHeight: 100, scrollHeight: 300 })).toEqual({
      top: true,
      bottom: true,
    })
  })

  it('fades only the top when scrolled to the very bottom', () => {
    expect(scrollFadeState({ scrollTop: 200, clientHeight: 100, scrollHeight: 300 })).toEqual({
      top: true,
      bottom: false,
    })
  })

  it('treats sub-pixel remainders as fully scrolled (no phantom fade)', () => {
    // scrollTop can settle a fraction short of the max after a wheel gesture.
    expect(scrollFadeState({ scrollTop: 199.6, clientHeight: 100, scrollHeight: 300 })).toEqual({
      top: true,
      bottom: false,
    })
  })
})
