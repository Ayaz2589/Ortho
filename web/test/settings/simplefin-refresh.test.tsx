// @vitest-environment jsdom
// Spec 028 (US2) — a SimpleFIN institution row offers a rate-limited "Refresh now"
// that syncs transactions; success shows the imported count, rate_limited is a calm
// line. Plaid institutions show no refresh button.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import type { LinkedAccount, LinkedInstitution } from '@/lib/types'

const aggregation = vi.hoisted(() => ({
  checkLinkingAvailable: vi.fn(),
  createLinkSession: vi.fn(),
  completeLinkSession: vi.fn(),
  disconnectInstitution: vi.fn(),
  syncInstitution: vi.fn(),
  claimSimpleFinToken: vi.fn(),
}))
vi.mock('@/lib/aggregation', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/aggregation')>()
  return { ...real, ...aggregation }
})
vi.mock('react-plaid-link', () => ({
  usePlaidLink: () => ({ open: vi.fn(), ready: true, exit: vi.fn(), error: null }),
}))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))

const store = vi.hoisted(() => ({
  linkedInstitutions: [] as LinkedInstitution[],
  linkedAccounts: [] as LinkedAccount[],
  refreshLinkedBanks: vi.fn(),
  users: [{ id: 'u-me', name: 'Maya', initial: 'M', color_key: 'sage', created_at: '2026-01-01T00:00:00Z' }],
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

const SFIN: LinkedInstitution = {
  id: 'li-sf', household_id: 'hh-1', provider: 'simplefin', provider_item_id: 'sfin_x',
  provider_institution_id: null, institution_name: 'Demo Bank', status: 'active',
  created_by: 'u-me', created_at: '2026-07-10T00:00:00Z', updated_at: '2026-07-10T00:00:00Z',
  disconnected_at: null, last_synced_at: null, last_manual_refresh_at: null, sync_cursor: null,
}

beforeEach(() => {
  aggregation.checkLinkingAvailable.mockResolvedValue({ ok: true, value: { configured: true } })
  aggregation.syncInstitution.mockResolvedValue({
    ok: true,
    value: { institutionId: 'li-sf', imported: 3, updated: 1, warnings: [] },
  })
  store.refreshLinkedBanks.mockResolvedValue(true)
  store.linkedInstitutions = [SFIN]
  store.linkedAccounts = []
})
afterEach(() => vi.clearAllMocks())

async function mounted() {
  render(<LinkedBanks />)
  await waitFor(() => expect(aggregation.checkLinkingAvailable).toHaveBeenCalled())
}

describe('US2 — SimpleFIN manual refresh', () => {
  it('refreshes and reports the imported+updated count, then reloads the list', async () => {
    await mounted()
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh now' }))
    await waitFor(() =>
      expect(aggregation.syncInstitution).toHaveBeenCalledWith('li-sf', { manual: true })
    )
    expect(await screen.findByText('Updated 4 transactions.')).toBeInTheDocument()
    expect(store.refreshLinkedBanks).toHaveBeenCalled()
  })

  it('shows a calm line when the refresh is rate-limited (never an error)', async () => {
    aggregation.syncInstitution.mockResolvedValue({ ok: false, code: 'rate_limited' })
    await mounted()
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh now' }))
    expect(await screen.findByText('Just updated — try again in a little while.')).toBeInTheDocument()
    expect(document.querySelector('.text-destructive')).toBeNull()
  })

  it('routes disconnect through the SimpleFIN provider', async () => {
    aggregation.disconnectInstitution.mockResolvedValue({ ok: true, value: { institutionId: 'li-sf', status: 'disconnected' } })
    await mounted()
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }))
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    await waitFor(() =>
      expect(aggregation.disconnectInstitution).toHaveBeenCalledWith('li-sf', 'simplefin')
    )
  })

  it('shows no refresh button for a Plaid institution', async () => {
    store.linkedInstitutions = [{ ...SFIN, id: 'li-p', provider: 'plaid' }]
    await mounted()
    expect(screen.queryByRole('button', { name: 'Refresh now' })).not.toBeInTheDocument()
  })
})
