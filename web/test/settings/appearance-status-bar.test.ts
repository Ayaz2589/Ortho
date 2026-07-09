// @vitest-environment jsdom
//
// spec 021 — the status bar style/appearance must track the SAME handler that
// flips Ortho's light/dark CSS tokens (research-report-full.md §7), not just
// at cold launch. Style.Dark = light status-bar text (for a dark app
// background); Style.Light = dark text (for a light app background) — this
// naming is easy to get backwards, hence a dedicated test per direction.
import { describe, it, expect, beforeEach, vi } from 'vitest'

const { setStyle, isNativePlatform } = vi.hoisted(() => ({
  setStyle: vi.fn(() => Promise.resolve()),
  isNativePlatform: vi.fn(() => true),
}))

vi.mock('@capacitor/status-bar', () => ({
  StatusBar: { setStyle },
  Style: { Dark: 'DARK', Light: 'LIGHT' },
}))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform } }))

import { applyAppearance } from '@/components/settings/appearance'

describe('applyAppearance — status bar sync', () => {
  beforeEach(() => {
    setStyle.mockClear()
    isNativePlatform.mockReturnValue(true)
    document.documentElement.removeAttribute('data-appearance')
  })

  it('sets Style.Dark (light text) when forcing dark mode', () => {
    applyAppearance('dark')
    expect(setStyle).toHaveBeenCalledWith({ style: 'DARK' })
  })

  it('sets Style.Light (dark text) when forcing light mode', () => {
    applyAppearance('light')
    expect(setStyle).toHaveBeenCalledWith({ style: 'LIGHT' })
  })

  it('does not call the native plugin on non-native platforms', () => {
    isNativePlatform.mockReturnValue(false)
    applyAppearance('dark')
    expect(setStyle).not.toHaveBeenCalled()
  })

  it('resolves against the OS scheme in "system" mode', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('dark'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    applyAppearance('system')
    expect(setStyle).toHaveBeenCalledWith({ style: 'DARK' })
    vi.unstubAllGlobals()
  })
})
