import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  deriveGateState,
  DUNNING_GRACE_DAYS,
  LEEWAY_HOURS,
  TRIAL_DAYS,
  type EntitlementStatus,
  type GateState,
} from '../src/index'
import { serializeVectors, VECTOR_NOW, VECTORS, VECTORS_SHA256 } from './vectors'

describe('binding constants (contracts/entitlement-state.md)', () => {
  it('holds the contracted values', () => {
    expect(LEEWAY_HOURS).toBe(48)
    expect(DUNNING_GRACE_DAYS).toBe(14)
    expect(TRIAL_DAYS).toBe(31)
  })
})

describe('literal vectors V01–V19', () => {
  it('canonical serialization matches the contract digest', () => {
    const digest = createHash('sha256').update(serializeVectors(VECTORS), 'utf8').digest('hex')
    expect(digest).toBe(VECTORS_SHA256)
  })

  for (const [id, status, accessExpiresAt, expected] of VECTORS) {
    it(`${id}: ${status} / ${accessExpiresAt ?? 'null'} → ${expected}`, () => {
      expect(
        deriveGateState(
          { status: status as EntitlementStatus, accessExpiresAt },
          VECTOR_NOW
        )
      ).toBe(expected as GateState)
    })
  }
})

describe('window boundaries are strict (<) on both sides of the second', () => {
  const cases: Array<{
    status: EntitlementStatus
    expires: string
    now: string
    expected: GateState
    label: string
  }> = [
    // trialing/active leeway edge: expires + 48h
    { status: 'trialing', expires: '2026-07-03T12:00:00Z', now: '2026-07-05T11:59:59Z', expected: 'trialing', label: 'one second inside leeway' },
    { status: 'trialing', expires: '2026-07-03T12:00:00Z', now: '2026-07-05T12:00:00Z', expected: 'lapsed', label: 'exactly at leeway boundary' },
    { status: 'active', expires: '2026-07-03T12:00:00Z', now: '2026-07-05T11:59:59Z', expected: 'active', label: 'one second inside leeway' },
    { status: 'active', expires: '2026-07-03T12:00:00Z', now: '2026-07-05T12:00:00Z', expected: 'lapsed', label: 'exactly at leeway boundary' },
    // past_due envelope edge: expires + 48h + 14d
    { status: 'past_due', expires: '2026-06-19T12:00:00Z', now: '2026-07-05T11:59:59Z', expected: 'grace', label: 'one second inside dunning envelope' },
    { status: 'past_due', expires: '2026-06-19T12:00:00Z', now: '2026-07-05T12:00:00Z', expected: 'lapsed', label: 'exactly at dunning boundary' },
    // canceled paid-through edge: expires, NO leeway
    { status: 'canceled', expires: '2026-07-05T12:00:00Z', now: '2026-07-05T11:59:59Z', expected: 'active', label: 'one second before paid-through end' },
    { status: 'canceled', expires: '2026-07-05T12:00:00Z', now: '2026-07-05T12:00:00Z', expected: 'lapsed', label: 'exactly at paid-through end' },
  ]

  for (const c of cases) {
    it(`${c.status} ${c.label} → ${c.expected}`, () => {
      expect(deriveGateState({ status: c.status, accessExpiresAt: c.expires }, c.now)).toBe(c.expected)
    })
  }
})

describe('admin ignores expiry entirely', () => {
  it('admin with null, past, and future expiry are all admin', () => {
    for (const expires of [null, '1970-01-01T00:00:00Z', '2999-01-01T00:00:00Z']) {
      expect(deriveGateState({ status: 'admin', accessExpiresAt: expires }, VECTOR_NOW)).toBe('admin')
    }
  })
})

describe('defensive null expiry for every non-admin status', () => {
  const statuses: EntitlementStatus[] = ['trialing', 'active', 'past_due', 'paused', 'unpaid', 'canceled']
  for (const status of statuses) {
    it(`${status} with null expiry → lapsed`, () => {
      expect(deriveGateState({ status, accessExpiresAt: null }, VECTOR_NOW)).toBe('lapsed')
    })
  }
})
