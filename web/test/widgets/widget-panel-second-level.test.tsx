// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { WidgetPanel, usePanelDetail } from '@/components/widgets/WidgetPanel'

// Spec 057, US1 / FR-005, D6: an optional second level within the panel — a
// pushed detail view swaps the header's close control for "back"; back returns
// to the panel's first level rather than closing the panel outright; Escape
// steps back once, and only a second Escape closes the whole panel.

vi.mock('@/lib/store', () => ({
  useApp: () => ({ t: (k: string) => k }),
}))

afterEach(cleanup)

function MasterDetailPanel() {
  const { push, pop } = usePanelDetail()
  return (
    <div>
      <div data-testid="list-view">list view</div>
      <button onClick={() => push('Mortgage 1', <div data-testid="detail-view">detail view</div>)}>
        View mortgage 1
      </button>
      <button onClick={pop}>pop from content</button>
    </div>
  )
}

describe('WidgetPanel second level', () => {
  it('pushing a detail swaps close for back and shows the detail content', () => {
    render(
      <WidgetPanel open title="Home equity" onClose={() => {}}>
        <MasterDetailPanel />
      </WidgetPanel>
    )
    expect(screen.getByTestId('list-view')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'View mortgage 1' }))

    expect(screen.getByTestId('detail-view')).toBeTruthy()
    expect(screen.queryByTestId('list-view')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Mortgage 1' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })

  it('back returns to level one rather than closing the panel', () => {
    const onClose = vi.fn()
    render(
      <WidgetPanel open title="Home equity" onClose={onClose}>
        <MasterDetailPanel />
      </WidgetPanel>
    )
    fireEvent.click(screen.getByRole('button', { name: 'View mortgage 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))

    expect(screen.getByTestId('list-view')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Home equity' })).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Escape steps back once, and only then closes the panel', () => {
    const onClose = vi.fn()
    render(
      <WidgetPanel open title="Home equity" onClose={onClose}>
        <MasterDetailPanel />
      </WidgetPanel>
    )
    fireEvent.click(screen.getByRole('button', { name: 'View mortgage 1' }))

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByTestId('list-view')).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
