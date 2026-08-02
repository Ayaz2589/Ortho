// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { WidgetBoard } from '@/components/widgets/WidgetBoard'
import { WIDGETS } from '@/lib/widgets/registry'
import { WIDGETS_STORAGE_KEY } from '@/lib/widgets/preferences'

// Spec 034: the board renders exactly the enabled widgets (registry order), packs
// them with no empty cell, and shows a calm empty state when none are enabled.
// FR-003, FR-009. The board is a pure function of the registry + prefs (FR-008).

vi.mock('@/lib/store', () => ({ useApp: () => ({ t: (k: string) => k }) }))

beforeEach(() => localStorage.clear())
afterEach(cleanup)

const defaultEnabledTitles = WIDGETS.filter((w) => w.defaultEnabled).map((w) => w.title)
const defaultDisabled = WIDGETS.find((w) => !w.defaultEnabled)

describe('WidgetBoard', () => {
  it('renders exactly the default-enabled widgets by default', async () => {
    render(<WidgetBoard />)
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

  it('renders the widgets inside a labelled board region', async () => {
    render(<WidgetBoard />)
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Dashboard widgets' })).toBeTruthy()
    })
  })

  it('shows a calm empty state and no widgets when everything is disabled', async () => {
    const allOff = Object.fromEntries(WIDGETS.map((w) => [w.id, false]))
    localStorage.setItem(WIDGETS_STORAGE_KEY, JSON.stringify(allOff))
    render(<WidgetBoard />)
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
    render(<WidgetBoard />)
    await waitFor(() => {
      expect(screen.queryByRole('heading', { level: 2, name: first.title })).toBeNull()
    })
    cleanup()
    localStorage.setItem(WIDGETS_STORAGE_KEY, JSON.stringify({ [first.id]: true }))
    render(<WidgetBoard />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: first.title })).toBeTruthy()
    })
  })
})
