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

  it('is a labelled region carrying the size-span class and the calm card class', () => {
    const { container } = render(<Widget definition={definition} />)
    const section = container.querySelector('section')!
    expect(section.getAttribute('aria-label')).toBe('Demo widget')
    expect(section.className).toContain('ow-w-md')
    expect(section.className).toContain('ow-card')
    // Fills the cell: full height + a flex column so the body can grow.
    expect(section.className).toContain('h-full')
    expect(section.className).toContain('flex-col')
  })

  it('applies the correct span class per size', () => {
    const sizes = [
      ['sm', 'ow-w-sm'],
      ['lg', 'ow-w-lg'],
      ['wide', 'ow-w-wide'],
    ] as const
    for (const [size, cls] of sizes) {
      cleanup()
      const { container } = render(<Widget definition={{ ...definition, size }} />)
      expect(container.querySelector('section')!.className).toContain(cls)
    }
  })
})
