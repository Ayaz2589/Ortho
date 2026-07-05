import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  DUNNING_GRACE_DAYS,
  LEEWAY_HOURS,
  TRIAL_DAYS,
  daysRemaining,
  deriveGateState,
  type EntitlementStatus,
  type GateState,
} from '@/lib/entitlements'

// The shared literal vectors from specs/018-subscription-system/contracts/
// entitlement-state.md — embedded VERBATIM here, in services/billing/test/, and
// in iOS EntitlementLogicTests.swift. Amend the contract before touching these.
const VECTOR_NOW = '2026-07-05T12:00:00Z'

const VECTORS: ReadonlyArray<
  readonly [id: string, status: string, accessExpiresAt: string | null, expected: string]
> = [
  ['V01', 'admin', null, 'admin'],
  ['V02', 'admin', '2020-01-01T00:00:00Z', 'admin'],
  ['V03', 'trialing', '2026-07-20T00:00:00Z', 'trialing'],
  ['V04', 'trialing', '2026-07-04T12:00:00Z', 'trialing'],
  ['V05', 'trialing', '2026-07-03T12:00:00Z', 'lapsed'],
  ['V06', 'trialing', '2026-07-03T11:59:59Z', 'lapsed'],
  ['V07', 'trialing', null, 'lapsed'],
  ['V08', 'active', '2026-08-01T00:00:00Z', 'active'],
  ['V09', 'active', '2026-07-04T00:00:00Z', 'active'],
  ['V10', 'active', '2026-07-01T00:00:00Z', 'lapsed'],
  ['V11', 'active', null, 'lapsed'],
  ['V12', 'past_due', '2026-07-10T00:00:00Z', 'grace'],
  ['V13', 'past_due', '2026-07-01T00:00:00Z', 'grace'],
  ['V14', 'past_due', '2026-06-18T00:00:00Z', 'lapsed'],
  ['V15', 'canceled', '2026-07-10T00:00:00Z', 'active'],
  ['V16', 'canceled', '2026-07-05T12:00:00Z', 'lapsed'],
  ['V17', 'canceled', '2026-07-05T11:59:59Z', 'lapsed'],
  ['V18', 'paused', '2026-08-01T00:00:00Z', 'lapsed'],
  ['V19', 'unpaid', '2026-08-01T00:00:00Z', 'lapsed'],
]

const VECTORS_SHA256 = '88715c8317256e5c6162e6479e3451e94bff56edbc70c0853c1fd0aaa36a48e2'

describe('entitlement derivation mirror (web copy of billing-core derive.ts)', () => {
  it('binding constants match the contract', () => {
    expect(LEEWAY_HOURS).toBe(48)
    expect(DUNNING_GRACE_DAYS).toBe(14)
    expect(TRIAL_DAYS).toBe(31)
  })

  it('canonical serialization matches the contract digest', () => {
    const canon = VECTORS.map(([id, s, e, g]) => `${id}|${s}|${e ?? 'null'}|${g}`).join('\n')
    expect(createHash('sha256').update(canon, 'utf8').digest('hex')).toBe(VECTORS_SHA256)
  })

  for (const [id, status, accessExpiresAt, expected] of VECTORS) {
    it(`${id}: ${status} / ${accessExpiresAt ?? 'null'} → ${expected}`, () => {
      expect(
        deriveGateState({ status: status as EntitlementStatus, accessExpiresAt }, VECTOR_NOW)
      ).toBe(expected as GateState)
    })
  }
})

describe('daysRemaining', () => {
  it('counts up (ceil), floors at zero, treats null as zero', () => {
    expect(daysRemaining('2026-07-10T12:00:00Z', VECTOR_NOW)).toBe(5)
    expect(daysRemaining('2026-07-05T12:00:01Z', VECTOR_NOW)).toBe(1)
    expect(daysRemaining('2026-07-01T00:00:00Z', VECTOR_NOW)).toBe(0)
    expect(daysRemaining(null, VECTOR_NOW)).toBe(0)
  })
})
