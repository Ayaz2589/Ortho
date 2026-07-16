// @vitest-environment jsdom
// T022 (spec 024, US1-4) — the /plaid-oauth return route: after a bank's own
// OAuth detour, Link resumes with the SAME stored link token +
// receivedRedirectUri (Plaid's documented SPA pattern); with nothing pending
// it stays calm and points back to Linked banks.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { savePendingLinkSession, PENDING_LINK_SESSION_KEY } from '@/lib/plaidLinkSession'

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

const aggregation = vi.hoisted(() => ({
  completeLinkSession: vi.fn(),
}))
vi.mock('@/lib/aggregation', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/aggregation')>()
  return { ...real, ...aggregation }
})

type LinkConfig = {
  token: string
  onSuccess: (publicToken: string, metadata: unknown) => void
  onExit: (err: unknown, metadata: unknown) => void
  receivedRedirectUri?: string
}
const plaidLink = vi.hoisted(() => ({
  config: null as LinkConfig | null,
  open: vi.fn(),
}))
vi.mock('react-plaid-link', () => ({
  usePlaidLink: (cfg: LinkConfig) => {
    plaidLink.config = cfg
    return { open: plaidLink.open, ready: true, exit: vi.fn(), error: null }
  },
}))

const store = vi.hoisted(() => ({ refreshLinkedBanks: vi.fn() }))
vi.mock('@/lib/store', () => ({
  useApp: () => ({
    ...store,
    locale: 'en-US',
    t: (key: string, ...args: Array<string | number>) =>
      args.length ? key.replace(/\{(\d+)\}/g, (m, i) => String(args[Number(i)] ?? m)) : key,
  }),
}))

import PlaidOauthReturnPage from '@/app/(app)/plaid-oauth/page'

beforeEach(() => {
  aggregation.completeLinkSession.mockResolvedValue({
    ok: true,
    value: { institution: { id: 'li-1' }, accounts: [] },
  })
  store.refreshLinkedBanks.mockResolvedValue(true)
  plaidLink.config = null
  plaidLink.open.mockReset()
  router.replace.mockReset()
})
afterEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('resuming the OAuth detour', () => {
  it('re-initializes Link with the stored token + receivedRedirectUri and finishes', async () => {
    savePendingLinkSession({
      sessionId: 's-1',
      linkToken: 'link-sandbox-1',
      mode: 'embedded',
      expiresAt: '2099-01-01T00:00:00Z',
    })
    render(<PlaidOauthReturnPage />)

    await waitFor(() => expect(plaidLink.open).toHaveBeenCalled())
    expect(plaidLink.config?.token).toBe('link-sandbox-1')
    expect(plaidLink.config?.receivedRedirectUri).toBe(window.location.href)

    await act(async () => {
      plaidLink.config!.onSuccess('public-oauth-1', {})
    })
    await waitFor(() =>
      expect(aggregation.completeLinkSession).toHaveBeenCalledWith('s-1', 'public-oauth-1')
    )
    expect(store.refreshLinkedBanks).toHaveBeenCalled()
    expect(localStorage.getItem(PENDING_LINK_SESSION_KEY)).toBeNull()
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/settings/linked-banks'))
  })

  it('abandoning after the detour clears the record and routes back calmly', async () => {
    savePendingLinkSession({
      sessionId: 's-1',
      linkToken: 'link-sandbox-1',
      mode: 'embedded',
      expiresAt: '2099-01-01T00:00:00Z',
    })
    render(<PlaidOauthReturnPage />)
    await waitFor(() => expect(plaidLink.open).toHaveBeenCalled())
    await act(async () => {
      plaidLink.config!.onExit(null, {})
    })
    expect(localStorage.getItem(PENDING_LINK_SESSION_KEY)).toBeNull()
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/settings/linked-banks'))
    expect(aggregation.completeLinkSession).not.toHaveBeenCalled()
  })
})

describe('arriving with nothing pending', () => {
  it('states it calmly and links back to Linked banks — never an error tone', () => {
    render(<PlaidOauthReturnPage />)
    expect(screen.getByText('No bank connection is in progress.')).toBeInTheDocument()
    const back = screen.getByRole('link', { name: 'Back to Linked banks' })
    expect(back).toHaveAttribute('href', '/settings/linked-banks')
    expect(document.querySelector('.text-destructive')).toBeNull()
  })
})
