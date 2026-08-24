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

  // ── Review 2026-08-24, C3: the second level is a STACK, not a single slot ──
  // SavingsTrendsPanel pushes from inside a pushed detail (Every month → a
  // month's transactions); the old single-slot state made Back/Escape from the
  // third level jump straight to the top, silently skipping the level the user
  // navigated through.

  function ThreeLevelPanel() {
    const { push, pop } = usePanelDetail()
    const pushLevelTwo = () =>
      push(
        'Level two',
        <NestedLevel />
      )
    function NestedLevel() {
      return (
        <div>
          <div data-testid="level-two">level two</div>
          <button onClick={() => push('Level three', <div data-testid="level-three">level three</div>)}>
            Deeper
          </button>
        </div>
      )
    }
    return (
      <div>
        <div data-testid="level-one">level one</div>
        <button onClick={pushLevelTwo}>Open level two</button>
        <button onClick={pop}>noop pop</button>
      </div>
    )
  }

  it('a nested push unwinds one level at a time — Back never skips a level', () => {
    const onClose = vi.fn()
    render(
      <WidgetPanel open title="Savings" onClose={onClose}>
        <ThreeLevelPanel />
      </WidgetPanel>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open level two' }))
    fireEvent.click(screen.getByRole('button', { name: 'Deeper' }))
    expect(screen.getByTestId('level-three')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Level three' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByTestId('level-two')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Level two' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByTestId('level-one')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Escape unwinds the stack one level at a time before closing', () => {
    const onClose = vi.fn()
    render(
      <WidgetPanel open title="Savings" onClose={onClose}>
        <ThreeLevelPanel />
      </WidgetPanel>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open level two' }))
    fireEvent.click(screen.getByRole('button', { name: 'Deeper' }))

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByTestId('level-two')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByTestId('level-one')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // Review 2026-08-24 (minor): pushing unmounts the focused row button, which
  // dropped keyboard focus to <body> — the trap only recaptures on open. The
  // frame must recapture focus on every push/pop.
  it('keyboard focus stays inside the panel across push/pop', () => {
    render(
      <WidgetPanel open title="Savings" onClose={() => {}}>
        <ThreeLevelPanel />
      </WidgetPanel>
    )
    const opener = screen.getByRole('button', { name: 'Open level two' })
    opener.focus()
    fireEvent.click(opener)
    expect(document.activeElement).not.toBe(document.body)
    expect(screen.getByTestId('panel-frame').contains(document.activeElement)).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(document.activeElement).not.toBe(document.body)
    expect(screen.getByTestId('panel-frame').contains(document.activeElement)).toBe(true)
  })

  // Review 2026-08-24 (minor): the shared scroll region kept its scrollTop
  // across level swaps, so a pushed detail could open mid-scroll.
  it('the scroll region resets to the top when a level is pushed', () => {
    render(
      <WidgetPanel open title="Savings" onClose={() => {}}>
        <ThreeLevelPanel />
      </WidgetPanel>
    )
    const region = screen.getByTestId('panel-scroll-region')
    Object.defineProperty(region, 'scrollTop', { value: 420, writable: true })
    fireEvent.click(screen.getByRole('button', { name: 'Open level two' }))
    expect(region.scrollTop).toBe(0)
  })
})
