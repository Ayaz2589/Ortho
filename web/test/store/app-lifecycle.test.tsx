// @vitest-environment jsdom
//
// spec 021 — closes the documented (docs/parity-audit-2026-07-02.md) web-vs-iOS
// liveness gap for the Capacitor build specifically: foregrounding the app
// re-validates the session the same way the native app's launch-time
// authStateChanges subscription did (contracts/session-storage-adapter.md).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { makeSupabaseMock, primeFxCache, stubNoNetwork } from '../helpers/supabase-mock'

const { addListener, getSession } = vi.hoisted(() => ({
  addListener: vi.fn(),
  getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
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
    getSession.mockClear()
    const mock = makeSupabaseMock({ authUser: { id: 'u-me', email: 'me@example.com' } })
    mock.client.auth.getSession = getSession
    createClient.mockReturnValue(mock.client)
  })

  it('registers an appStateChange listener on mount', async () => {
    render(<AppStateProvider>{null}</AppStateProvider>)
    await waitFor(() => expect(addListener).toHaveBeenCalledWith('appStateChange', expect.any(Function)))
  })

  it('re-validates the session when the app becomes active', async () => {
    render(<AppStateProvider>{null}</AppStateProvider>)
    await waitFor(() => expect(addListener).toHaveBeenCalled())

    appStateCallback?.({ isActive: true })
    await waitFor(() => expect(getSession).toHaveBeenCalled())
  })

  it('does not re-validate when the app becomes inactive', async () => {
    render(<AppStateProvider>{null}</AppStateProvider>)
    await waitFor(() => expect(addListener).toHaveBeenCalled())

    getSession.mockClear()
    appStateCallback?.({ isActive: false })
    expect(getSession).not.toHaveBeenCalled()
  })
})
