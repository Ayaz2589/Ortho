// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { DashboardScopeProvider } from '@/lib/widgets/DashboardScopeContext'

// Spec 057, US1 / FR-001..FR-003 / FR-006: a widget declares an optional `Panel`
// alongside its `Body`. Present → the panel renders inside the shared drawer.
// Absent → the existing spec-037 placeholder, unchanged. A navigation-shortcut
// widget (`href` set) never opens a panel at all — it still routes (FR-006).

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string, ...a: unknown[]) => k.replace(/\{(\d+)\}/g, (_, i) => String(a[Number(i)] ?? '')),
    transactions: [],
    locale: 'en-US',
  }),
}))

function SentinelPanel() {
  return <div data-testid="sentinel-panel">Sentinel panel content</div>
}

vi.mock('@/lib/widgets/registry', () => ({
  WIDGETS: [
    {
      id: 'panel-widget',
      title: 'Panel Widget',
      description: 'Has a registered panel.',
      defaultEnabled: true,
      Body: () => null,
      Panel: SentinelPanel,
    },
    {
      id: 'no-panel-widget',
      title: 'No Panel Widget',
      description: 'Declares no panel.',
      defaultEnabled: true,
      Body: () => null,
    },
    {
      id: 'nav-widget',
      title: 'Nav Widget',
      description: 'A navigation shortcut.',
      defaultEnabled: true,
      Body: () => null,
      href: '/settings/nav-widget',
      Panel: SentinelPanel,
    },
  ],
  getWidget: () => undefined,
}))

async function renderBoard() {
  const { WidgetBoard } = await import('@/components/widgets/WidgetBoard')
  return render(
    <DashboardScopeProvider>
      <WidgetBoard />
    </DashboardScopeProvider>
  )
}

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('widget panel registration', () => {
  it('renders the registered panel inside the drawer instead of the placeholder', async () => {
    await renderBoard()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Panel Widget' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Open Panel Widget' }))
    expect(screen.getByTestId('sentinel-panel')).toBeTruthy()
    expect(screen.queryByText('Details coming soon.')).toBeNull()
  })

  it('falls back to the placeholder when no panel is registered', async () => {
    await renderBoard()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open No Panel Widget' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Open No Panel Widget' }))
    expect(screen.getByText('Details coming soon.')).toBeTruthy()
    expect(screen.queryByTestId('sentinel-panel')).toBeNull()
  })

  it('never opens a panel for a navigation-shortcut widget — it still routes', async () => {
    await renderBoard()
    await waitFor(() => expect(screen.getByRole('link', { name: 'Open Nav Widget' })).toBeTruthy())
    const link = screen.getByRole('link', { name: 'Open Nav Widget' })
    expect(link.getAttribute('href')).toBe('/settings/nav-widget')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
