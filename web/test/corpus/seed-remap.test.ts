import { describe, it, expect } from 'vitest'
import { remapRow, remapRows } from '../../scripts/seed-corpus'
import { uuidFrom } from './ids'

// The holistic seeder (spec 030) remaps readable ids to real ids before upsert:
//   - non-user id/FK columns → the deterministic uuidFrom(readable)
//   - USER columns → the real auth.users id created by ensureAuthUsers
// A USER reference with no auth id MUST fail loud, not silently fall back to a
// phantom uuidFrom() id (which would only surface as an opaque FK violation).

const userIds = new Map<string, string>([
  ['demo-owner', '00000000-0000-4000-8000-000000000001'],
  ['demo-partner', '00000000-0000-4000-8000-000000000002'],
])

describe('seed-corpus remapRow', () => {
  it('maps a USER column to the real auth.users id', () => {
    const out = remapRow('households', { id: 'hh-1', owner_id: 'demo-owner' }, userIds) as Record<string, unknown>
    expect(out.owner_id).toBe('00000000-0000-4000-8000-000000000001')
  })

  it('maps non-user id/FK columns through the deterministic uuidFrom', () => {
    const out = remapRow('households', { id: 'hh-1', owner_id: 'demo-owner' }, userIds) as Record<string, unknown>
    expect(out.id).toBe(uuidFrom('hh-1'))
  })

  it('throws with the table.column and readable id when a USER reference has no auth id', () => {
    expect(() =>
      remapRow('transactions', { id: 'tx-1', household_id: 'hh-1', created_by: 'ghost-user' }, userIds)
    ).toThrowError(/transactions\.created_by references user "ghost-user"/)
  })

  it('skips a null/absent USER column without throwing (e.g. unlinked household_people)', () => {
    const out = remapRow(
      'household_people',
      { id: 'p-1', household_id: 'hh-1', linked_user_id: null },
      userIds
    ) as Record<string, unknown>
    expect(out.linked_user_id).toBeNull()
    // present-but-string is mapped; null is left as-is
    const linked = remapRow(
      'household_people',
      { id: 'p-2', household_id: 'hh-1', linked_user_id: 'demo-partner' },
      userIds
    ) as Record<string, unknown>
    expect(linked.linked_user_id).toBe('00000000-0000-4000-8000-000000000002')
  })

  it('does not mutate the input row', () => {
    const row = { id: 'hh-1', owner_id: 'demo-owner' }
    remapRow('households', row, userIds)
    expect(row).toEqual({ id: 'hh-1', owner_id: 'demo-owner' })
  })

  it('remapRows maps every row of a fully-valid batch', () => {
    const rows = [
      { id: 'tx-1', household_id: 'hh-1', created_by: 'demo-owner' },
      { id: 'tx-2', household_id: 'hh-1', created_by: 'demo-partner' },
    ]
    const out = remapRows('transactions', rows, userIds) as Record<string, unknown>[]
    expect(out.map((r) => r.created_by)).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ])
    expect(out.map((r) => r.id)).toEqual([uuidFrom('tx-1'), uuidFrom('tx-2')])
  })

  it('remapRows fails the whole batch on the first dangling USER reference', () => {
    const rows = [
      { id: 'tx-1', household_id: 'hh-1', created_by: 'demo-owner' },
      { id: 'tx-2', household_id: 'hh-1', created_by: 'ghost-user' },
    ]
    expect(() => remapRows('transactions', rows, userIds)).toThrowError(
      /transactions\.created_by references user "ghost-user"/
    )
  })
})
