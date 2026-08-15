// @vitest-environment jsdom
// spec 045 US1 — the bare /landing address. Under output: 'export' there are no
// config redirects (research.md §1), so this is a real route that forwards clientside.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({ replace: vi.fn(), isNativePlatform: vi.fn(() => false) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: h.replace, push: vi.fn() }) }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: h.isNativePlatform } }))

import LandingIndex from '@/app/landing/page'
import { LANDING_CATALOGS } from '@/lib/i18n/landing'

function setLanguage(tag: string) {
  Object.defineProperty(window.navigator, 'language', { value: tag, configurable: true })
}

beforeEach(() => {
  h.replace.mockClear()
  h.isNativePlatform.mockReturnValue(false)
})
afterEach(cleanup)

describe('/landing on the installed app', () => {
  it('goes to the dashboard, never to a locale page', async () => {
    h.isNativePlatform.mockReturnValue(true)
    setLanguage('es-ES')
    render(<LandingIndex />)
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/dashboard'))
    expect(h.replace).not.toHaveBeenCalledWith('/landing/es')
  })
})

describe('/landing (no slug)', () => {
  it('forwards to the detected locale', async () => {
    setLanguage('es-ES')
    render(<LandingIndex />)
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/landing/es'))
  })

  it('forwards to en for an unsupported browser language', async () => {
    setLanguage('fr-FR')
    render(<LandingIndex />)
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/landing/en'))
  })

  it('renders no content of its own while forwarding', () => {
    // It must not flash a landing page of the wrong language on the way through.
    setLanguage('ja-JP')
    render(<LandingIndex />)
    for (const slug of ['en', 'es', 'ja'] as const) {
      expect(screen.queryByText(LANDING_CATALOGS[slug].placeholderLine)).toBeNull()
    }
  })

  it('replaces rather than pushes, so it never becomes a back-button trap', async () => {
    setLanguage('ko-KR')
    render(<LandingIndex />)
    await waitFor(() => expect(h.replace).toHaveBeenCalledTimes(1))
  })
})
