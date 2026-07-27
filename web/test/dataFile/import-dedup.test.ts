import { afterEach, describe, expect, it } from 'vitest'
import { registerBuiltinSections } from '../../lib/dataFile/sections'
import { buildEnvelope } from '../../lib/dataFile/export'
import { applyImport, planImport } from '../../lib/dataFile/import'
import { makeStore, property, rental, tx } from './_fixtures'

afterEach(() => registerBuiltinSections())

const NOW = '2026-07-27T00:00:00.000Z'
const exportOpts = { language: 'English' as const, currency: 'usd' as const, now: NOW }

describe('two-tier dedup', () => {
  it('tier-1 idempotency: re-importing a file whose ids all exist adds nothing', () => {
    const store = makeStore({
      transactions: [tx({ id: 't1' }), tx({ id: 't2', merchant: 'Con Ed', amount_cents: 5000 })],
      properties: [property({ id: 'prop1' })],
    })
    const envelope = buildEnvelope(store, exportOpts)
    const { result, plans } = planImport(envelope, store)
    const txSummary = result.sections.find((s) => s.key === 'transactions')!
    expect(txSummary.added).toBe(0)
    expect(txSummary.skippedById).toBe(2)
    // applying changes nothing
    applyImport(plans, store, { now: NOW })
    expect(store.added.transactions).toHaveLength(0)
  })

  it('full round-trip into an empty store recreates every record, then re-import is a no-op', () => {
    const source = makeStore({
      transactions: [tx({ id: 't1' }), tx({ id: 't2', merchant: 'Con Ed', amount_cents: 5000, date: '2026-05-02' })],
      properties: [property({ id: 'prop1' })],
      rentalPayments: [rental({ id: 'rp1', property_id: 'prop1' })],
    })
    const envelope = buildEnvelope(source, exportOpts)

    const target = makeStore()
    const first = planImport(envelope, target)
    applyImport(first.plans, target, { now: NOW })
    expect(target.added.transactions).toHaveLength(2)
    expect(target.added.properties).toHaveLength(1)
    expect(target.added.rentalPayments).toHaveLength(1)

    // second import: everything now matches tier-1 → zero adds (idempotent)
    const second = planImport(envelope, target)
    expect(second.result.sections.every((s) => s.added === 0)).toBe(true)
  })

  it('tier-2 content match: a hand-entered equivalent (different id) is skipped by content', () => {
    // store has a look-alike transaction with a DIFFERENT id
    const store = makeStore({
      transactions: [tx({ id: 'local-abc', merchant: 'Netflix', amount_cents: 10000, date: '2026-05-01' })],
    })
    const source = makeStore({
      transactions: [tx({ id: 'file-xyz', merchant: 'Netflix', amount_cents: 10000, date: '2026-05-02' })],
    })
    const envelope = buildEnvelope(source, exportOpts)
    const { result } = planImport(envelope, store)
    const s = result.sections.find((x) => x.key === 'transactions')!
    expect(s.added).toBe(0)
    expect(s.skippedByContent).toBe(1)
  })

  it('tier-2 miss: a genuinely new record is added', () => {
    const store = makeStore({ transactions: [tx({ id: 'local-abc', merchant: 'Netflix', amount_cents: 10000 })] })
    const source = makeStore({ transactions: [tx({ id: 'file-xyz', merchant: 'Whole Foods', amount_cents: 7321, date: '2026-06-01' })] })
    const envelope = buildEnvelope(source, exportOpts)
    const { result, plans } = planImport(envelope, store)
    expect(result.sections.find((x) => x.key === 'transactions')!.added).toBe(1)
    applyImport(plans, store, { now: NOW })
    expect(store.added.transactions).toHaveLength(1)
    expect(store.added.transactions[0].id).toBe('file-xyz')
  })

  it('tier order: an id match short-circuits before content matching', () => {
    // same id present locally but with different content → must be skipById, not content
    const store = makeStore({ transactions: [tx({ id: 'shared', merchant: 'Different', amount_cents: 111 })] })
    const source = makeStore({ transactions: [tx({ id: 'shared', merchant: 'Netflix', amount_cents: 10000 })] })
    const envelope = buildEnvelope(source, exportOpts)
    const s = planImport(envelope, store).result.sections.find((x) => x.key === 'transactions')!
    expect(s.skippedById).toBe(1)
    expect(s.skippedByContent).toBe(0)
  })

  it('additive only: number of store creates equals Σ plan.add (no silent double-insert)', () => {
    const source = makeStore({
      transactions: [tx({ id: 't1' }), tx({ id: 't2', merchant: 'X', amount_cents: 5, date: '2026-04-01' })],
      properties: [property({ id: 'prop1' })],
    })
    const envelope = buildEnvelope(source, exportOpts)
    const target = makeStore()
    const { plans } = planImport(envelope, target)
    const totalAdds = plans.reduce((n, p) => n + p.plan.add.length, 0)
    applyImport(plans, target, { now: NOW })
    const creates = target.added.transactions.length + target.added.properties.length
    expect(creates).toBe(totalAdds)
  })
})
