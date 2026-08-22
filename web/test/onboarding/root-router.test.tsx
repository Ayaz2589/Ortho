// @vitest-environment jsdom
// spec 045 US2 — the root router. THE highest-severity surface in this feature: `/` is
// both the website's front door and the installed iOS app's entry point (capacitor.config.ts
// webDir: 'out'), so a mistake here ships an App Store build that opens on an advert.
//
// Written BEFORE app/page.tsx was touched, and asserting ORDER, not just destination:
// the native branch must resolve without ever consulting the session. If it merely
// "usually" wins a race with an async auth call, the bug is latent, not absent.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type AuthUser = { id: string } | null

const h = vi.hoisted(() => ({
  replace: vi.fn(),
  isNativePlatform: vi.fn(() => false),
  getUser: vi.fn(async (): Promise<{ data: { user: { id: string } | null } }> => ({
    data: { user: null },
  })),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: h.replace, push: vi.fn() }) }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: h.isNativePlatform } }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: h.getUser } }),
}))

import Home from '@/app/page'
import { LANDING_CATALOGS } from '@/lib/i18n/landing'

function setLanguage(tag: string) {
  Object.defineProperty(window.navigator, 'language', { value: tag, configurable: true })
}

const signedIn = async (): Promise<{ data: { user: AuthUser } }> => ({
  data: { user: { id: 'u1' } },
})
const signedOut = async (): Promise<{ data: { user: AuthUser } }> => ({ data: { user: null } })

beforeEach(() => {
  h.replace.mockClear()
  h.getUser.mockClear()
  h.isNativePlatform.mockReturnValue(false)
  h.getUser.mockImplementation(signedOut)
  setLanguage('en-US')
})
afterEach(cleanup)

// ── T015: the native guard ────────────────────────────────────────────────────

describe('root router — installed iOS app (FR-004)', () => {
  it('goes to the dashboard and NEVER consults the session', async () => {
    h.isNativePlatform.mockReturnValue(true)
    render(<Home />)
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/dashboard'))
    // The assertion that matters. Destination alone would pass even if the native
    // check merely won a race; this pins the ordering.
    expect(h.getUser).not.toHaveBeenCalled()
  })

  it('goes to the dashboard even when signed out', async () => {
    h.isNativePlatform.mockReturnValue(true)
    h.getUser.mockImplementation(signedOut)
    render(<Home />)
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/dashboard'))
    expect(h.getUser).not.toHaveBeenCalled()
  })

  it('ignores the device language entirely', async () => {
    // The mistake an implementer is most likely to make: reading the language
    // before checking the platform. A Spanish-language iPhone must still open the app.
    h.isNativePlatform.mockReturnValue(true)
    setLanguage('es-ES')
    render(<Home />)
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/dashboard'))
    expect(h.replace).not.toHaveBeenCalledWith('/landing/es')
  })

  it.each(['es-ES', 'bn-BD', 'ja-JP', 'zh-CN', 'ko-KR', 'fr-FR', ''])(
    'never routes to marketing with device language %s',
    async (tag) => {
      h.isNativePlatform.mockReturnValue(true)
      setLanguage(tag)
      render(<Home />)
      await waitFor(() => expect(h.replace).toHaveBeenCalled())
      for (const call of h.replace.mock.calls) {
        expect(String(call[0])).not.toContain('/landing')
      }
    },
  )

  it('renders no landing copy at any point on native', async () => {
    h.isNativePlatform.mockReturnValue(true)
    setLanguage('es-ES')
    render(<Home />)
    await waitFor(() => expect(h.replace).toHaveBeenCalled())
    for (const slug of ['en', 'es'] as const) {
      expect(screen.queryByText(LANDING_CATALOGS[slug].landing.headline)).toBeNull()
    }
  })
})

// ── T016: the rest of the matrix ──────────────────────────────────────────────

describe('root router — signed-in web visitor (FR-005)', () => {
  it('goes straight to the dashboard', async () => {
    h.getUser.mockImplementation(signedIn)
    render(<Home />)
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/dashboard'))
  })

  it('never routes to marketing, whatever the browser language', async () => {
    h.getUser.mockImplementation(signedIn)
    setLanguage('es-ES')
    render(<Home />)
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/dashboard'))
    expect(h.replace).not.toHaveBeenCalledWith('/landing/es')
  })
})

describe('root router — signed-out web visitor (FR-006)', () => {
  it.each([
    ['es-ES', '/landing/es'],
    ['es-MX', '/landing/es'],
    ['ja-JP', '/landing/ja'],
    ['bn-BD', '/landing/bn'],
    ['zh-TW', '/landing/zh'],
    ['ko-KR', '/landing/ko'],
  ])('routes %s to %s', async (tag, expected) => {
    setLanguage(tag)
    render(<Home />)
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith(expected))
  })

  it.each(['fr-FR', 'de-DE', 'pt-BR'])('falls back to English for %s', async (tag) => {
    setLanguage(tag)
    render(<Home />)
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/landing/en'))
  })

  it('falls back to English when the browser reports no language', async () => {
    setLanguage('')
    render(<Home />)
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/landing/en'))
  })
})

describe('root router — while the decision is resolving (FR-007)', () => {
  it('renders neither destination', async () => {
    // A never-settling auth call: the holding state must not resolve into either
    // a landing page or dashboard chrome on its own.
    h.getUser.mockImplementation(() => new Promise(() => {}) as never)
    const { container } = render(<Home />)
    await new Promise((r) => setTimeout(r, 20))
    expect(h.replace).not.toHaveBeenCalled()
    expect(container.textContent ?? '').toBe('')
  })
})

describe('root router — navigation mechanism', () => {
  it('replaces rather than pushes, so the root is never a back-button trap', async () => {
    render(<Home />)
    await waitFor(() => expect(h.replace).toHaveBeenCalledTimes(1))
  })

  it('uses the client router, not a hard navigation', () => {
    // A hard window.location navigation on native would hit the extensionless-path
    // fallback documented in lib/nav.ts (Capacitor serves index.html for any path
    // without an extension) and loop. Client navigations fetch segment data instead.
    const src = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8')
    expect(src).not.toContain('window.location.assign')
    expect(src).not.toContain('window.location.href')
  })
})
