// @vitest-environment jsdom
//
// spec 015 — the Settings → Developer section: visible on test builds, absent
// in production (contract C-FF-3), and toggling persists the flag (C-FF-5).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { makeSupabaseMock, primeFxCache, stubNoNetwork, type SupabaseMock } from '../helpers/supabase-mock'

const h = vi.hoisted(() => ({ mock: null as SupabaseMock | null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => h.mock!.client }))

import { AppStateProvider } from '@/lib/store'
import { FlagsSection } from '@/components/settings/flags-section'

function renderSection() {
  return render(
    <AppStateProvider>
      <FlagsSection />
    </AppStateProvider>
  )
}

describe('FlagsSection', () => {
  let originalLocation: Location
  beforeEach(() => {
    localStorage.clear()
    primeFxCache()
    stubNoNetwork()
    // No signed-in user: bootstrap returns early, provider just supplies `t`.
    h.mock = makeSupabaseMock({ authUser: null })
    // window.location.reload is not spy-able in jsdom; replace location wholesale
    // so the toggle's reload is a harmless no-op. Saved + restored below so the
    // replacement can't leak into later files (the suite runs sequentially).
    originalLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: vi.fn(), assign: vi.fn() },
    })
  })
  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('renders the Developer flags on a test build', async () => {
    renderSection()
    expect(await screen.findByText('Developer')).toBeTruthy()
    expect(screen.getByText('Use test data')).toBeTruthy()
    expect(screen.getByText('Bypass auth')).toBeTruthy()
  })

  it('persists the flag when a toggle is tapped', async () => {
    renderSection()
    fireEvent.click(await screen.findByText('Use test data'))
    expect(JSON.parse(localStorage.getItem('ortho.flags')!)).toEqual({
      useTestData: true,
      bypassAuth: false,
    })
  })

  it('is absent in a production build', () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production')
    renderSection()
    expect(screen.queryByText('Developer')).toBeNull()
    expect(screen.queryByText('Use test data')).toBeNull()
  })
})
