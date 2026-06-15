import { describe, it, expect } from 'vitest'
import { listUsers, resolveHousehold, fetchExistingForDedupe } from '../../scripts/import/db/lookups'

/** Mock resolving each `from()`-initiated query to the next queued result. */
function mockQueue(results: Array<{ data: unknown; error: unknown }>) {
  const calls: Array<[string, ...unknown[]]> = []
  let idx = -1
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'limit', 'order']) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, ...args])
      return builder
    }
  }
  builder.then = (res: (r: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(results[idx] ?? { data: [], error: null }).then(res, rej)
  const supabase = {
    from: (t: string) => {
      idx++
      calls.push(['from', t])
      return builder
    },
  } as never
  return { supabase, calls }
}

const u = (id: string, name: string) => ({ id, name, initial: name[0], color_key: 'sage', created_at: '' })

describe('listUsers', () => {
  it('returns the users rows', async () => {
    const { supabase } = mockQueue([{ data: [u('u1', 'Ayaz'), u('u2', 'Tas')], error: null }])
    expect(await listUsers(supabase)).toHaveLength(2)
  })
  it('throws on error', async () => {
    const { supabase } = mockQueue([{ data: null, error: { message: 'nope' } }])
    await expect(listUsers(supabase)).rejects.toThrow(/LOOKUP_USERS/)
  })
})

describe('resolveHousehold', () => {
  it('returns the household + flattened members (object or array join)', async () => {
    const { supabase } = mockQueue([
      { data: [{ household_id: 'h1' }], error: null }, // membership lookup
      { data: [{ id: 'h1', owner_id: 'u1', name: 'Home', created_at: '' }], error: null }, // household
      { data: [{ users: u('u1', 'Ayaz') }, { users: [u('u2', 'Tas')] }], error: null }, // members (mixed shapes)
    ])
    const r = await resolveHousehold(supabase, 'u1')
    expect(r.household?.id).toBe('h1')
    expect(r.members.map((m) => m.name).sort()).toEqual(['Ayaz', 'Tas'])
  })
  it('returns no household when the user is not a member', async () => {
    const { supabase } = mockQueue([{ data: [], error: null }])
    const r = await resolveHousehold(supabase, 'u1')
    expect(r).toEqual({ household: null, members: [] })
  })
})

describe('fetchExistingForDedupe', () => {
  it('returns existing rows for the creator', async () => {
    const { supabase, calls } = mockQueue([
      { data: [{ created_by: 'u1', date: '2026-05-04', amount_cents: 8999, source: 'TD Bank' }], error: null },
    ])
    const rows = await fetchExistingForDedupe(supabase, 'u1')
    expect(rows).toHaveLength(1)
    expect(calls).toContainEqual(['eq', 'created_by', 'u1'])
  })
})
