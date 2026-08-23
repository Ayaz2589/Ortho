// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { WidgetPanel } from '@/components/widgets/WidgetPanel'

// Spec 057, US1 / FR-009, FR-010, D3, D4: below the expanded breakpoint the
// panel fills the screen with no dimmed board behind it (the drawer's existing
// `fullBleedOnMobile`), and — since `Drawer` does NOT apply safe-area insets in
// that mode — the frame itself carries `var(--safe-top)` / `var(--safe-bottom)`
// padding so nothing sits under a notch or a home indicator.

vi.mock('@/lib/store', () => ({
  useApp: () => ({ t: (k: string) => k }),
}))

function stubExpanded(expanded: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('1024') ? expanded : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('WidgetPanel mobile presentation', () => {
  it('renders full-screen with no scrim below the expanded breakpoint', () => {
    stubExpanded(false)
    render(
      <WidgetPanel open title="Home equity" onClose={() => {}}>
        <div>content</div>
      </WidgetPanel>
    )
    expect(document.querySelector('.ow-drawer-scrim')).toBeNull()
  })

  it('applies safe-area padding to the frame in the full-screen presentation', () => {
    stubExpanded(false)
    render(
      <WidgetPanel open title="Home equity" onClose={() => {}}>
        <div>content</div>
      </WidgetPanel>
    )
    const frame = screen.getByTestId('panel-frame')
    expect(frame.style.paddingTop).toBe('var(--safe-top)')
    expect(frame.style.paddingBottom).toBe('var(--safe-bottom)')
  })

  it('renders the dimmed scrim on the expanded (desktop) presentation', () => {
    stubExpanded(true)
    render(
      <WidgetPanel open title="Home equity" onClose={() => {}}>
        <div>content</div>
      </WidgetPanel>
    )
    expect(document.querySelector('.ow-drawer-scrim')).not.toBeNull()
  })

  it('does not apply safe-area padding on the expanded (desktop) presentation', () => {
    stubExpanded(true)
    render(
      <WidgetPanel open title="Home equity" onClose={() => {}}>
        <div>content</div>
      </WidgetPanel>
    )
    const frame = screen.getByTestId('panel-frame')
    expect(frame.style.paddingTop).toBe('')
  })
})
