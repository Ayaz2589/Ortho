// @vitest-environment jsdom
//
// B4 (spec 023): the biometric lock must render as an OVERLAY over a
// kept-mounted AppStateProvider — not early-return that unmounts it. The old
// `if (locked) return <LockScreen/>` discarded the whole provider on every
// background, so unlocking re-ran runBootstrap() (spinner + 11 selects) and lost
// scroll/modals/in-progress input. Here we assert the provider is mounted (its
// Supabase client is created / bootstrap runs) even while locked.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { makeSupabaseMock, primeFxCache, stubNoNetwork } from '../helpers/supabase-mock'

const gate = vi.hoisted(() => ({ state: 'unlocked' as 'checking' | 'locked' | 'unlocked' }))
vi.mock('@/lib/biometricGate', () => ({ useBiometricGate: () => ({ state: gate.state, retry: vi.fn() }) }))

const { hide } = vi.hoisted(() => ({ hide: vi.fn(() => Promise.resolve()) }))
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide } }))

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient }))

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}))

import AppLayout from '@/app/(app)/layout'

describe('B4: biometric lock is an overlay over a kept-mounted provider', () => {
  beforeEach(() => {
    localStorage.clear()
    primeFxCache()
    stubNoNetwork()
    hide.mockClear()
    createClient.mockClear()
    vi.stubGlobal('location', { ...window.location, assign: vi.fn() })
    const mock = makeSupabaseMock({
      authUser: { id: 'u-me', email: 'me@example.com' },
      tables: { users: [{ id: 'u-me', name: 'Me', initial: 'M', color_key: 'sage' }] },
    })
    createClient.mockReturnValue(mock.client)
  })

  it('mounts the data provider (bootstrap runs) even while locked', async () => {
    gate.state = 'locked'
    render(<AppLayout>{<div>content</div>}</AppLayout>)
    // The lock overlay is shown...
    expect(screen.getByText('Unlock Ortho to continue')).toBeInTheDocument()
    // ...and the provider is mounted BEHIND it, so unlocking won't re-bootstrap.
    await waitFor(() => expect(createClient).toHaveBeenCalled())
  })

  it('shows no lock overlay when unlocked', async () => {
    gate.state = 'unlocked'
    render(<AppLayout>{<div>content</div>}</AppLayout>)
    await waitFor(() => expect(createClient).toHaveBeenCalled())
    expect(screen.queryByText('Unlock Ortho to continue')).toBeNull()
  })
})
