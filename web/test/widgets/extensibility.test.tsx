// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'

// Spec 034, FR-008 / SC-005: adding ONE registry entry surfaces the widget in both
// the board and the Settings list with no changes to those components. We prove it
// by mocking the registry with a sentinel widget and asserting it appears in both
// surfaces — i.e. both are pure maps over the registry, not hardcoded card lists.

vi.mock('@/lib/store', () => ({ useApp: () => ({ t: (k: string) => k }) }))

vi.mock('@/lib/widgets/registry', () => ({
  WIDGET_SIZES: ['sm', 'md', 'lg', 'wide'],
  WIDGETS: [
    {
      id: 'sentinel-widget',
      title: 'Sentinel Widget',
      description: 'A widget added purely by declaring a registry entry.',
      size: 'sm',
      defaultEnabled: true,
      Body: () => null,
    },
  ],
  getWidget: (id: string) => (id === 'sentinel-widget' ? { id } : undefined),
}))

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('registry-driven surfaces', () => {
  it('a newly declared widget appears on the board', async () => {
    const { WidgetBoard } = await import('@/components/widgets/WidgetBoard')
    render(<WidgetBoard />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Sentinel Widget' })).toBeTruthy()
    })
  })

  it('a newly declared widget appears in the Settings list', async () => {
    const Page = (await import('@/app/(app)/settings/widgets/page')).default
    render(<Page />)
    expect(screen.getByRole('switch', { name: /Sentinel Widget/ })).toBeTruthy()
  })
})
