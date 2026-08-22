// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WidgetsSettingsPage from '@/app/(app)/settings/widgets/page'
import { WIDGETS } from '@/lib/widgets/registry'
import { readWidgetPrefs } from '@/lib/widgets/preferences'

// Spec 034: Settings → Widgets lists every widget with an on/off switch; toggling
// persists per browser and reflects stored prefs on mount. FR-006, FR-007.

vi.mock('@/lib/store', () => ({ useApp: () => ({ t: (k: string) => k }) }))

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('Widgets settings page', () => {
  it('renders one switch per registry widget, showing name and description', () => {
    render(<WidgetsSettingsPage />)
    const switches = screen.getAllByRole('switch')
    expect(switches).toHaveLength(WIDGETS.length)
    for (const w of WIDGETS) {
      expect(screen.getByRole('switch', { name: new RegExp(w.title) })).toBeTruthy()
      expect(screen.getByText(w.description)).toBeTruthy()
    }
  })

  it('reflects each widget default as the switch state', () => {
    render(<WidgetsSettingsPage />)
    for (const w of WIDGETS) {
      const el = screen.getByRole('switch', { name: new RegExp(w.title) })
      expect(el.getAttribute('aria-checked')).toBe(String(w.defaultEnabled))
    }
  })

  it('toggling a widget flips its state and persists it', async () => {
    const target = WIDGETS[0]
    render(<WidgetsSettingsPage />)
    const el = screen.getByRole('switch', { name: new RegExp(target.title) })
    const before = target.defaultEnabled

    await userEvent.click(el)

    await waitFor(() => {
      expect(el.getAttribute('aria-checked')).toBe(String(!before))
    })
    expect(readWidgetPrefs()[target.id]).toBe(!before)
  })

  it('reflects existing stored preferences on mount', async () => {
    const target = WIDGETS[0]
    localStorage.setItem('ortho.widgets', JSON.stringify({ [target.id]: !target.defaultEnabled }))
    render(<WidgetsSettingsPage />)
    await waitFor(() => {
      const el = screen.getByRole('switch', { name: new RegExp(target.title) })
      expect(el.getAttribute('aria-checked')).toBe(String(!target.defaultEnabled))
    })
  })
})
