// @vitest-environment jsdom
//
// spec 050 — the default owner set for a NEW transaction, and the per-device
// preference behind it. Needs jsdom for `localStorage` (mirrors test/settings/text-size.test.ts).

import { describe, it, expect, afterEach } from 'vitest'
import { resolveDefaultOwnerId, resolveDefaultOwnerIds } from '@/lib/defaultOwner'
import {
  readSharedByDefault,
  writeSharedByDefault,
  SHARED_BY_DEFAULT_FALLBACK,
} from '@/components/settings/sharedByDefault'
import { computeShares, orderedOwnerIds } from '@/lib/splits'

// spec 050 — shared ownership by default.

const ME = 'p-me'
const PARTNER = 'p-partner'
const CHILD = 'p-child'

describe('resolveDefaultOwnerIds', () => {
  it('returns every active person when the household shares', () => {
    const people = [{ id: ME }, { id: PARTNER }, { id: CHILD }]
    expect(resolveDefaultOwnerIds(ME, people, 'u', true)).toEqual([ME, PARTNER, CHILD])
  })

  it('returns only the current person for a one-person household', () => {
    expect(resolveDefaultOwnerIds(ME, [{ id: ME }], 'u', true)).toEqual([ME])
  })

  it('returns only the current person when the preference is off', () => {
    const people = [{ id: ME }, { id: PARTNER }]
    expect(resolveDefaultOwnerIds(ME, people, 'u', false)).toEqual([ME])
  })

  it('agrees with the single-owner resolver whenever it returns one owner', () => {
    const people = [{ id: ME }, { id: PARTNER }]
    expect(resolveDefaultOwnerIds(ME, people, 'u', false)).toEqual([
      resolveDefaultOwnerId(ME, people, 'u'),
    ])
  })

  it('never includes a person the caller filtered out as removed', () => {
    // The caller passes ACTIVE people only; a removed person simply is not in the list.
    const active = [{ id: ME }, { id: PARTNER }]
    expect(resolveDefaultOwnerIds(ME, active, 'u', true)).not.toContain(CHILD)
  })

  it('falls back through the same chain as the single-owner resolver when solo', () => {
    expect(resolveDefaultOwnerIds(null, [], 'user-1', true)).toEqual(['user-1'])
    expect(resolveDefaultOwnerIds(null, [{ id: PARTNER }], null, true)).toEqual([PARTNER])
  })

  it('never returns an empty owner set', () => {
    expect(resolveDefaultOwnerIds(null, [], null, true)).toEqual([''])
    expect(resolveDefaultOwnerIds(ME, [], null, true)).toEqual([ME])
  })
})

describe('sharedByDefault preference', () => {
  afterEach(() => {
    try {
      localStorage.clear()
    } catch {
      /* ignore */
    }
  })

  it('defaults to shared', () => {
    expect(readSharedByDefault()).toBe(SHARED_BY_DEFAULT_FALLBACK)
    expect(SHARED_BY_DEFAULT_FALLBACK).toBe(true)
  })

  it('round-trips both values', () => {
    writeSharedByDefault(false)
    expect(readSharedByDefault()).toBe(false)
    writeSharedByDefault(true)
    expect(readSharedByDefault()).toBe(true)
  })

  it('treats an unrecognized stored value as the default', () => {
    localStorage.setItem('ortho.sharedByDefault', 'maybe')
    expect(readSharedByDefault()).toBe(SHARED_BY_DEFAULT_FALLBACK)
  })
})

describe('the default owner set always produces shares summing to the amount', () => {
  it('holds for owner sets of size 1 through 6 on non-divisible amounts', () => {
    const ids = Array.from({ length: 6 }, (_, i) => `p-${i}`)
    for (let n = 1; n <= 6; n++) {
      const people = ids.slice(0, n).map((id) => ({ id }))
      const owners = resolveDefaultOwnerIds(people[0].id, people, 'u', true)
      expect(owners).toHaveLength(n)
      for (const amount of [10_001, 999, 7, 100_000, 33_333]) {
        const shares = computeShares(amount, orderedOwnerIds(owners), { method: 'even' })
        const total = Object.values(shares).reduce((s, c) => s + c, 0)
        expect(total).toBe(amount)
      }
    }
  })
})
