import { describe, expect, it } from 'vitest'
import { consentTransition, shouldDeleteVisitsOnTransition } from '../../lib/location/consent'

describe('consentTransition', () => {
  it('stamps grantedAt when moving off → a real level', () => {
    const t = consentTransition('off', 'geocoding', '2026-08-11T00:00:00Z')
    expect(t.grantedAt).toBe('2026-08-11T00:00:00Z')
    expect(t.revokedAt).toBeUndefined()
  })

  it('stamps revokedAt when moving a real level → off', () => {
    const t = consentTransition('foreground_capture', 'off', '2026-08-11T00:00:00Z')
    expect(t.revokedAt).toBe('2026-08-11T00:00:00Z')
    expect(t.grantedAt).toBeUndefined()
  })

  it('stamps neither when moving between two real levels', () => {
    const t = consentTransition('geocoding', 'foreground_capture', '2026-08-11T00:00:00Z')
    expect(t.grantedAt).toBeUndefined()
    expect(t.revokedAt).toBeUndefined()
  })

  it('stamps neither for an off→off no-op', () => {
    const t = consentTransition('off', 'off', '2026-08-11T00:00:00Z')
    expect(t.grantedAt).toBeUndefined()
    expect(t.revokedAt).toBeUndefined()
  })
})

describe('shouldDeleteVisitsOnTransition', () => {
  it('true only when moving from a real level to off', () => {
    expect(shouldDeleteVisitsOnTransition('foreground_capture', 'off')).toBe(true)
    expect(shouldDeleteVisitsOnTransition('geocoding', 'off')).toBe(true)
  })
  it('false for every other transition', () => {
    expect(shouldDeleteVisitsOnTransition('off', 'geocoding')).toBe(false)
    expect(shouldDeleteVisitsOnTransition('geocoding', 'foreground_capture')).toBe(false)
    expect(shouldDeleteVisitsOnTransition('off', 'off')).toBe(false)
  })
})
