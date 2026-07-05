// @vitest-environment jsdom
/**
 * Spec 017 US2/US3/US6 — bootstrap choice, join-with-code redemption, the
 * identity claim, and deterministic household selection. Store-level contracts
 * against the mocked client (zero network) with the REAL AppStateProvider.
 * (Gate/claim UI assertions live alongside once the components exist — T011/T014.)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, act, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeSupabaseMock, primeFxCache, stubNoNetwork, type SupabaseMock } from './helpers/supabase-mock'

const h = vi.hoisted(() => ({ mock: null as SupabaseMock | null, replace: vi.fn(), refresh: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => h.mock!.client }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: h.replace, refresh: h.refresh }),
}))

import { AppStateProvider, useApp } from '@/lib/store'
import { HouseholdGate } from '@/components/HouseholdGate'
import JoinPage from '@/app/(app)/join/page'

const ISO1 = '2026-01-01T00:00:00Z'
const ISO2 = '2026-02-01T00:00:00Z'

/** A brand-new signed-in user: profile exists, NO memberships anywhere. */
function freshUserDataset(extra: Record<string, unknown[]> = {}) {
  return {
    authUser: { id: 'u-new', email: 'partner@example.com' },
    tables: {
      users: [{ id: 'u-new', name: 'Ben', initial: 'B', color_key: 'sage', created_at: ISO1 }],
      household_members: [],
      household_people: [],
      households: [],
      transactions: [], transaction_shares: [], cards: [], properties: [],
      mortgage_info: [], lease_info: [], units: [], rental_payments: [], budgets: [],
      pending_invites: [],
      ...extra,
    },
  }
}

/** An established two-household user (u-multi belongs to hh-1 then hh-2). */
function multiHouseholdDataset() {
  return {
    authUser: { id: 'u-multi', email: 'multi@example.com' },
    tables: {
      users: [{ id: 'u-multi', name: 'Ava', initial: 'A', color_key: 'sage', created_at: ISO1 }],
      household_members: [
        { household_id: 'hh-1', user_id: 'u-multi', role: 'owner', created_at: ISO1 },
        { household_id: 'hh-2', user_id: 'u-multi', role: 'member', created_at: ISO2 },
      ],
      household_people: [
        { id: 'p-1', household_id: 'hh-1', name: 'Ava', initial: 'A', color_key: 'sage', linked_user_id: 'u-multi', sort_order: 0, removed_at: null, created_at: ISO1 },
      ],
      households: [
        { id: 'hh-1', owner_id: 'u-multi', name: 'Mine', created_at: ISO1 },
        { id: 'hh-2', owner_id: 'u-other', name: 'Ours', created_at: ISO2 },
      ],
      transactions: [], transaction_shares: [], cards: [], properties: [],
      mortgage_info: [], lease_info: [], units: [], rental_payments: [], budgets: [],
      pending_invites: [],
    },
  }
}

let api: ReturnType<typeof useApp>
function Capture() {
  api = useApp()
  return null
}

async function renderStore() {
  render(
    <AppStateProvider>
      <Capture />
    </AppStateProvider>
  )
  await waitFor(() => expect(api.loading).toBe(false))
}

beforeEach(() => {
  stubNoNetwork()
  primeFxCache()
  h.replace.mockClear()
  h.refresh.mockClear()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('bootstrap choice for a fresh user (US2/US6)', () => {
  it('(a) zero memberships → membershipStatus none, NO silent household create', async () => {
    h.mock = makeSupabaseMock(freshUserDataset())
    await renderStore()

    expect(api.membershipStatus).toBe('none')
    // Nothing was written anywhere — the choice belongs to the user (FR-008).
    expect(h.mock!.calls).toHaveLength(0)
    expect(api.currentHousehold).toBeNull()
    // Signed-in identity is available for the gate to use.
    expect(api.currentUserId).toBe('u-new')
  })

  it('(b) startFresh reproduces the pre-017 create sequence exactly', async () => {
    h.mock = makeSupabaseMock(freshUserDataset())
    await renderStore()

    await act(async () => {
      await api.startFresh()
    })
    await waitFor(() => expect(api.membershipStatus).toBe('member'))

    // spec 017 FR-024: today's exact insert order — household, owner
    // membership, then the account holder's linked Person row.
    const writes = h.mock!.calls.map((c) => `${c.table}:${c.op}`)
    expect(writes.slice(0, 3)).toEqual([
      'households:insert',
      'household_members:insert',
      'household_people:insert',
    ])
    const membership = h.mock!.callsFor('household_members')[0].payload as Record<string, unknown>
    expect(membership.role).toBe('owner')
    expect(membership.user_id).toBe('u-new')
    const person = h.mock!.callsFor('household_people')[0].payload as Record<string, unknown>
    expect(person.linked_user_id).toBe('u-new')
    expect(person.sort_order).toBe(0)

    expect(api.currentRole).toBe('owner')
    expect(api.currentHousehold).not.toBeNull()
    // The new household becomes the persisted preference (FR-019).
    expect(localStorage.getItem('preferredHouseholdId')).toBe(api.currentHousehold!.id)
  })

  it('(c) redeemInvite success joins, persists the preference, and loads the household', async () => {
    h.mock = makeSupabaseMock({ ...freshUserDataset({
      households: [{ id: 'hh-9', owner_id: 'u-owner', name: 'Ours', created_at: ISO1 }],
      household_people: [
        { id: 'p-owner', household_id: 'hh-9', name: 'Ava', initial: 'A', color_key: 'sage', linked_user_id: 'u-owner', sort_order: 0, removed_at: null, created_at: ISO1 },
      ],
    }), rpc: { accept_invite: 'hh-9' } })
    await renderStore()
    expect(api.membershipStatus).toBe('none')

    let result: Awaited<ReturnType<typeof api.redeemInvite>>
    await act(async () => {
      result = await api.redeemInvite('abcde-23456')
    })
    expect(result!).toEqual({ ok: true, householdId: 'hh-9' })

    // The RPC received the CANONICAL token, never the display form (contract §4).
    expect(h.mock!.rpcCalls).toEqual([
      { name: 'accept_invite', params: { p_token: 'ABCDE23456' } },
    ])

    await waitFor(() => expect(api.membershipStatus).toBe('member'))
    expect(api.currentHousehold?.id).toBe('hh-9')
    expect(api.currentRole).toBe('member')
    expect(localStorage.getItem('preferredHouseholdId')).toBe('hh-9')
    // No local household create happened.
    expect(h.mock!.callsFor('households')).toHaveLength(0)
  })

  it('(d) an invalid/expired/redeemed code fails calmly with reason invalid', async () => {
    h.mock = makeSupabaseMock({
      ...freshUserDataset(),
      rpcErrors: { accept_invite: new Error('Invite is invalid, redeemed, or expired') },
    })
    await renderStore()

    let result: Awaited<ReturnType<typeof api.redeemInvite>>
    await act(async () => {
      result = await api.redeemInvite('ZZZZZ-ZZZZZ')
    })
    expect(result!).toEqual({ ok: false, reason: 'invalid' })
    // No partial join: still no membership, still the gate.
    expect(api.membershipStatus).toBe('none')
    expect(api.currentHousehold).toBeNull()
  })

  it('(d2) a malformed code short-circuits without calling the RPC', async () => {
    h.mock = makeSupabaseMock(freshUserDataset())
    await renderStore()

    let result: Awaited<ReturnType<typeof api.redeemInvite>>
    await act(async () => {
      result = await api.redeemInvite('nope')
    })
    expect(result!).toEqual({ ok: false, reason: 'invalid' })
    expect(h.mock!.rpcCalls).toHaveLength(0)
  })

  it('(e) redeeming a code for a household you already belong to reports already-member', async () => {
    h.mock = makeSupabaseMock({ ...multiHouseholdDataset(), rpc: { accept_invite: 'hh-1' } })
    await renderStore()
    expect(api.membershipStatus).toBe('member')

    let result: Awaited<ReturnType<typeof api.redeemInvite>>
    await act(async () => {
      result = await api.redeemInvite('abcde-23456')
    })
    expect(result!).toEqual({ ok: false, reason: 'already-member' })
    // Membership and current household unchanged.
    expect(api.currentHousehold?.id).toBe('hh-1')
  })
})

describe('deterministic household selection (US6, FR-018)', () => {
  it('(f1) a valid persisted preference wins', async () => {
    localStorage.setItem('preferredHouseholdId', 'hh-2')
    h.mock = makeSupabaseMock(multiHouseholdDataset())
    await renderStore()

    expect(api.currentHousehold?.id).toBe('hh-2')
    expect(api.currentRole).toBe('member')
  })

  it('(f2) a stale preference falls back to the oldest membership', async () => {
    localStorage.setItem('preferredHouseholdId', 'hh-gone')
    h.mock = makeSupabaseMock(multiHouseholdDataset())
    await renderStore()

    expect(api.currentHousehold?.id).toBe('hh-1')
    expect(api.currentRole).toBe('owner')
  })

  it('(f3) no preference picks the oldest membership and persists it', async () => {
    h.mock = makeSupabaseMock(multiHouseholdDataset())
    await renderStore()

    expect(api.currentHousehold?.id).toBe('hh-1')
    expect(localStorage.getItem('preferredHouseholdId')).toBe('hh-1')
  })

  it('household-scoped reads are issued for the multi-household user (no cross-household merge)', async () => {
    localStorage.setItem('preferredHouseholdId', 'hh-2')
    h.mock = makeSupabaseMock(multiHouseholdDataset())
    await renderStore()

    // Contract-level assertion (the permissive mock returns rows regardless):
    // cards/budgets/properties reads carry the household filter; transactions
    // keep legacy personal (null-household) rows visible via the disjunction.
    expect(h.mock!.filtersFor('cards')).toContainEqual({ table: 'cards', kind: 'eq', args: ['household_id', 'hh-2'] })
    expect(h.mock!.filtersFor('budgets')).toContainEqual({ table: 'budgets', kind: 'eq', args: ['household_id', 'hh-2'] })
    expect(h.mock!.filtersFor('properties')).toContainEqual({ table: 'properties', kind: 'eq', args: ['household_id', 'hh-2'] })
    expect(h.mock!.filtersFor('transactions')).toContainEqual({
      table: 'transactions',
      kind: 'or',
      args: ['household_id.eq.hh-2,household_id.is.null'],
    })
  })
})

describe('HouseholdGate UI (US2)', () => {
  async function renderGate() {
    render(
      <AppStateProvider>
        <Capture />
        <HouseholdGate />
      </AppStateProvider>
    )
    await waitFor(() => expect(api.loading).toBe(false))
  }

  it('offers Join with a code / Start fresh, and Start fresh creates the household', async () => {
    h.mock = makeSupabaseMock(freshUserDataset())
    const user = userEvent.setup()
    await renderGate()

    expect(screen.getByRole('button', { name: 'Join with a code' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start fresh' })).toBeTruthy()
    // A quiet way out is always present.
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Start fresh' }))
    await waitFor(() => expect(api.membershipStatus).toBe('member'))
    expect(api.currentRole).toBe('owner')
  })

  it('joins with a typed code and shows calm copy for an invalid one', async () => {
    h.mock = makeSupabaseMock({
      ...freshUserDataset({
        households: [{ id: 'hh-9', owner_id: 'u-owner', name: 'Ours', created_at: ISO1 }],
      }),
      rpcErrors: { accept_invite: new Error('Invite is invalid, redeemed, or expired') },
    })
    const user = userEvent.setup()
    await renderGate()

    await user.click(screen.getByRole('button', { name: 'Join with a code' }))
    const input = screen.getByLabelText('Invite code')
    await user.type(input, 'ABCDE-23456')
    await user.click(screen.getByRole('button', { name: 'Join' }))

    // The RPC failed → the single calm failure message, and the user can retry.
    expect(await screen.findByText('That code is invalid, already used, or expired.')).toBeTruthy()
    expect(api.membershipStatus).toBe('none')
    expect(screen.getByLabelText('Invite code')).toBeTruthy()
  })

  it('prefills the code from a /join?code= URL', async () => {
    window.history.pushState({}, '', '/join?code=ABCDE-23456')
    h.mock = makeSupabaseMock(freshUserDataset())
    await renderGate()

    const input = (await screen.findByLabelText('Invite code')) as HTMLInputElement
    expect(input.value).toBe('ABCDE-23456')
    window.history.pushState({}, '', '/')
  })
})

/** A member-role joiner mid-claim: hh-9's roster has the owner (linked), the
 *  unclaimed partner row with history, and a removed unclaimed row. */
function joinerDataset(extra: Partial<Record<string, unknown>> = {}) {
  return {
    authUser: { id: 'u-partner', email: 'partner@example.com' },
    tables: {
      users: [
        { id: 'u-owner', name: 'Ava', initial: 'A', color_key: 'sage', created_at: ISO1 },
        { id: 'u-partner', name: 'Ben', initial: 'B', color_key: 'slate', created_at: ISO2 },
      ],
      household_members: [
        { household_id: 'hh-9', user_id: 'u-partner', role: 'member', created_at: ISO2 },
      ],
      household_people: [
        { id: 'p-owner', household_id: 'hh-9', name: 'Ava', initial: 'A', color_key: 'sage', linked_user_id: 'u-owner', sort_order: 0, removed_at: null, created_at: ISO1 },
        { id: 'p-partner', household_id: 'hh-9', name: 'Partner', initial: 'P', color_key: 'slate', linked_user_id: null, sort_order: 1, removed_at: null, created_at: ISO1 },
        { id: 'p-old', household_id: 'hh-9', name: 'Old Roommate', initial: 'O', color_key: 'sand', linked_user_id: null, sort_order: 2, removed_at: ISO2, created_at: ISO1 },
      ],
      households: [{ id: 'hh-9', owner_id: 'u-owner', name: 'Ours', created_at: ISO1 }],
      transactions: [], transaction_shares: [], cards: [], properties: [],
      mortgage_info: [], lease_info: [], units: [], rental_payments: [], budgets: [],
      pending_invites: [],
    },
    ...extra,
  }
}

describe('identity claim (US3, FR-014/015/016/017)', () => {
  it('a member with no linked person needs the claim; an owner never does', async () => {
    h.mock = makeSupabaseMock(joinerDataset())
    await renderStore()
    expect(api.currentRole).toBe('member')
    expect(api.needsPersonClaim).toBe(true)
    // Crucially: NO person row was auto-created for the member (that is the
    // owner-only pre-017 behavior).
    expect(h.mock!.callsFor('household_people')).toHaveLength(0)
  })

  it('claiming an unlinked person links it, flips the gate, and attributes history', async () => {
    h.mock = makeSupabaseMock({
      ...joinerDataset(),
      updateResults: { household_people: [{ id: 'p-partner' }] },
    })
    await renderStore()

    let result: Awaited<ReturnType<typeof api.claimPerson>>
    await act(async () => {
      result = await api.claimPerson({ personId: 'p-partner' })
    })
    expect(result!).toEqual({ ok: true })

    // The guarded update: linked_user_id set, scoped to the row, only-if-null.
    const upd = h.mock!.callsFor('household_people').find((c) => c.op === 'update')!
    expect(upd.payload).toEqual({ linked_user_id: 'u-partner' })
    expect(h.mock!.filtersFor('household_people')).toContainEqual({ table: 'household_people', kind: 'eq', args: ['id', 'p-partner'] })
    expect(h.mock!.filtersFor('household_people')).toContainEqual({ table: 'household_people', kind: 'is', args: ['linked_user_id', null] })

    expect(api.needsPersonClaim).toBe(false)
    // History attribution is immediate: the claimed person IS the current person.
    expect(api.currentPersonId).toBe('p-partner')
  })

  it('a lost claim race reports taken and refreshes the roster', async () => {
    h.mock = makeSupabaseMock({
      ...joinerDataset(),
      updateResults: { household_people: [] }, // 0 rows matched — someone else won
    })
    await renderStore()

    let result: Awaited<ReturnType<typeof api.claimPerson>>
    await act(async () => {
      result = await api.claimPerson({ personId: 'p-partner' })
    })
    expect(result!).toEqual({ ok: false, reason: 'taken' })
    expect(api.needsPersonClaim).toBe(true)
  })

  it('continue-as-new inserts a linked person and completes the claim', async () => {
    h.mock = makeSupabaseMock(joinerDataset())
    await renderStore()

    let result: Awaited<ReturnType<typeof api.claimPerson>>
    await act(async () => {
      result = await api.claimPerson({ name: 'Ben', colorKey: 'slate' })
    })
    expect(result!).toEqual({ ok: true })

    const ins = h.mock!.callsFor('household_people').find((c) => c.op === 'insert')!
    const payload = ins.payload as Record<string, unknown>
    expect(payload.linked_user_id).toBe('u-partner')
    expect(payload.name).toBe('Ben')
    expect(payload.household_id).toBe('hh-9')
    expect(api.needsPersonClaim).toBe(false)
  })

  it('the claim gate offers ONLY unlinked, active people', async () => {
    h.mock = makeSupabaseMock({
      ...joinerDataset(),
      updateResults: { household_people: [{ id: 'p-partner' }] },
    })
    const user = userEvent.setup()
    render(
      <AppStateProvider>
        <Capture />
        <HouseholdGate />
      </AppStateProvider>
    )
    await waitFor(() => expect(api.loading).toBe(false))

    // The claim step is shown (not the join/start-fresh choice).
    expect(await screen.findByText('Who are you in this household?')).toBeTruthy()
    // Offered: the unclaimed active person. Not offered: the linked owner, the removed row.
    expect(screen.getByRole('button', { name: 'Partner' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ava' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Old Roommate' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Continue as a new person' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Partner' }))
    await waitFor(() => expect(api.needsPersonClaim).toBe(false))
  })
})

describe('/join page for an already-signed-in member (US2, FR-009)', () => {
  async function renderJoin() {
    render(
      <AppStateProvider>
        <Capture />
        <JoinPage />
      </AppStateProvider>
    )
    await waitFor(() => expect(api.loading).toBe(false))
  }

  it('confirms and redeems the linked code, then routes to the dashboard', async () => {
    window.history.pushState({}, '', '/join?code=ABCDE-23456')
    h.mock = makeSupabaseMock({ ...multiHouseholdDataset(), rpc: { accept_invite: 'hh-new' } })
    const ds = h.mock // keep
    void ds
    const user = userEvent.setup()
    await renderJoin()

    // The code is shown for confirmation; joining is an explicit act.
    const input = (await screen.findByLabelText('Invite code')) as HTMLInputElement
    expect(input.value).toBe('ABCDE-23456')
    await user.click(screen.getByRole('button', { name: 'Join' }))

    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/dashboard'))
    expect(api.currentHousehold?.id).toBe('hh-new')
    window.history.pushState({}, '', '/')
  })

  it('tells an existing member calmly that they already belong', async () => {
    window.history.pushState({}, '', '/join?code=ABCDE-23456')
    h.mock = makeSupabaseMock({ ...multiHouseholdDataset(), rpc: { accept_invite: 'hh-1' } })
    const user = userEvent.setup()
    await renderJoin()

    await user.click(await screen.findByRole('button', { name: 'Join' }))
    expect(await screen.findByText("You're already a member of this household.")).toBeTruthy()
    expect(h.replace).not.toHaveBeenCalledWith('/dashboard')
    window.history.pushState({}, '', '/')
  })

  it('shows the calm invalid copy and allows a retype', async () => {
    window.history.pushState({}, '', '/join')
    h.mock = makeSupabaseMock({
      ...multiHouseholdDataset(),
      rpcErrors: { accept_invite: new Error('Invite is invalid, redeemed, or expired') },
    })
    const user = userEvent.setup()
    await renderJoin()

    const input = screen.getByLabelText('Invite code')
    await user.type(input, 'ABCDE-23456')
    await user.click(screen.getByRole('button', { name: 'Join' }))
    expect(await screen.findByText('That code is invalid, already used, or expired.')).toBeTruthy()
    expect(screen.getByLabelText('Invite code')).toBeTruthy()
  })
})

describe('existing single-household users are untouched (US6, FR-024)', () => {
  it('boots straight into the household with no gate and no extra writes', async () => {
    const ds = multiHouseholdDataset()
    ds.tables.household_members = [{ household_id: 'hh-1', user_id: 'u-multi', role: 'owner', created_at: ISO1 }]
    h.mock = makeSupabaseMock(ds)
    await renderStore()

    expect(api.membershipStatus).toBe('member')
    expect(api.currentHousehold?.id).toBe('hh-1')
    expect(api.currentRole).toBe('owner')
    expect(h.mock!.callsFor('households')).toHaveLength(0)
    expect(h.mock!.callsFor('household_members')).toHaveLength(0)
  })
})
