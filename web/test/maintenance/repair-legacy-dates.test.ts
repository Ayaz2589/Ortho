// Spec 013 US2 — one-time audit/repair of legacy evening wall-clock timestamps
// (00:00–04:00Z signature). Pure inference first (window boundaries, DST,
// idempotence, the defensive ambiguity band), then the IO wrapper (dry run
// writes NOTHING; APPLY guards every update with the original date; partial
// failures reported without halting).
import { describe, it, expect } from 'vitest'
import {
  isLegacy,
  proposeRepair,
  runRepair,
  type LegacyRow,
} from '../../scripts/maintenance/repair-legacy-dates'

describe('isLegacy — the 00:00–04:00Z evening wall-clock signature', () => {
  it.each([
    ['2026-01-15T00:00:00.000Z', true, 'window start inclusive'],
    ['2026-01-15T03:59:59.000Z', true, 'last second inside'],
    ['2026-01-15T01:30:00.000Z', true, 'EST evening entry'],
    ['2026-07-02T02:45:00.000Z', true, 'EDT evening entry'],
    ['2026-01-15T04:00:00.000Z', false, 'window end exclusive'],
    ['2026-01-14T23:59:59.000Z', false, 'just before midnight UTC'],
    ['2026-01-15T12:00:00.000Z', false, 'noon-UTC convention rows'],
    ['2026-01-15T22:15:00.000Z', false, 'ordinary evening UTC'],
  ])('%s → %s (%s)', (iso, expected) => {
    expect(isLegacy(iso)).toBe(expected)
  })

  it('never matches a proposed repair output (idempotence)', () => {
    for (const iso of ['2026-01-15T01:30:00.000Z', '2026-07-02T00:00:00.000Z', '2026-11-01T03:30:00.000Z']) {
      expect(isLegacy(proposeRepair(iso).proposedISO)).toBe(false)
    }
  })
})

describe('proposeRepair — New York local-day inference', () => {
  it('EST instant maps to the previous NY calendar day at noon UTC', () => {
    const r = proposeRepair('2026-01-15T01:30:00.000Z') // Jan 14 20:30 EST
    expect(r.localDay).toBe('2026-01-14')
    expect(r.proposedISO).toBe('2026-01-14T12:00:00.000Z')
    expect(r.ambiguous).toBe(false)
  })
  it('EDT instant maps to the previous NY calendar day', () => {
    const r = proposeRepair('2026-07-02T01:30:00.000Z') // Jul 1 21:30 EDT
    expect(r.localDay).toBe('2026-07-01')
    expect(r.proposedISO).toBe('2026-07-01T12:00:00.000Z')
  })
  it('handles the spring-forward night per-instant', () => {
    const r = proposeRepair('2026-03-08T01:30:00.000Z') // Mar 7 20:30 EST (before 2am jump)
    expect(r.localDay).toBe('2026-03-07')
  })
  it('handles the fall-back night per-instant', () => {
    const r = proposeRepair('2026-11-01T03:30:00.000Z') // Oct 31 23:30 EDT
    expect(r.localDay).toBe('2026-10-31')
  })
  it('flags a just-after-NY-midnight instant as ambiguous (defensive band)', () => {
    // 04:30Z in July = 00:30 NY — could be a genuine after-midnight entry.
    const r = proposeRepair('2026-07-02T04:30:00.000Z')
    expect(r.ambiguous).toBe(true)
  })
  it('in-window instants are never ambiguous for the NY offset', () => {
    for (const iso of ['2026-01-15T00:00:00.000Z', '2026-01-15T03:59:00.000Z', '2026-07-02T00:00:00.000Z', '2026-07-02T03:59:00.000Z']) {
      expect(proposeRepair(iso).ambiguous).toBe(false)
    }
  })
})

// ── IO wrapper ──────────────────────────────────────────────────────────────

type Call = [string, ...unknown[]]
function mockDb(rows: LegacyRow[], updateResults: Array<{ data: unknown; error: unknown }> = []) {
  const calls: Call[] = []
  let updates = 0
  let current = ''
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'update', 'order', 'limit']) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, ...args])
      return builder
    }
  }
  builder.then = (res: (r: unknown) => unknown, rej?: (e: unknown) => unknown) => {
    const isUpdate = calls.some((c, i) => c[0] === 'update' && i >= calls.length - 4)
    const result = current === 'transactions' && !isUpdate
      ? { data: rows, error: null }
      : (updateResults[updates++] ?? { data: [{ id: 'x' }], error: null })
    return Promise.resolve(result).then(res, rej)
  }
  const supabase = {
    from: (t: string) => {
      current = t
      calls.push(['from', t])
      return builder
    },
  } as never
  return { supabase, calls }
}

const legacyRow: LegacyRow = {
  id: 'row-1',
  date: '2026-01-15T01:30:00.000Z',
  merchant: 'Verizon',
  amount_cents: 8999,
}
const cleanRow: LegacyRow = {
  id: 'row-2',
  date: '2026-01-15T12:00:00.000Z',
  merchant: 'Costco',
  amount_cents: 5000,
}

const silent = () => {}

describe('runRepair — dry run (default)', () => {
  it('reports repairable rows and performs zero updates', async () => {
    const { supabase, calls } = mockDb([legacyRow, cleanRow])
    const res = await runRepair(supabase, { apply: false, confirm: async () => 'repair', log: silent })
    expect(res.repairable).toHaveLength(1)
    expect(res.repairable[0].id).toBe('row-1')
    expect(res.repairable[0].proposedISO).toBe('2026-01-14T12:00:00.000Z')
    expect(res.written).toBe(0)
    expect(calls.find((c) => c[0] === 'update')).toBeUndefined()
  })
  it('ignores rows already on the noon-UTC convention', async () => {
    const { supabase } = mockDb([cleanRow])
    const res = await runRepair(supabase, { apply: false, confirm: async () => 'repair', log: silent })
    expect(res.repairable).toHaveLength(0)
  })
})

describe('runRepair — APPLY', () => {
  it('requires the literal confirmation word; anything else writes nothing', async () => {
    const { supabase, calls } = mockDb([legacyRow])
    const res = await runRepair(supabase, { apply: true, confirm: async () => 'yes', log: silent })
    expect(res.written).toBe(0)
    expect(calls.find((c) => c[0] === 'update')).toBeUndefined()
  })
  it('updates only reported rows, guarding each write with the original date', async () => {
    const { supabase, calls } = mockDb([legacyRow, cleanRow])
    const res = await runRepair(supabase, { apply: true, confirm: async () => 'repair', log: silent })
    expect(res.written).toBe(1)
    expect(calls).toContainEqual(['update', { date: '2026-01-14T12:00:00.000Z' }])
    expect(calls).toContainEqual(['eq', 'id', 'row-1'])
    expect(calls).toContainEqual(['eq', 'date', '2026-01-15T01:30:00.000Z'])
  })
  it('a per-row failure is reported and does not halt the rest', async () => {
    const other: LegacyRow = { ...legacyRow, id: 'row-3', date: '2026-07-02T01:30:00.000Z' }
    const { supabase } = mockDb(
      [legacyRow, other],
      [{ data: null, error: { message: 'boom' } }, { data: [{ id: 'row-3' }], error: null }]
    )
    const res = await runRepair(supabase, { apply: true, confirm: async () => 'repair', log: silent })
    expect(res.written).toBe(1)
    expect(res.failed).toHaveLength(1)
    expect(res.failed[0]).toMatch(/row-1.*boom/)
  })
})
