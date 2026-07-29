import { describe, expect, it } from 'vitest'
import { validateEnvelope, SUPPORTED_FORMAT_VERSION } from '../../lib/dataFile/envelope'

const good = {
  formatVersion: 1,
  generatedAt: '2026-07-27T00:00:00.000Z',
  app: { name: 'ortho', version: '1' },
  household: { id: 'hh1', name: 'Home' },
  display: { language: 'English', currency: 'usd' },
  sections: [{ key: 'transactions', sectionVersion: 1, records: [] }],
}

describe('validateEnvelope', () => {
  it('accepts a well-formed current-version envelope', () => {
    const r = validateEnvelope(good)
    expect(r.ok).toBe(true)
  })

  it('rejects a newer unsupported formatVersion with no throw', () => {
    const r = validateEnvelope({ ...good, formatVersion: SUPPORTED_FORMAT_VERSION + 1 })
    expect(r).toEqual({ ok: false, reason: 'unsupported-version' })
  })

  it('rejects a foreign JSON as not-ortho-file', () => {
    expect(validateEnvelope({ hello: 'world' })).toEqual({ ok: false, reason: 'not-ortho-file' })
    expect(validateEnvelope({ ...good, app: { name: 'other', version: '1' } })).toEqual({
      ok: false,
      reason: 'not-ortho-file',
    })
  })

  it('rejects malformed shapes as corrupt', () => {
    expect(validateEnvelope(null).ok).toBe(false)
    expect(validateEnvelope('nope' as unknown).ok).toBe(false)
    expect(validateEnvelope({ ...good, sections: 'x' }).ok).toBe(false)
    expect(validateEnvelope({ ...good, formatVersion: 'one' }).ok).toBe(false)
    expect(validateEnvelope({ ...good, sections: [{ nope: true }] }).ok).toBe(false)
  })

  it('tolerates an unknown section key at the envelope level', () => {
    const r = validateEnvelope({
      ...good,
      sections: [...good.sections, { key: 'widgets', sectionVersion: 9, records: [] }],
    })
    expect(r.ok).toBe(true)
  })
})
