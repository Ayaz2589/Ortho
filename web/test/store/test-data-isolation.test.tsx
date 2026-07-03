// @vitest-environment jsdom
//
// spec 015 — test-data isolation (contract C-TD-1, SC-001/SC-002). With the
// flag on, `createClient()` returns the in-memory seeded client and the real
// browser client is NEVER constructed, so no read/write can reach the live
// backend; the store boots populated purely from the seed.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { primeFxCache, stubNoNetwork } from '../helpers/supabase-mock'

// Spy the real browser-client factory so we can assert it is never called.
// Defined via vi.hoisted so it exists when the hoisted vi.mock factory runs.
const { createBrowserClient } = vi.hoisted(() => ({
  createBrowserClient: vi.fn(() => {
    throw new Error('live browser client must not be constructed in test-data mode')
  }),
}))
vi.mock('@supabase/ssr', () => ({ createBrowserClient }))

import { createClient } from '@/lib/supabase/client'
import { AppStateProvider, useApp } from '@/lib/store'

function setFlag(useTestData: boolean) {
  localStorage.setItem('ortho.flags', JSON.stringify({ useTestData, bypassAuth: false }))
}

function Probe() {
  const { transactions, householdMembers } = useApp()
  return (
    <div>
      <span data-testid="tx-count">{transactions.length}</span>
      <span data-testid="member-count">{householdMembers.length}</span>
      <span data-testid="merchants">{transactions.map((t) => t.merchant).join('|')}</span>
    </div>
  )
}

describe('test-data isolation — client seam', () => {
  beforeEach(() => {
    localStorage.clear()
    createBrowserClient.mockClear()
  })
  afterEach(() => vi.unstubAllEnvs())

  it('returns an in-memory client and never constructs the live client when the flag is on', async () => {
    setFlag(true)
    const client = createClient()
    expect(createBrowserClient).not.toHaveBeenCalled()
    const { data } = await client.auth.getUser()
    expect((data.user as { email?: string }).email).toBe('tester@ortho.test')
  })

  it('constructs the live client when the flag is off', () => {
    setFlag(false)
    // Our spy throws to prove the live path is taken (we only care that it is
    // reached, not that it succeeds without real env).
    expect(() => createClient()).toThrow(/live browser client/)
    expect(createBrowserClient).toHaveBeenCalledOnce()
  })
})

describe('test-data isolation — store boots from the seed', () => {
  beforeEach(() => {
    localStorage.clear()
    primeFxCache()
    stubNoNetwork()
    createBrowserClient.mockClear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('populates the store from the seeded dataset with no live client', async () => {
    setFlag(true)
    render(
      <AppStateProvider>
        <Probe />
      </AppStateProvider>
    )
    await waitFor(() => expect(Number(screen.getByTestId('tx-count').textContent)).toBeGreaterThan(0))
    expect(Number(screen.getByTestId('member-count').textContent)).toBe(2)
    expect(screen.getByTestId('merchants').textContent).toContain('Whole Foods')
    expect(createBrowserClient).not.toHaveBeenCalled()
  })
})
