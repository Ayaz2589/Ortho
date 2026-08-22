// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import {
  DownloadDataBody,
  WidgetSettingsBody,
  ChangeCurrencyBody,
  ChangeLanguageBody,
} from '@/components/widgets/bodies/settingsShortcuts'
import { WIDGETS } from '@/lib/widgets/registry'

// Spec 039: four navigation widgets that route to a specific Settings page. The
// bodies are calm icon + "Open" affordance tiles; the registry wires each id to its
// route via the new optional `href`.

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string, ...a: unknown[]) => k.replace(/\{(\d+)\}/g, (_, i) => String(a[Number(i)] ?? '')),
  }),
}))

afterEach(cleanup)

const bodies = [
  ['DownloadDataBody', DownloadDataBody],
  ['WidgetSettingsBody', WidgetSettingsBody],
  ['ChangeCurrencyBody', ChangeCurrencyBody],
  ['ChangeLanguageBody', ChangeLanguageBody],
] as const

describe('settings-shortcut bodies', () => {
  for (const [name, Body] of bodies) {
    it(`${name} renders an "Open" affordance and fills its cell`, () => {
      const { container } = render(<Body />)
      expect(screen.getByText('Open')).toBeTruthy()
      expect((container.firstChild as HTMLElement).className).toContain('h-full')
    })
  }
})

describe('settings-shortcut registry wiring', () => {
  const expected: Record<string, string> = {
    'download-data': '/settings/data',
    'widget-settings': '/settings/widgets',
    'change-currency': '/settings/currency',
    'change-language': '/settings/language',
  }

  for (const [id, href] of Object.entries(expected)) {
    it(`registers ${id} → ${href}, default-off`, () => {
      const def = WIDGETS.find((w) => w.id === id)
      expect(def).toBeTruthy()
      expect(def!.href).toBe(href)
      expect(def!.defaultEnabled).toBe(false)
      expect(typeof def!.Body).toBe('function')
    })
  }
})
