// @vitest-environment jsdom
//
// Review 2026-08-24 (minor): the edge fades recomputed only on scroll and on
// container resizes — but the container's box is FIXED by the uniform 300px
// grid cell, so when only the CONTENT height changed (scope switch adding/
// removing rows) the fades went stale. The observer must watch the content
// too.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { WidgetScroll } from '@/components/widgets/WidgetScroll'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('WidgetScroll resize observation', () => {
  it('observes the content, not only the fixed-height container', () => {
    const observed: Element[] = []
    class RO {
      observe(el: Element) {
        observed.push(el)
      }
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal('ResizeObserver', RO)

    const { container } = render(
      <WidgetScroll>
        <div data-testid="content">rows</div>
      </WidgetScroll>
    )
    const scroller = container.querySelector('.no-scrollbar')!
    expect(observed).toContain(scroller)
    expect(observed).toContain(scroller.firstElementChild)
  })
})
