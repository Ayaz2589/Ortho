// @vitest-environment jsdom
//
// spec 021 — closes the web-vs-iOS liveness gap for the Capacitor build:
// foregrounding re-validates the session (docs/parity-audit-2026-07-02.md).
// spec 023 B5 — the re-validation now hits the SERVER via getUser (not the
// cache-first getSession), so a session revoked server-side within the local
// token TTL is caught; a genuine auth rejection signs out, a transient network
// error does not (no kicking out an offline user).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { makeSupabaseMock, primeFxCache, stubNoNetwork } from '../helpers/supabase-mock'

type GetUserResult = { data: { user: { id: string } | null }; error: { status?: number; message: string } | null }
const { addListener, getUser, signOut } = vi.hoisted(() => ({
  addListener: vi.fn(),
  getUser: vi.fn<() => Promise<GetUserResult>>(() => Promise.resolve({ data: { user: { id: 'u-me' } }, error: null })),
  signOut: vi.fn(() => Promise.resolve({ error: null })),
}))
vi.mock('@capacitor/app', () => ({ App: { addListener } }))

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient }))

import { AppStateProvider } from '@/lib/store'

describe('appStateChange liveness listener', () => {
  let appStateCallback: ((state: { isActive: boolean }) => void) | undefined

  beforeEach(() => {
    localStorage.clear()
    primeFxCache()
    stubNoNetwork()
    vi.stubGlobal('location', { ...window.location, assign: vi.fn() })
    addListener.mockImplementation((_event: string, cb: (s: { isActive: boolean }) => void) => {
      appStateCallback = cb
      return Promise.resolve({ remove: vi.fn() })
    })
    getUser.mockClear()
    getUser.mockResolvedValue({ data: { user: { id: 'u-me' } }, error: null })
    signOut.mockClear()
    const mock = makeSupabaseMock({ authUser: { id: 'u-me', email: 'me@example.com' } })
    Object.assign(mock.client.auth, { getUser, signOut })
    createClient.mockReturnValue(mock.client)
  })

  it('registers an appStateChange listener on mount', async () => {
    render(<AppStateProvider>{null}</AppStateProvider>)
    await waitFor(() => expect(addListener).toHaveBeenCalledWith('appStateChange', expect.any(Function)))
  })

  it('re-validates against the server (getUser) when the app becomes active', async () => {
    render(<AppStateProvider>{null}</AppStateProvider>)
    await waitFor(() => expect(addListener).toHaveBeenCalled())
    getUser.mockClear()
    appStateCallback?.({ isActive: true })
    await waitFor(() => expect(getUser).toHaveBeenCalled())
  })

  it('signs out when the session was revoked server-side (getUser → 401)', async () => {
    render(<AppStateProvider>{null}</AppStateProvider>)
    await waitFor(() => expect(addListener).toHaveBeenCalled())
    getUser.mockResolvedValue({ data: { user: null }, error: { status: 401, message: 'invalid token' } })
    appStateCallback?.({ isActive: true })
    await waitFor(() => expect(signOut).toHaveBeenCalled())
  })

  it('does NOT sign out on a transient network error (no auth status)', async () => {
    render(<AppStateProvider>{null}</AppStateProvider>)
    await waitFor(() => expect(addListener).toHaveBeenCalled())
    getUser.mockResolvedValue({ data: { user: null }, error: { status: 0, message: 'network down' } })
    signOut.mockClear()
    appStateCallback?.({ isActive: true })
    await new Promise((r) => setTimeout(r, 10))
    expect(signOut).not.toHaveBeenCalled()
  })

  it('does not re-validate when the app becomes inactive', async () => {
    render(<AppStateProvider>{null}</AppStateProvider>)
    await waitFor(() => expect(addListener).toHaveBeenCalled())
    getUser.mockClear()
    appStateCallback?.({ isActive: false })
    expect(getUser).not.toHaveBeenCalled()
  })
})
