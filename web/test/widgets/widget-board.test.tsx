// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { WidgetBoard } from '@/components/widgets/WidgetBoard'
import { DashboardScopeProvider } from '@/lib/widgets/DashboardScopeContext'
import { WIDGETS } from '@/lib/widgets/registry'
import { WIDGETS_STORAGE_KEY } from '@/lib/widgets/preferences'

// Spec 034: the board renders exactly the enabled widgets (registry order), packs
// them with no empty cell, and shows a calm empty state when none are enabled.
// FR-003, FR-009. The board is a pure function of the registry + prefs (FR-008).

// The widget bodies are now data-wired (spec 036–041): they read useApp() for data
// and the shared scope through useDashboardScopeContext(). Supply the full data
// surface (empty collections → calm empty states) and render inside the provider,
// exactly as the real overview does. This suite is about the board chrome (which
// widgets render, in what order), not any body's content.
vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string, ...a: unknown[]) => k.replace(/\{(\d+)\}/g, (_, i) => String(a[Number(i)] ?? '')),
    locale: 'en-US',
    formatMoney: (c: number) => `$${c}`,
    transactions: [],
    budgets: [],
    goals: [],
    goalContributions: [],
    ownersDisplay: () => ({ avatarUser: {}, label: '—', count: 0 }),
  }),
}))

function renderBoard() {
  return render(
    <DashboardScopeProvider>
      <WidgetBoard />
    </DashboardScopeProvider>
  )
}

beforeEach(() => localStorage.clear())
afterEach(cleanup)

const defaultEnabledTitles = WIDGETS.filter((w) => w.defaultEnabled).map((w) => w.title)
const defaultDisabled = WIDGETS.find((w) => !w.defaultEnabled)

describe('WidgetBoard', () => {
  it('renders exactly the default-enabled widgets by default', async () => {
    renderBoard()
    await waitFor(() => {
      expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(defaultEnabledTitles.length)
    })
    for (const title of defaultEnabledTitles) {
      expect(screen.getByRole('heading', { level: 2, name: title })).toBeTruthy()
    }
    // A default-disabled widget is absent until turned on.
    if (defaultDisabled) {
      expect(screen.queryByRole('heading', { level: 2, name: defaultDisabled.title })).toBeNull()
    }
  })

  it('renders the widgets as a labelled list', async () => {
    renderBoard()
    await waitFor(() => {
      expect(screen.getByRole('list', { name: 'Dashboard widgets' })).toBeTruthy()
    })
    // Each enabled widget is a list item (no nested landmark region).
    expect(screen.getAllByRole('listitem').length).toBe(defaultEnabledTitles.length)
  })

  it('shows a calm empty state and no widgets when everything is disabled', async () => {
    const allOff = Object.fromEntries(WIDGETS.map((w) => [w.id, false]))
    localStorage.setItem(WIDGETS_STORAGE_KEY, JSON.stringify(allOff))
    renderBoard()
    await waitFor(() => {
      expect(screen.getByText('Your dashboard is empty')).toBeTruthy()
    })
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0)
    // Points back to the settings screen — a real link, never a dead end.
    const link = screen.getByRole('link', { name: 'Choose widgets' })
    expect(link.getAttribute('href')).toBe('/settings/widgets')
  })

  it('re-adds a widget when its stored preference flips back on', async () => {
    const first = WIDGETS.find((w) => w.defaultEnabled)!
    localStorage.setItem(WIDGETS_STORAGE_KEY, JSON.stringify({ [first.id]: false }))
    renderBoard()
    await waitFor(() => {
      expect(screen.queryByRole('heading', { level: 2, name: first.title })).toBeNull()
    })
    cleanup()
    localStorage.setItem(WIDGETS_STORAGE_KEY, JSON.stringify({ [first.id]: true }))
    renderBoard()
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: first.title })).toBeTruthy()
    })
  })
})
