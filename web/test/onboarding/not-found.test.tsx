// @vitest-environment jsdom
// spec 045 US1 — recovery for a stale landing link, WITHOUT turning every 404 in the
// app into a redirect to marketing. Under output: 'export' an unlisted slug never
// reaches the app's routing, so the 404 document is the only place to catch it
// (research.md §5).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({ replace: vi.fn(), isNativePlatform: vi.fn(() => false) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: h.replace, push: vi.fn() }) }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: h.isNativePlatform } }))

import NotFound from '@/app/not-found'
import { LANDING_CATALOGS } from '@/lib/i18n/landing'

function setPath(pathname: string) {
  window.history.replaceState({}, '', pathname)
}

function setLanguage(tag: string) {
  Object.defineProperty(window.navigator, 'language', { value: tag, configurable: true })
}

beforeEach(() => {
  h.replace.mockClear()
  h.isNativePlatform.mockReturnValue(false)
  setLanguage('en-US')
})
afterEach(cleanup)

describe('not-found — never recovers to marketing inside the installed app', () => {
  it('does not redirect a /landing/ path on native', async () => {
    // Nothing in the app links to /landing/* today, but the guard costs one line and
    // this is exactly the failure the feature exists to prevent.
    h.isNativePlatform.mockReturnValue(true)
    setLanguage('es-ES')
    setPath('/landing/fr')
    render(<NotFound />)
    await new Promise((r) => setTimeout(r, 20))
    expect(h.replace).not.toHaveBeenCalled()
  })
})

describe('not-found — localized', () => {
  it.each(['es', 'ja', 'ko'] as const)('renders %s copy for that browser language', async (slug) => {
    const tag = { es: 'es-ES', ja: 'ja-JP', ko: 'ko-KR' }[slug]
    setLanguage(tag)
    setPath('/transactions/typo')
    render(<NotFound />)
    // Resolved after mount — the static document cannot know the browser language.
    await waitFor(() =>
      expect(screen.getByText(LANDING_CATALOGS[slug].notFoundLine)).toBeTruthy(),
    )
  })

  it('falls back to English for an unsupported browser language', async () => {
    setLanguage('fr-FR')
    setPath('/transactions/typo')
    render(<NotFound />)
    await waitFor(() =>
      expect(screen.getByText(LANDING_CATALOGS.en.notFoundLine)).toBeTruthy(),
    )
  })
})

describe('not-found — landing recovery branch', () => {
  it('recovers a stale /landing/<unknown> link to the detected locale', async () => {
    setLanguage('es-MX')
    setPath('/landing/fr')
    render(<NotFound />)
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/landing/es'))
  })

  it('recovers a mistyped landing slug to en for an unsupported browser language', async () => {
    setLanguage('fr-FR')
    setPath('/landing/xx')
    render(<NotFound />)
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/landing/en'))
  })
})

describe('not-found — every other path', () => {
  // The negative case is the point of scoping. A global redirect-to-marketing would
  // eject a signed-in user from the app on a typo'd in-app URL.
  it.each(['/transactions/typo', '/dashboard/nope', '/settings/xyz', '/', '/landingpage'])(
    'does NOT redirect %s to marketing',
    async (path) => {
      setPath(path)
      render(<NotFound />)
      await new Promise((r) => setTimeout(r, 20))
      expect(h.replace).not.toHaveBeenCalled()
    },
  )

  it('renders a calm not-found page with a way back', () => {
    setPath('/transactions/typo')
    const { container } = render(<NotFound />)
    // A real, reachable control — not a div with an onClick.
    expect(container.querySelector('a, button')).toBeTruthy()
  })

  it('stays non-alarmist — no destructive/error styling', () => {
    // Constitution II/IV: empty and error states are short and never alarmist.
    setPath('/transactions/typo')
    const { container } = render(<NotFound />)
    expect(container.innerHTML).not.toContain('text-destructive')
    expect(container.innerHTML).not.toMatch(/\bbg-red|text-red\b/)
  })
})
