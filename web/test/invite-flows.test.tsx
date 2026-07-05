// @vitest-environment jsdom
/**
 * Spec 017 US1/US5 — owner creates, reveals (once), lists, and revokes invites.
 * Store-level flows + the InviteCard component, all against the mocked client
 * (zero network) with the REAL AppStateProvider.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, act, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeSupabaseMock, primeFxCache, stubNoNetwork, type SupabaseMock } from './helpers/supabase-mock'
import { canonicalizeInviteCode, hashInviteCode, INVITE_CODE_LENGTH } from '@/lib/invites'

const h = vi.hoisted(() => ({ mock: null as SupabaseMock | null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => h.mock!.client }))

import { AppStateProvider, useApp } from '@/lib/store'
import { InviteCard } from '@/components/settings/InviteCard'

const DAY = 24 * 60 * 60 * 1000

function dataset(opts: { role?: 'owner' | 'member'; invites?: unknown[] } = {}) {
  const role = opts.role ?? 'owner'
  return {
    authUser: { id: 'u-me', email: 'ava@example.com' },
    tables: {
      users: [{ id: 'u-me', name: 'Ava', initial: 'A', color_key: 'sage', created_at: '2026-01-01T00:00:00Z' }],
      household_members: [{ household_id: 'hh-1', user_id: 'u-me', role, created_at: '2026-01-01T00:00:00Z' }],
      household_people: [
        { id: 'p-me', household_id: 'hh-1', name: 'Ava', initial: 'A', color_key: 'sage', linked_user_id: 'u-me', sort_order: 0, removed_at: null, created_at: '2026-01-01T00:00:00Z' },
      ],
      households: [{ id: 'hh-1', owner_id: 'u-me', name: 'Home', created_at: '2026-01-01T00:00:00Z' }],
      transactions: [], transaction_shares: [], cards: [], properties: [],
      mortgage_info: [], lease_info: [], units: [], rental_payments: [], budgets: [],
      pending_invites: opts.invites ?? [],
    },
  }
}

let api: ReturnType<typeof useApp>
function Capture() {
  api = useApp()
  return null
}

async function renderStore(ui?: React.ReactNode) {
  render(
    <AppStateProvider>
      <Capture />
      {ui}
    </AppStateProvider>
  )
  await waitFor(() => expect(api.loading).toBe(false))
}

beforeEach(() => {
  stubNoNetwork()
  primeFxCache()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('store invite flows (US1/US5)', () => {
  it('createInvite resolves a display-format code and persists role/hash/expiry', async () => {
    h.mock = makeSupabaseMock(dataset())
    await renderStore()
    expect(api.currentRole).toBe('owner')

    const before = Date.now()
    let result: Awaited<ReturnType<typeof api.createInvite>>
    await act(async () => {
      result = await api.createInvite()
    })
    expect(result!.ok).toBe(true)
    const code = (result as { ok: true; code: string }).code
    // Display form XXXXX-XXXXX from the canonical 10-char code.
    expect(code).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/)
    expect(canonicalizeInviteCode(code)).toHaveLength(INVITE_CODE_LENGTH)

    // The optimistic invite is in state, newest first.
    expect(api.invites).toHaveLength(1)
    expect(api.invites[0].role).toBe('member')
    expect(api.invites[0].redeemed_at).toBeNull()

    // The persisted row: member role, 7-day expiry, sha256(canonical) hash,
    // created_by the signed-in owner — and NEVER the raw code.
    const insert = h.mock!.callsFor('pending_invites').find((c) => c.op === 'insert')!
    expect(insert).toBeTruthy()
    const payload = insert.payload as Record<string, unknown>
    expect(payload.household_id).toBe('hh-1')
    expect(payload.role).toBe('member')
    expect(payload.created_by).toBe('u-me')
    expect(payload.token_hash).toBe(await hashInviteCode(canonicalizeInviteCode(code)))
    expect(JSON.stringify(payload)).not.toContain(canonicalizeInviteCode(code))
    const expiresAt = new Date(payload.expires_at as string).getTime()
    expect(expiresAt).toBeGreaterThanOrEqual(before + 7 * DAY - 5000)
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 7 * DAY + 5000)
  })

  it('createInvite rolls back the optimistic row and surfaces the error on insert failure', async () => {
    h.mock = makeSupabaseMock({ ...dataset(), insertErrors: { pending_invites: 'insert denied' } })
    await renderStore()

    let result: Awaited<ReturnType<typeof api.createInvite>>
    await act(async () => {
      result = await api.createInvite()
    })
    expect(result!.ok).toBe(false)
    expect(api.invites).toHaveLength(0)
    await waitFor(() => expect(api.error).not.toBeNull())
  })

  it('loads existing invites from the backend, newest first', async () => {
    h.mock = makeSupabaseMock(
      dataset({
        invites: [
          { id: 'inv-old', household_id: 'hh-1', role: 'member', expires_at: '2026-06-01T00:00:00Z', created_at: '2026-05-25T00:00:00Z', redeemed_at: null, token_hash: 'x' },
          { id: 'inv-new', household_id: 'hh-1', role: 'member', expires_at: '2026-12-31T00:00:00Z', created_at: '2026-07-01T00:00:00Z', redeemed_at: null, token_hash: 'y' },
        ],
      })
    )
    await renderStore()
    expect(api.invites.map((i) => i.id)).toEqual(['inv-new', 'inv-old'])
    // token_hash never crosses into UI state (FR-005).
    expect(Object.keys(api.invites[0])).not.toContain('token_hash')
  })

  it('revokeInvite removes optimistically and rolls back on delete failure', async () => {
    const invites = [
      { id: 'inv-1', household_id: 'hh-1', role: 'member', expires_at: '2026-12-31T00:00:00Z', created_at: '2026-07-01T00:00:00Z', redeemed_at: null, token_hash: 'x' },
    ]
    h.mock = makeSupabaseMock(dataset({ invites }))
    await renderStore()
    expect(api.invites).toHaveLength(1)

    await act(async () => {
      api.revokeInvite('inv-1')
    })
    await waitFor(() => expect(api.invites).toHaveLength(0))
    expect(h.mock!.callsFor('pending_invites').some((c) => c.op === 'delete')).toBe(true)

    // Failure path: rollback + banner.
    h.mock = makeSupabaseMock({ ...dataset({ invites }), deleteErrors: { pending_invites: 'delete denied' } })
    cleanup()
    await renderStore()
    await act(async () => {
      api.revokeInvite('inv-1')
    })
    await waitFor(() => expect(api.error).not.toBeNull())
    expect(api.invites).toHaveLength(1) // restored
  })

  it('a member-role user has an empty invite list', async () => {
    h.mock = makeSupabaseMock(dataset({ role: 'member' }))
    await renderStore()
    expect(api.currentRole).toBe('member')
    expect(api.invites).toEqual([])
  })
})

describe('InviteCard (US1/US5 UI)', () => {
  it('lets the owner create an invite and reveals the code exactly once', async () => {
    h.mock = makeSupabaseMock(dataset())
    const user = userEvent.setup()
    await renderStore(<InviteCard />)

    await user.click(screen.getByRole('button', { name: 'Create invite' }))

    // The one-time reveal: formatted code + the shown-once caption.
    const codeEl = await screen.findByTestId('invite-code-reveal')
    expect(codeEl.textContent).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/)
    expect(screen.getByText('This code is shown only once — copy or share it now.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy()

    // Dismissing the reveal makes the raw code unrecoverable from the UI.
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByTestId('invite-code-reveal')).toBeNull()
    // The invite is listed as pending — with no code shown anywhere.
    expect(screen.getByText('Pending')).toBeTruthy()
  })

  it('shows status per invite: pending with expiry, redeemed, expired', async () => {
    const now = Date.now()
    h.mock = makeSupabaseMock(
      dataset({
        invites: [
          { id: 'inv-p', household_id: 'hh-1', role: 'member', expires_at: new Date(now + 6 * DAY + DAY / 2).toISOString(), created_at: new Date(now - DAY).toISOString(), redeemed_at: null, token_hash: 'a' },
          { id: 'inv-r', household_id: 'hh-1', role: 'member', expires_at: new Date(now + 5 * DAY).toISOString(), created_at: new Date(now - 2 * DAY).toISOString(), redeemed_at: new Date(now - DAY).toISOString(), token_hash: 'b' },
          { id: 'inv-e', household_id: 'hh-1', role: 'member', expires_at: new Date(now - DAY).toISOString(), created_at: new Date(now - 9 * DAY).toISOString(), redeemed_at: null, token_hash: 'c' },
        ],
      })
    )
    await renderStore(<InviteCard />)

    expect(screen.getByText('Pending')).toBeTruthy()
    expect(screen.getByText('Expires in 7 days')).toBeTruthy()
    expect(screen.getByText('Redeemed')).toBeTruthy()
    expect(screen.getByText('Expired')).toBeTruthy()

    // Only the pending invite offers Revoke (redeemed/expired are history).
    expect(screen.getAllByRole('button', { name: 'Revoke' })).toHaveLength(1)
  })

  it('revoke asks for inline confirmation before deleting', async () => {
    const now = Date.now()
    h.mock = makeSupabaseMock(
      dataset({
        invites: [
          { id: 'inv-p', household_id: 'hh-1', role: 'member', expires_at: new Date(now + 5 * DAY).toISOString(), created_at: new Date(now - DAY).toISOString(), redeemed_at: null, token_hash: 'a' },
        ],
      })
    )
    const user = userEvent.setup()
    await renderStore(<InviteCard />)

    await user.click(screen.getByRole('button', { name: 'Revoke' }))
    // No delete yet — confirmation is required.
    expect(h.mock!.callsFor('pending_invites').filter((c) => c.op === 'delete')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Revoke invite' }))
    await waitFor(() =>
      expect(h.mock!.callsFor('pending_invites').filter((c) => c.op === 'delete')).toHaveLength(1)
    )
    await waitFor(() => expect(screen.queryByText('Pending')).toBeNull())
  })

  it('renders nothing for a member-role user', async () => {
    h.mock = makeSupabaseMock(dataset({ role: 'member' }))
    const { container } = render(
      <AppStateProvider>
        <Capture />
        <InviteCard />
      </AppStateProvider>
    )
    await waitFor(() => expect(api.loading).toBe(false))
    expect(container.querySelector('[data-testid="invite-card"]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Create invite' })).toBeNull()
  })
})
