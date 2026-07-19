// @vitest-environment jsdom
// T019 (spec 024, US1) — Settings › Linked banks: dark-until-configured
// (FR-012), disclosure before connecting (FR-002), embedded Link happy path,
// calm abandon (US1-3), calm failures (FR-013), and the list of linked
// institutions + accounts (FR-007/008).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react'
import type { LinkedAccount, LinkedInstitution } from '@/lib/types'
import { PENDING_LINK_SESSION_KEY } from '@/lib/plaidLinkSession'

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

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))

const store = vi.hoisted(() => ({
  linkedInstitutions: [] as LinkedInstitution[],
  linkedAccounts: [] as LinkedAccount[],
  refreshLinkedBanks: vi.fn(),
  users: [
    { id: 'u-me', name: 'Maya', initial: 'M', color_key: 'sage', created_at: '2026-01-01T00:00:00Z' },
  ],
  locale: 'en-US',
}))
vi.mock('@/lib/store', () => ({
  useApp: () => ({
    ...store,
    t: (key: string, ...args: Array<string | number>) =>
      args.length ? key.replace(/\{(\d+)\}/g, (m, i) => String(args[Number(i)] ?? m)) : key,
  }),
}))

import { LinkedBanks } from '@/components/settings/LinkedBanks'

const INSTITUTION: LinkedInstitution = {
  id: 'li-1',
  household_id: 'hh-1',
  provider: 'plaid',
  provider_item_id: 'item-1',
  provider_institution_id: 'ins_1',
  institution_name: 'First Platypus Bank',
  status: 'active',
  created_by: 'u-me',
  created_at: '2026-07-10T00:00:00Z',
  updated_at: '2026-07-10T00:00:00Z',
  disconnected_at: null,
  last_synced_at: null,
  last_manual_refresh_at: null,
  sync_cursor: null,
}

const ACCOUNT: LinkedAccount = {
  id: 'la-1',
  institution_id: 'li-1',
  provider_account_id: 'acc-1',
  name: 'Plaid Checking',
  official_name: null,
  mask: '0000',
  account_type: 'depository',
  account_subtype: 'checking',
  currency: null,
  created_at: '2026-07-10T00:00:00Z',
}

const SESSION = {
  sessionId: 's-1',
  linkToken: 'link-sandbox-1',
  expiresAt: '2099-01-01T00:30:00Z',
}

const OUTCOME = {
  institution: {
    id: 'li-1',
    provider: 'plaid',
    institutionName: 'First Platypus Bank',
    status: 'active',
    createdBy: 'u-me',
    createdAt: '2026-07-10T00:00:00Z',
  },
  accounts: [],
}

beforeEach(() => {
  aggregation.checkLinkingAvailable.mockResolvedValue({ ok: true, value: { configured: true } })
  aggregation.createLinkSession.mockResolvedValue({ ok: true, value: SESSION })
  aggregation.completeLinkSession.mockResolvedValue({ ok: true, value: OUTCOME })
  store.refreshLinkedBanks.mockResolvedValue(true)
  store.linkedInstitutions = []
  store.linkedAccounts = []
  plaidLink.config = null
  plaidLink.open.mockReset()
})
afterEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

async function mounted() {
  const view = render(<LinkedBanks />)
  await waitFor(() => expect(aggregation.checkLinkingAvailable).toHaveBeenCalled())
  return view
}

describe('FR-012 — dark until the operator configures the provider', () => {
  it('unconfigured: calm placeholder, no connect affordance, no error tone', async () => {
    aggregation.checkLinkingAvailable.mockResolvedValue({ ok: false, code: 'not_configured' })
    await mounted()
    expect(await screen.findByText('Bank linking isn’t available yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Connect a bank' })).not.toBeInTheDocument()
    expect(document.querySelector('.text-destructive')).toBeNull()
  })

  it('a household-less visitor gets the membership line, not a doomed button', async () => {
    aggregation.checkLinkingAvailable.mockResolvedValue({
      ok: false,
      code: 'not_household_member',
    })
    await mounted()
    expect(
      await screen.findByText('You need to be in a household to link a bank.')
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Connect a bank' })).not.toBeInTheDocument()
  })

  it('configured: disclosure + an enabled Connect button (FR-002)', async () => {
    await mounted()
    expect(
      await screen.findByText(/Ortho never sees your bank username or password/)
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect a bank' })).toBeEnabled()
  })
})

describe('US1 — embedded connect happy path', () => {
  it('connect → Link opens → onSuccess exchanges → list refreshes, calm confirmation', async () => {
    await mounted()
    fireEvent.click(await screen.findByRole('button', { name: 'Connect a bank' }))

    await waitFor(() => expect(aggregation.createLinkSession).toHaveBeenCalledWith('embedded', 'en'))
    // The pending record exists while Link is in flight.
    await waitFor(() =>
      expect(localStorage.getItem(PENDING_LINK_SESSION_KEY)).not.toBeNull()
    )
    // Link auto-opens once ready with the issued token.
    await waitFor(() => expect(plaidLink.open).toHaveBeenCalled())
    expect(plaidLink.config?.token).toBe('link-sandbox-1')

    await act(async () => {
      plaidLink.config!.onSuccess('public-sandbox-9', {})
    })
    await waitFor(() =>
      expect(aggregation.completeLinkSession).toHaveBeenCalledWith('s-1', 'public-sandbox-9')
    )
    expect(store.refreshLinkedBanks).toHaveBeenCalled()
    expect(await screen.findByText('Bank connected.')).toBeInTheDocument()
    expect(localStorage.getItem(PENDING_LINK_SESSION_KEY)).toBeNull()
  })

  it('abandoning Link leaves the page unchanged — record cleared, no alarm (US1-3)', async () => {
    await mounted()
    fireEvent.click(await screen.findByRole('button', { name: 'Connect a bank' }))
    await waitFor(() => expect(plaidLink.open).toHaveBeenCalled())

    await act(async () => {
      plaidLink.config!.onExit(null, {})
    })
    expect(localStorage.getItem(PENDING_LINK_SESSION_KEY)).toBeNull()
    expect(aggregation.completeLinkSession).not.toHaveBeenCalled()
    expect(screen.queryByText('Bank connected.')).not.toBeInTheDocument()
    // The affordance is immediately available again.
    expect(screen.getByRole('button', { name: 'Connect a bank' })).toBeEnabled()
  })
})

describe('FR-013 — failures are one calm line, never red, always retryable', () => {
  it('link-token failure surfaces the localized unreachable line', async () => {
    aggregation.createLinkSession.mockResolvedValue({ ok: false, code: 'provider_unreachable' })
    await mounted()
    fireEvent.click(await screen.findByRole('button', { name: 'Connect a bank' }))
    expect(
      await screen.findByText('Couldn’t reach the bank-connection service. Try again in a bit.')
    ).toBeInTheDocument()
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Couldn’t reach the bank-connection service. Try again in a bit.')
    expect(document.querySelector('.text-destructive')).toBeNull()
    expect(screen.getByRole('button', { name: 'Connect a bank' })).toBeEnabled()
  })

  it('exchange failure surfaces the retry line and keeps the page usable', async () => {
    aggregation.completeLinkSession.mockResolvedValue({ ok: false, code: 'exchange_failed' })
    await mounted()
    fireEvent.click(await screen.findByRole('button', { name: 'Connect a bank' }))
    await waitFor(() => expect(plaidLink.open).toHaveBeenCalled())
    await act(async () => {
      plaidLink.config!.onSuccess('public-1', {})
    })
    expect(
      await screen.findByText('The connection could not be completed. Try again.')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect a bank' })).toBeEnabled()
  })
})

describe('US3 — disconnect (provider-first revoke, confirm step, calm failure)', () => {
  beforeEach(() => {
    store.linkedInstitutions = [INSTITUTION]
    store.linkedAccounts = [ACCOUNT]
    aggregation.disconnectInstitution.mockResolvedValue({
      ok: true,
      value: { institutionId: 'li-1', status: 'disconnected' },
    })
  })

  it('asks before disconnecting; cancel backs out without a call', async () => {
    await mounted()
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }))
    expect(screen.getByText('Disconnect this bank?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(aggregation.disconnectInstitution).not.toHaveBeenCalled()
    expect(screen.queryByText('Disconnect this bank?')).not.toBeInTheDocument()
  })

  it('confirm step announces the prompt and moves focus to the confirm action (a11y)', async () => {
    await mounted()
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }))
    // The prompt is an announced group, not a bare span…
    const group = screen.getByRole('group', { name: 'Disconnect this bank?' })
    // …and focus follows into it (autoFocus) instead of dropping to <body> when
    // the trigger button unmounts.
    expect(within(group).getByRole('button', { name: 'Disconnect' })).toHaveFocus()
  })

  it('confirm revokes at the provider and refreshes the household lists', async () => {
    await mounted()
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }))
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    await waitFor(() =>
      expect(aggregation.disconnectInstitution).toHaveBeenCalledWith('li-1', 'plaid')
    )
    expect(store.refreshLinkedBanks).toHaveBeenCalled()
    expect(await screen.findByText('Bank disconnected.')).toBeInTheDocument()
  })

  it('an unreachable provider changes nothing: calm retry line, bank still listed', async () => {
    aggregation.disconnectInstitution.mockResolvedValue({
      ok: false,
      code: 'provider_unreachable',
    })
    await mounted()
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }))
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    expect(
      await screen.findByText('Couldn’t reach the bank-connection service. Try again in a bit.')
    ).toBeInTheDocument()
    expect(screen.getByText('First Platypus Bank')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeEnabled()
    expect(document.querySelector('.text-destructive')).toBeNull()
  })

  it('other failures surface the disconnect retry line', async () => {
    aggregation.disconnectInstitution.mockResolvedValue({
      ok: false,
      code: 'disconnect_failed',
    })
    await mounted()
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }))
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    expect(
      await screen.findByText('Disconnecting didn’t go through. Try again.')
    ).toBeInTheDocument()
  })
})

describe('FR-007/008 — the household list', () => {
  it('renders active institutions with their accounts (name, mask, type)', async () => {
    store.linkedInstitutions = [INSTITUTION]
    store.linkedAccounts = [ACCOUNT]
    await mounted()
    expect(await screen.findByText('First Platypus Bank')).toBeInTheDocument()
    expect(screen.getByText('Plaid Checking')).toBeInTheDocument()
    expect(screen.getByText('•••• 0000 · checking')).toBeInTheDocument()
  })

  it('shows who connected it and when, for ANY household member (US4)', async () => {
    store.linkedInstitutions = [INSTITUTION]
    store.linkedAccounts = [ACCOUNT]
    await mounted()
    // created_by u-me resolves through the household users list; the date
    // renders in the viewer's locale.
    expect(await screen.findByText('Connected by Maya · Jul 10, 2026')).toBeInTheDocument()
  })

  it('hides disconnected institutions and their accounts from the active list (US3-3)', async () => {
    store.linkedInstitutions = [
      { ...INSTITUTION, status: 'disconnected', disconnected_at: '2026-07-15T00:00:00Z' },
    ]
    store.linkedAccounts = [ACCOUNT]
    await mounted()
    expect(screen.queryByText('First Platypus Bank')).not.toBeInTheDocument()
    expect(screen.queryByText('Plaid Checking')).not.toBeInTheDocument()
  })
})
