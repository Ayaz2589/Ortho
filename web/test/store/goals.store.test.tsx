// @vitest-environment jsdom
// Spec 027 (US1/US3) — goals + contributions are household data loaded with the
// bootstrap fan-out and mutated optimistically with rollback (the budgets/tx
// precedent). Members read AND write (unlike linked banks).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import {
  makeEntitlement,
  makeSupabaseMock,
  primeFxCache,
  stubNoNetwork,
  type SupabaseMock,
  type SupabaseMockDataset,
} from '../helpers/supabase-mock'
import type { Goal, GoalContribution } from '@/lib/types'

const h = vi.hoisted(() => ({ mock: null as SupabaseMock | null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => h.mock!.client }))

import { AppStateProvider, useApp } from '@/lib/store'

const GOAL: Goal = {
  id: 'goal-1',
  household_id: 'hh-1',
  name: 'Emergency fund',
  kind: 'savings',
  target_cents: 1000000,
  target_date: '2027-01-01',
  linked_account_id: null,
  linked_category: null,
  created_by: 'u-me',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}
const CONTRIB: GoalContribution = {
  id: 'gc-1',
  goal_id: 'goal-1',
  amount_cents: 50000,
  date: '2026-02-01',
  note: null,
  created_by: 'u-me',
  created_at: '2026-02-01T00:00:00Z',
}

function dataset(overrides: Partial<SupabaseMockDataset> = {}): SupabaseMockDataset {
  return {
    authUser: { id: 'u-me', email: 'maya@example.com' },
    tables: {
      users: [{ id: 'u-me', name: 'Maya', initial: 'M', color_key: 'sage', created_at: '2026-01-01T00:00:00Z' }],
      household_members: [{ household_id: 'hh-1', user_id: 'u-me', role: 'owner', created_at: '2026-01-01T00:00:00Z' }],
      household_people: [
        { id: 'p-me', household_id: 'hh-1', name: 'Maya', initial: 'M', color_key: 'sage', linked_user_id: 'u-me', sort_order: 0, removed_at: null, created_at: '2026-01-01T00:00:00Z' },
      ],
      households: [{ id: 'hh-1', owner_id: 'u-me', name: 'Home', created_at: '2026-01-01T00:00:00Z' }],
      transactions: [], transaction_shares: [], cards: [], properties: [],
      mortgage_info: [], lease_info: [], units: [], rental_payments: [], budgets: [],
      entitlements: [makeEntitlement()],
      linked_institutions: [], linked_accounts: [],
      goals: [GOAL],
      goal_contributions: [CONTRIB],
    },
    rpc: { ensure_entitlement: makeEntitlement() },
    ...overrides,
  }
}

let probe: ReturnType<typeof useApp> | null = null
function Probe() {
  probe = useApp()
  return null
}
async function boot(ds: SupabaseMockDataset) {
  h.mock = makeSupabaseMock(ds)
  render(
    <AppStateProvider>
      <Probe />
    </AppStateProvider>
  )
  await waitFor(() => expect(probe?.loading).toBe(false))
}

beforeEach(() => {
  primeFxCache()
  stubNoNetwork()
  probe = null
})
afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('bootstrap loads goals + contributions', () => {
  it('exposes goals and goalContributions via useApp()', async () => {
    await boot(dataset())
    expect(probe!.goals).toEqual([GOAL])
    expect(probe!.goalContributions).toEqual([CONTRIB])
    expect(probe!.bootstrapFailed).toBe(false)
  })

  it('a missing goals table (PGRST205) fails open — empty, not broken', async () => {
    const ds = dataset()
    ds.selectErrors = {
      goals: { message: 'missing', code: 'PGRST205' },
      goal_contributions: { message: 'missing', code: 'PGRST205' },
    }
    await boot(ds)
    expect(probe!.bootstrapFailed).toBe(false)
    expect(probe!.goals).toEqual([])
    expect(probe!.currentHousehold?.id).toBe('hh-1')
  })
})

describe('goal CRUD is optimistic with rollback', () => {
  const NEW: Goal = { ...GOAL, id: 'goal-2', name: 'Trip', target_cents: 200000, target_date: null }

  it('addGoal shows immediately and writes to goals', async () => {
    await boot(dataset())
    await act(async () => { probe!.addGoal(NEW) })
    expect(probe!.goals.map((g) => g.id)).toContain('goal-2')
    expect(h.mock!.callsFor('goals').some((c) => c.op === 'insert')).toBe(true)
  })

  it('addGoal rolls back on write error', async () => {
    await boot(dataset({ insertErrors: { goals: 'denied' } } as Partial<SupabaseMockDataset>))
    await act(async () => { probe!.addGoal(NEW) })
    await waitFor(() => expect(probe!.goals.map((g) => g.id)).not.toContain('goal-2'))
    expect(probe!.error).toBeTruthy()
  })

  it('updateGoal changes the target (US3)', async () => {
    await boot(dataset())
    await act(async () => { probe!.updateGoal({ ...GOAL, target_cents: 2000000 }) })
    expect(probe!.goals.find((g) => g.id === 'goal-1')!.target_cents).toBe(2000000)
  })

  it('updateGoal rolls back the target on write error', async () => {
    await boot(dataset({ updateErrors: { goals: 'denied' } } as Partial<SupabaseMockDataset>))
    await act(async () => { probe!.updateGoal({ ...GOAL, target_cents: 2000000 }) })
    await waitFor(() => expect(probe!.goals.find((g) => g.id === 'goal-1')!.target_cents).toBe(1000000))
    expect(probe!.error).toBeTruthy()
  })

  it('deleteGoal removes the goal and its contributions from state', async () => {
    await boot(dataset())
    await act(async () => { probe!.deleteGoal('goal-1') })
    expect(probe!.goals).toEqual([])
    expect(probe!.goalContributions.filter((c) => c.goal_id === 'goal-1')).toEqual([])
  })

  it('addContribution then deleteContribution updates saved', async () => {
    await boot(dataset())
    const c2: GoalContribution = { ...CONTRIB, id: 'gc-2', amount_cents: 25000 }
    await act(async () => { probe!.addContribution(c2) })
    expect(probe!.goalContributions.map((c) => c.id)).toContain('gc-2')
    await act(async () => { probe!.deleteContribution('gc-2') })
    expect(probe!.goalContributions.map((c) => c.id)).not.toContain('gc-2')
  })
})

// ── spec 045 US3: a contribution can be corrected, not only added or dropped ────
describe('updateContribution is optimistic with rollback', () => {
  it('applies the corrected amount immediately', async () => {
    await boot(dataset())
    await act(async () => { probe!.updateContribution({ ...CONTRIB, amount_cents: 75000 }) })
    expect(probe!.goalContributions.find((c) => c.id === 'gc-1')!.amount_cents).toBe(75000)
  })

  it('corrects the date and the note too', async () => {
    await boot(dataset())
    await act(async () => {
      probe!.updateContribution({ ...CONTRIB, date: '2026-04-15', note: 'tax refund' })
    })
    const c = probe!.goalContributions.find((x) => x.id === 'gc-1')!
    expect(c.date).toBe('2026-04-15')
    expect(c.note).toBe('tax refund')
  })

  it('persists to goal_contributions', async () => {
    await boot(dataset())
    await act(async () => { probe!.updateContribution({ ...CONTRIB, amount_cents: 75000 }) })
    const writes = h.mock!.callsFor('goal_contributions').filter((c) => c.op === 'update')
    expect(writes).toHaveLength(1)
    expect(writes[0].payload).toMatchObject({ amount_cents: 75000 })
  })

  it('never re-parents a contribution — goal_id is not in the payload', async () => {
    // Moving a contribution between goals would silently change TWO goals' saved
    // totals from a form that shows only one, so the write must not carry it.
    await boot(dataset())
    await act(async () => { probe!.updateContribution({ ...CONTRIB, amount_cents: 75000 }) })
    const payload = h.mock!.callsFor('goal_contributions').find((c) => c.op === 'update')!
      .payload as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual(['amount_cents', 'date', 'note'])
  })

  it('rolls back to the stored amount on a write error', async () => {
    await boot(dataset({ updateErrors: { goal_contributions: 'denied' } } as Partial<SupabaseMockDataset>))
    await act(async () => { probe!.updateContribution({ ...CONTRIB, amount_cents: 75000 }) })
    await waitFor(() =>
      expect(probe!.goalContributions.find((c) => c.id === 'gc-1')!.amount_cents).toBe(50000)
    )
    expect(probe!.error).toBeTruthy()
  })

  it('leaves other contributions untouched', async () => {
    await boot(dataset())
    const other: GoalContribution = { ...CONTRIB, id: 'gc-2', amount_cents: 10000 }
    await act(async () => { probe!.addContribution(other) })
    await act(async () => { probe!.updateContribution({ ...CONTRIB, amount_cents: 75000 }) })
    expect(probe!.goalContributions.find((c) => c.id === 'gc-2')!.amount_cents).toBe(10000)
  })
})
