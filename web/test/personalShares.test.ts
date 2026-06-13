// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  readPersonalShares,
  writePersonalShare,
  removePersonalShare,
  prunePersonalShares,
  resolvePersonalOwners,
} from '@/lib/personalShares'

beforeEach(() => localStorage.clear())

describe('personalShares (device-local persistence)', () => {
  it('writes and reads back a share', () => {
    writePersonalShare('t1', { owner_ids: ['u1', 'l1'], splits: null })
    expect(readPersonalShares()).toEqual({ t1: { owner_ids: ['u1', 'l1'], splits: null } })
  })

  it('removes a share', () => {
    writePersonalShare('t1', { owner_ids: ['u1', 'l1'], splits: null })
    removePersonalShare('t1')
    expect(readPersonalShares()).toEqual({})
  })

  it('prunes shares whose transaction no longer exists', () => {
    writePersonalShare('keep', { owner_ids: ['u1', 'l1'], splits: null })
    writePersonalShare('gone', { owner_ids: ['u1', 'l2'], splits: null })
    prunePersonalShares(new Set(['keep']))
    expect(Object.keys(readPersonalShares())).toEqual(['keep'])
  })

  it('returns {} on corrupt storage', () => {
    localStorage.setItem('personalShares', 'not json')
    expect(readPersonalShares()).toEqual({})
  })

  describe('resolvePersonalOwners', () => {
    it('uses a saved share when present', () => {
      const saved = { t1: { owner_ids: ['u1', 'l1'], splits: { u1: 50, l1: 50 } } }
      expect(resolvePersonalOwners('t1', 'u1', saved)).toEqual({
        owner_ids: ['u1', 'l1'],
        splits: { u1: 50, l1: 50 },
      })
    })
    it('falls back to creator-only when no share', () => {
      expect(resolvePersonalOwners('t2', 'u9', {})).toEqual({ owner_ids: ['u9'], splits: null })
    })
    it('falls back to creator-only when a saved share has no owners', () => {
      const saved = { t3: { owner_ids: [], splits: null } }
      expect(resolvePersonalOwners('t3', 'u9', saved)).toEqual({ owner_ids: ['u9'], splits: null })
    })
  })
})
