import { describe, it, expect } from 'vitest'
import { uuidFrom } from './ids'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe('uuidFrom (spec 026 seeder id mapping)', () => {
  it('produces canonical-format UUIDs', () => {
    expect(uuidFrom('hh-1')).toMatch(UUID_RE)
    expect(uuidFrom('order-mismatch-a4-p-alpha')).toMatch(UUID_RE)
  })
  it('is deterministic (same key → same UUID)', () => {
    expect(uuidFrom('users-1')).toBe(uuidFrom('users-1'))
  })
  it('is collision-free for distinct keys (maps FKs consistently)', () => {
    const keys = ['a', 'b', 'a-p-0', 'a-p-1', 'a-hh', 'a-u-0']
    const mapped = keys.map(uuidFrom)
    expect(new Set(mapped).size).toBe(keys.length)
  })
})
