// @vitest-environment jsdom
// T028 (spec 024, US2/FR-004) — the Capacitor iOS shell: Connect forks to
// Hosted Link in the EXTERNAL browser (webview Link is deprecated by Plaid),
// and the connection completes via the ortho://plaid-done hand-back or the
// foreground poll — idempotently, per contracts/link-session-lifecycle.md.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { savePendingLinkSession, PENDING_LINK_SESSION_KEY } from '@/lib/plaidLinkSession'

const aggregation = vi.hoisted(() => ({
  checkLinkingAvailable: vi.fn(),
  createLinkSession: vi.fn(),
  completeLinkSession: vi.fn(),
  disconnectInstitution: vi.fn(),
}))
vi.mock('@/lib/aggregation', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/aggregation')>()
  return { ...real, ...aggregation }
})

const plaidLink = vi.hoisted(() => ({ open: vi.fn() }))
vi.mock('react-plaid-link', () => ({
  usePlaidLink: () => ({ open: plaidLink.open, ready: true, exit: vi.fn(), error: null }),
}))

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))

// Capture Capacitor App listeners by event name so tests can fire them.
type Listener = (payload: never) => void
const capApp = vi.hoisted(() => ({
  listeners: {} as Record<string, Listener[]>,
}))
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: (event: string, cb: Listener) => {
      ;(capApp.listeners[event] ??= []).push(cb)
      return Promise.resolve({
        remove: () => {
          capApp.listeners[event] = (capApp.listeners[event] ?? []).filter((l) => l !== cb)
        },
      })
    },
  },
}))

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

const store = vi.hoisted(() => ({ refreshLinkedBanks: vi.fn() }))
vi.mock('@/lib/store', () => ({
  useApp: () => ({
    ...store,
    linkedInstitutions: [],
    linkedAccounts: [],
    locale: 'en-US',
    t: (key: string, ...args: Array<string | number>) =>
      args.length ? key.replace(/\{(\d+)\}/g, (m, i) => String(args[Number(i)] ?? m)) : key,
  }),
}))

import { LinkedBanks } from '@/components/settings/LinkedBanks'
import { PlaidHandBack } from '@/components/PlaidHandBack'

const HOSTED_SESSION = {
  sessionId: 's-h1',
  linkToken: 'link-sandbox-h1',
  expiresAt: '2099-01-01T00:30:00Z',
  hostedLinkUrl: 'https://secure.plaid.com/hl/abc',
}

const OUTCOME = {
  institution: {
    id: 'li-1', provider: 'plaid', institutionName: 'First Platypus Bank',
    status: 'active', createdBy: 'u-me', createdAt: '2026-07-16T00:00:00Z',
  },
  accounts: [],
}

function pendingHosted() {
  savePendingLinkSession({
    sessionId: 's-h1',
    linkToken: 'link-sandbox-h1',
    mode: 'hosted',
    expiresAt: '2099-01-01T00:30:00Z',
  })
}

let assignSpy: ReturnType<typeof vi.fn>
const originalLocation = window.location

beforeEach(() => {
  assignSpy = vi.fn()
  Object.defineProperty(window, 'location', {
    value: { ...originalLocation, assign: assignSpy },
    writable: true,
    configurable: true,
  })
  aggregation.checkLinkingAvailable.mockResolvedValue({ ok: true, value: { configured: true } })
  aggregation.createLinkSession.mockResolvedValue({ ok: true, value: HOSTED_SESSION })
  aggregation.completeLinkSession.mockResolvedValue({ ok: true, value: OUTCOME })
  store.refreshLinkedBanks.mockResolvedValue(true)
  capApp.listeners = {}
})
afterEach(() => {
  Object.defineProperty(window, 'location', { value: originalLocation, configurable: true })
  vi.clearAllMocks()
  localStorage.clear()
})

describe('US2-1 — Connect opens Hosted Link outside the webview', () => {
  it('requests a hosted session and top-level-navigates to hostedLinkUrl', async () => {
    render(<LinkedBanks />)
    fireEvent.click(await screen.findByRole('button', { name: 'Connect a bank' }))
    await waitFor(() =>
      expect(aggregation.createLinkSession).toHaveBeenCalledWith('hosted', 'en')
    )
    await waitFor(() =>
      expect(assignSpy).toHaveBeenCalledWith('https://secure.plaid.com/hl/abc')
    )
    // Embedded Link must never run inside the webview.
    expect(plaidLink.open).not.toHaveBeenCalled()
    // The pending record survives for the hand-back/foreground paths.
    const stored = JSON.parse(localStorage.getItem(PENDING_LINK_SESSION_KEY)!)
    expect(stored.mode).toBe('hosted')
    expect(stored.sessionId).toBe('s-h1')
  })
})

describe('US2-2 — the ortho://plaid-done hand-back', () => {
  it('routes to Linked banks and completes the pending session', async () => {
    pendingHosted()
    aggregation.completeLinkSession.mockResolvedValueOnce({ ok: false, code: 'session_incomplete' })
    render(<PlaidHandBack />)
    // Mount attempts once (cold-start recovery) — answered "not finished yet".
    await waitFor(() => expect(aggregation.completeLinkSession).toHaveBeenCalledTimes(1))

    await act(async () => {
      capApp.listeners['appUrlOpen']?.forEach((cb) =>
        cb({ url: 'ortho://plaid-done' } as never)
      )
    })
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/settings/linked-banks'))
    await waitFor(() => expect(aggregation.completeLinkSession).toHaveBeenCalledTimes(2))
    expect(aggregation.completeLinkSession).toHaveBeenLastCalledWith('s-h1')
    await waitFor(() =>
      expect(localStorage.getItem(PENDING_LINK_SESSION_KEY)).toBeNull()
    )
    expect(store.refreshLinkedBanks).toHaveBeenCalled()
  })

  it('unrelated deep links are ignored', async () => {
    pendingHosted()
    aggregation.completeLinkSession.mockResolvedValue({ ok: false, code: 'session_incomplete' })
    render(<PlaidHandBack />)
    await waitFor(() => expect(aggregation.completeLinkSession).toHaveBeenCalledTimes(1))
    await act(async () => {
      capApp.listeners['appUrlOpen']?.forEach((cb) => cb({ url: 'ortho://something-else' } as never))
    })
    expect(router.push).not.toHaveBeenCalled()
    expect(aggregation.completeLinkSession).toHaveBeenCalledTimes(1)
  })
})

describe('US2-3 — foreground poll fallback (lost hand-back)', () => {
  async function mountSettled() {
    // Mount-attempt resolves "not finished" so the foreground behavior is isolated.
    aggregation.completeLinkSession.mockResolvedValueOnce({ ok: false, code: 'session_incomplete' })
    render(<PlaidHandBack />)
    await waitFor(() => expect(aggregation.completeLinkSession).toHaveBeenCalledTimes(1))
  }

  function foreground() {
    return act(async () => {
      capApp.listeners['appStateChange']?.forEach((cb) => cb({ isActive: true } as never))
    })
  }

  it('completes the session on foreground and clears the record', async () => {
    pendingHosted()
    await mountSettled()
    await foreground()
    await waitFor(() => expect(aggregation.completeLinkSession).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(localStorage.getItem(PENDING_LINK_SESSION_KEY)).toBeNull())
    expect(store.refreshLinkedBanks).toHaveBeenCalled()
  })

  it('session_incomplete keeps waiting silently (user still in the browser)', async () => {
    pendingHosted()
    await mountSettled()
    aggregation.completeLinkSession.mockResolvedValueOnce({ ok: false, code: 'session_incomplete' })
    await foreground()
    expect(localStorage.getItem(PENDING_LINK_SESSION_KEY)).not.toBeNull()
  })

  it('session_expired clears the record calmly', async () => {
    pendingHosted()
    await mountSettled()
    aggregation.completeLinkSession.mockResolvedValueOnce({ ok: false, code: 'session_expired' })
    await foreground()
    await waitFor(() => expect(localStorage.getItem(PENDING_LINK_SESSION_KEY)).toBeNull())
  })

  it('backgrounding does not attempt completion', async () => {
    pendingHosted()
    await mountSettled()
    await act(async () => {
      capApp.listeners['appStateChange']?.forEach((cb) => cb({ isActive: false } as never))
    })
    expect(aggregation.completeLinkSession).toHaveBeenCalledTimes(1)
  })

  it('with no pending record nothing is attempted', async () => {
    render(<PlaidHandBack />)
    await foreground()
    expect(aggregation.completeLinkSession).not.toHaveBeenCalled()
  })

  it('an embedded pending record is the page’s job, not the hand-back’s', async () => {
    savePendingLinkSession({
      sessionId: 's-e1',
      linkToken: 'link-1',
      mode: 'embedded',
      expiresAt: '2099-01-01T00:00:00Z',
    })
    render(<PlaidHandBack />)
    await foreground()
    expect(aggregation.completeLinkSession).not.toHaveBeenCalled()
  })
})
