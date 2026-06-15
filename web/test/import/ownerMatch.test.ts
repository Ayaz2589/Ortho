import { describe, it, expect } from 'vitest'
import { matchOwnerByName } from '../../scripts/import/engine/ownerMatch'
import type { User } from '../../lib/types'

const u = (id: string, name: string): User => ({ id, name, initial: name[0], color_key: 'sage', created_at: '' })
const users = [u('u1', 'Ayaz'), u('u2', 'Tasnuva Ahmed')]

describe('matchOwnerByName', () => {
  it('matches a card member to an Ortho user by first name (case-insensitive)', () => {
    expect(matchOwnerByName('AYAZ UDDIN', users, 'op')).toBe('u1')
    expect(matchOwnerByName('TASNUVA AHMED', users, 'op')).toBe('u2')
  })
  it('falls back to the operator when no first name matches', () => {
    expect(matchOwnerByName('JOHN DOE', users, 'op')).toBe('op')
  })
  it('falls back when the card member is absent', () => {
    expect(matchOwnerByName(undefined, users, 'op')).toBe('op')
    expect(matchOwnerByName('', users, 'op')).toBe('op')
  })
})
