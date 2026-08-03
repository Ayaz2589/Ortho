// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { Widget } from '@/components/widgets/Widget'
import type { WidgetDefinition } from '@/lib/widgets/registry'

// Spec 034 + 037: the widget frame fills its (uniform-height) cell using the calm
// `.ow-card` vocabulary (no shadow), and the whole card is a click target that
// opens the widget's detail panel. FR-004, FR-010.

vi.mock('@/lib/store', () => ({
  useApp: () => ({ t: (k: string, ...a: unknown[]) => k.replace(/\{(\d+)\}/g, (_, i) => String(a[Number(i)] ?? '')) }),
}))

afterEach(cleanup)

const definition: WidgetDefinition = {
  id: 'demo',
  title: 'Demo widget',
  description: 'demo',
  defaultEnabled: true,
  Body: () => <div data-testid="demo-body">body</div>,
}

describe('Widget frame', () => {
  it('renders the title and the body', () => {
    render(<Widget definition={definition} onOpen={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Demo widget' })).toBeTruthy()
    expect(screen.getByTestId('demo-body')).toBeTruthy()
  })

  it('is a list item using the calm card class and a flex column (fills the cell)', () => {
    render(<Widget definition={definition} onOpen={() => {}} />)
    const item = screen.getByRole('listitem')
    expect(item.className).toContain('ow-card')
    expect(item.className).toContain('flex-col')
    // Named by its heading, not a duplicated aria-label region.
    expect(item.getAttribute('aria-label')).toBeNull()
  })

  it('is a click target that opens the widget with its definition', () => {
    const onOpen = vi.fn()
    render(<Widget definition={definition} onOpen={onOpen} />)
    const opener = screen.getByRole('button', { name: 'Open Demo widget' })
    fireEvent.click(opener)
    expect(onOpen).toHaveBeenCalledWith(definition)
  })
})
