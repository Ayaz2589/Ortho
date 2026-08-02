// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Widget } from '@/components/widgets/Widget'
import type { WidgetDefinition } from '@/lib/widgets/registry'

// Spec 034: the widget frame fills its cell (no blank band, no collapse) and uses
// the calm `.ow-card` vocabulary (no shadow). FR-004, FR-010.

vi.mock('@/lib/store', () => ({ useApp: () => ({ t: (k: string) => k }) }))

afterEach(cleanup)

const definition: WidgetDefinition = {
  id: 'demo',
  title: 'Demo widget',
  description: 'demo',
  size: 'md',
  defaultEnabled: true,
  Body: () => <div data-testid="demo-body">body</div>,
}

describe('Widget frame', () => {
  it('renders the title and the body', () => {
    render(<Widget definition={definition} />)
    expect(screen.getByRole('heading', { name: 'Demo widget' })).toBeTruthy()
    expect(screen.getByTestId('demo-body')).toBeTruthy()
  })

  it('is a list item carrying the size class and the calm card class', () => {
    render(<Widget definition={definition} />)
    const item = screen.getByRole('listitem')
    expect(item.className).toContain('ow-w-md')
    expect(item.className).toContain('ow-card')
    // Fills its tier: a flex column so the body can grow to the card height.
    expect(item.className).toContain('flex-col')
    // Named by its heading, not a duplicated aria-label region.
    expect(item.getAttribute('aria-label')).toBeNull()
  })

  it('applies the correct size class per size', () => {
    const sizes = [
      ['sm', 'ow-w-sm'],
      ['lg', 'ow-w-lg'],
      ['wide', 'ow-w-wide'],
    ] as const
    for (const [size, cls] of sizes) {
      cleanup()
      render(<Widget definition={{ ...definition, size }} />)
      expect(screen.getByRole('listitem').className).toContain(cls)
    }
  })
})
