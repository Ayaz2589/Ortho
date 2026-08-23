// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { WidgetPanel, usePanelRouteOut } from '@/components/widgets/WidgetPanel'

// Spec 057, US1 / FR-004: the shared frame every panel renders inside — the
// widget's title as a real heading, a close control, a bounded scrolling
// content region, and a route-out footer only when a panel supplies one.

vi.mock('@/lib/store', () => ({
  useApp: () => ({ t: (k: string) => k }),
}))

afterEach(cleanup)

describe('WidgetPanel frame', () => {
  it('renders the title as a real heading and a close control', () => {
    const onClose = vi.fn()
    render(
      <WidgetPanel open title="Home equity" onClose={onClose}>
        <div>content</div>
      </WidgetPanel>
    )
    expect(screen.getByRole('heading', { name: 'Home equity' })).toBeTruthy()
    const closeBtn = screen.getByRole('button', { name: 'Close' })
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders a bounded scrolling content region containing the panel body', () => {
    render(
      <WidgetPanel open title="Home equity" onClose={() => {}}>
        <div data-testid="panel-body">body</div>
      </WidgetPanel>
    )
    const body = screen.getByTestId('panel-body')
    const region = screen.getByTestId('panel-scroll-region')
    expect(region.contains(body)).toBe(true)
  })

  it('renders no route-out footer when the panel supplies no destination', () => {
    render(
      <WidgetPanel open title="Home equity" onClose={() => {}}>
        <div>content</div>
      </WidgetPanel>
    )
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('renders a route-out footer when the panel supplies a destination', () => {
    function PanelWithRouteOut() {
      usePanelRouteOut({ label: 'See all transactions', href: '/transactions' })
      return <div>content</div>
    }
    render(
      <WidgetPanel open title="Recent activity" onClose={() => {}}>
        <PanelWithRouteOut />
      </WidgetPanel>
    )
    const link = screen.getByRole('link', { name: 'See all transactions' })
    expect(link.getAttribute('href')).toBe('/transactions')
  })
})
