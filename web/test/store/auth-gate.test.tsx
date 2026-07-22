// @vitest-environment jsdom
//
// spec 021 — client-side auth gate replacing `proxy.ts`'s server-side redirect
// (unsupported under `output: 'export'`). Bootstrap itself now performs the
// signed-out redirect that the deleted server-side proxy used to do before any
// client code ran.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { makeSupabaseMock, primeFxCache, stubNoNetwork } from '../helpers/supabase-mock'

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient }))

const assign = vi.fn()

import { AppStateProvider } from '@/lib/store'

describe('client-side auth gate (bootstrap)', () => {
  beforeEach(() => {
    localStorage.clear()
    primeFxCache()
    stubNoNetwork()
    assign.mockClear()
    vi.stubGlobal('location', { ...window.location, assign })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('redirects to /sign-in when there is no authenticated user', async () => {
    const mock = makeSupabaseMock({ authUser: null })
    createClient.mockReturnValue(mock.client)

    render(<AppStateProvider>{null}</AppStateProvider>)

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/sign-in'))
  })

  it('does not redirect when the test-build bypassAuth flag is set', async () => {
    localStorage.setItem('ortho.flags', JSON.stringify({ useTestData: false, bypassAuth: true }))
    const mock = makeSupabaseMock({ authUser: null })
    createClient.mockReturnValue(mock.client)

    render(<AppStateProvider>{null}</AppStateProvider>)

    // Give bootstrap a tick to run and settle without a user.
    await waitFor(() => expect(mock.calls).toBeDefined())
    expect(assign).not.toHaveBeenCalled()
  })

  it('spec 030: auto-signs-in the seed user in local/stage (no redirect)', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'local')
    vi.stubEnv('NEXT_PUBLIC_DEV_AUTOLOGIN', '1')
    vi.stubEnv('NEXT_PUBLIC_DEV_AUTOLOGIN_EMAIL', 'seed@ortho.test')
    vi.stubEnv('NEXT_PUBLIC_DEV_AUTOLOGIN_PASSWORD', 'seed-pw')
    const mock = makeSupabaseMock({
      authUser: null,
      signInUser: { id: 'u-seed', email: 'seed@ortho.test' },
      tables: { users: [{ id: 'u-seed', name: 'Seed', initial: 'S', color_key: 'sage' }] },
    })
    const signInSpy = vi.spyOn(mock.client.auth, 'signInWithPassword')
    createClient.mockReturnValue(mock.client)

    render(<AppStateProvider>{null}</AppStateProvider>)

    await waitFor(() =>
      expect(signInSpy).toHaveBeenCalledWith({ email: 'seed@ortho.test', password: 'seed-pw' })
    )
    expect(assign).not.toHaveBeenCalled()
  })

  it('spec 030: never auto-signs-in in production — the sign-in gate still fires', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'prod')
    vi.stubEnv('NEXT_PUBLIC_DEV_AUTOLOGIN', '1')
    vi.stubEnv('NEXT_PUBLIC_DEV_AUTOLOGIN_EMAIL', 'seed@ortho.test')
    vi.stubEnv('NEXT_PUBLIC_DEV_AUTOLOGIN_PASSWORD', 'seed-pw')
    const mock = makeSupabaseMock({ authUser: null, signInUser: { id: 'u-seed' } })
    const signInSpy = vi.spyOn(mock.client.auth, 'signInWithPassword')
    createClient.mockReturnValue(mock.client)

    render(<AppStateProvider>{null}</AppStateProvider>)

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/sign-in'))
    expect(signInSpy).not.toHaveBeenCalled()
  })

  it('does not redirect when a user is present', async () => {
    const mock = makeSupabaseMock({
      authUser: { id: 'u-me', email: 'me@example.com' },
      tables: { users: [{ id: 'u-me', name: 'Me', initial: 'M', color_key: 'sage' }] },
    })
    createClient.mockReturnValue(mock.client)

    render(<AppStateProvider>{null}</AppStateProvider>)

    await waitFor(() => expect(mock.callsFor('households').length + mock.callsFor('household_members').length).toBeGreaterThanOrEqual(0))
    expect(assign).not.toHaveBeenCalledWith('/sign-in')
  })
})
