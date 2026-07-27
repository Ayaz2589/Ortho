import { afterEach, describe, expect, it } from 'vitest'
import { register, registeredSections, getSection, _resetRegistry, type DataSection } from '../../lib/dataFile/registry'
import { registerBuiltinSections } from '../../lib/dataFile/sections'
import { buildEnvelope } from '../../lib/dataFile/export'
import { planImport } from '../../lib/dataFile/import'
import { makeStore, tx } from './_fixtures'

afterEach(() => registerBuiltinSections())

describe('registry', () => {
  it('registers built-in sections in order (transactions, housing)', () => {
    registerBuiltinSections()
    expect(registeredSections().map((s) => s.key)).toEqual(['transactions', 'housing'])
  })

  it('throws on a duplicate key', () => {
    registerBuiltinSections()
    expect(() => register(getSection('transactions') as DataSection)).toThrow()
  })

  it('a new section registers additively without touching existing ones', () => {
    registerBuiltinSections()
    const widgets: DataSection = {
      key: 'widgets',
      sectionVersion: 1,
      serialize: () => [{ id: 'w1' }],
      read: (p) => p.records,
      dedupe: (r) => ({ add: r, skipById: [], skipByContent: [] }),
      apply: () => {},
      renderModel: () => ({ title: 'Widgets', columns: [], rows: [], emptyLabel: '' }),
    }
    register(widgets)
    expect(registeredSections().map((s) => s.key)).toEqual(['transactions', 'housing', 'widgets'])
  })
})

describe('currency independence (G1/D5)', () => {
  it('produces byte-identical section payloads regardless of display currency', () => {
    const store = makeStore({ transactions: [tx({ id: 't1', amount_cents: 99999 })] })
    const now = '2026-07-27T00:00:00.000Z'
    const usd = buildEnvelope(store, { language: 'English', currency: 'usd', now })
    const jpy = buildEnvelope(store, { language: '日本語', currency: 'jpy', now })
    const bdt = buildEnvelope(store, { language: 'বাংলা', currency: 'bdt', now })
    expect(jpy.sections).toEqual(usd.sections)
    expect(bdt.sections).toEqual(usd.sections)
    // only the provenance differs
    expect(jpy.display).toEqual({ language: '日本語', currency: 'jpy' })
  })
})

describe('forward/back-compat (G5/G6)', () => {
  it('skips an unknown section key (known:false) and imports the known ones', () => {
    _resetRegistry()
    registerBuiltinSections()
    const store = makeStore()
    const envelope = buildEnvelope(store, { language: 'English', currency: 'usd', now: '2026-07-27T00:00:00.000Z' })
    envelope.sections.push({ key: 'from_the_future', sectionVersion: 9, records: [{ any: 'thing' }] })
    const { result } = planImport(envelope, store)
    const unknown = result.sections.find((s) => s.key === 'from_the_future')
    expect(unknown).toMatchObject({ known: false, added: 0 })
    expect(result.sections.find((s) => s.key === 'transactions')?.known).toBe(true)
  })

  it('imports fine when a supported section is simply absent from the file', () => {
    const store = makeStore()
    const envelope = buildEnvelope(store, { language: 'English', currency: 'usd', now: '2026-07-27T00:00:00.000Z' })
    envelope.sections = envelope.sections.filter((s) => s.key !== 'housing')
    const { result } = planImport(envelope, store)
    expect(result.sections.map((s) => s.key)).toEqual(['transactions'])
    expect(result.ok).toBe(true)
  })
})
