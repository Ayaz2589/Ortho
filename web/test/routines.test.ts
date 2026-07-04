import { describe, it, expect } from 'vitest'
import {
  detectRoutines,
  normalizeMerchant,
  classifyCadence,
  hourBucket,
  confidenceScore,
  monthlyEquivalentCents,
  median,
} from '../lib/finance/routines'
import { buildRoutineDemo, DEMO_NOW } from '../lib/testdata/routine-demo'
import type { Transaction, TransactionCategory, TransactionKind } from '../lib/types'

// Vitest pins TZ=UTC (vitest.config.ts) and the detector uses UTC accessors, so
// every timestamp below is unambiguous. All reference dates are injected — the
// detector never reads the real clock.

let seq = 0
function tx(over: Partial<Transaction> = {}): Transaction {
  seq++
  const kind: TransactionKind = over.kind ?? 'expense'
  const category: TransactionCategory = over.category ?? 'coffee'
  return {
    id: over.id ?? `t${seq}`,
    household_id: 'hh-1',
    merchant: over.merchant ?? 'Merchant',
    category,
    kind,
    amount_cents: over.amount_cents ?? 500,
    source: 'Everyday Card',
    date: over.date ?? '2026-06-15T08:00:00.000Z',
    created_by: 'p1',
    created_at: over.date ?? '2026-06-15T08:00:00.000Z',
    updated_at: over.date ?? '2026-06-15T08:00:00.000Z',
    paid_by: 'p1',
    owner_ids: ['p1'],
    shares: { p1: over.amount_cents ?? 500 },
  }
}

const D = (iso: string) => new Date(iso)

// ---------------------------------------------------------------------------
// Unit rules (T005)
// ---------------------------------------------------------------------------

describe('normalizeMerchant', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeMerchant('  Blue   Bottle  Coffee ')).toBe('blue bottle coffee')
  })
  it('strips a trailing store-number / ref token', () => {
    expect(normalizeMerchant("Dunkin' #3401")).toBe("dunkin'")
    expect(normalizeMerchant('Shell 12345')).toBe('shell')
    expect(normalizeMerchant('Costco No. 12')).toBe('costco')
  })
  it('leaves a plain name untouched', () => {
    expect(normalizeMerchant('MTA')).toBe('mta')
  })
})

describe('median', () => {
  it('handles odd and even lengths', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(median([])).toBe(0)
  })
})

describe('classifyCadence', () => {
  it('classifies weekday-only daily spacing as weekday', () => {
    // 2026-06-15..18 = Tue..Fri (all weekdays), 1-day gaps
    expect(classifyCadence([D('2026-06-15T08:00:00Z'), D('2026-06-16T08:00:00Z'), D('2026-06-17T08:00:00Z'), D('2026-06-18T08:00:00Z')])).toBe('weekday')
  })
  it('classifies every-day spacing (incl. weekend) as daily', () => {
    // Tue..Mon includes Sat/Sun
    const dates = ['15', '16', '17', '18', '19', '20', '21'].map((d) => D(`2026-06-${d}T08:00:00Z`))
    expect(classifyCadence(dates)).toBe('daily')
  })
  it('classifies 7-day spacing as weekly', () => {
    expect(classifyCadence([D('2026-05-04T15:00:00Z'), D('2026-05-11T15:00:00Z'), D('2026-05-18T15:00:00Z'), D('2026-05-25T15:00:00Z')])).toBe('weekly')
  })
  it('classifies 14-day spacing as biweekly', () => {
    expect(classifyCadence([D('2026-04-01T12:30:00Z'), D('2026-04-15T12:30:00Z'), D('2026-04-29T12:30:00Z')])).toBe('biweekly')
  })
  it('classifies ~30-day spacing as monthly', () => {
    expect(classifyCadence([D('2026-04-10T09:00:00Z'), D('2026-05-10T09:00:00Z'), D('2026-06-09T09:00:00Z')])).toBe('monthly')
  })
  it('classifies erratic spacing as irregular', () => {
    expect(classifyCadence([D('2026-06-01T09:00:00Z'), D('2026-06-02T09:00:00Z'), D('2026-06-22T09:00:00Z'), D('2026-06-25T09:00:00Z')])).toBe('irregular')
  })
})

describe('hourBucket', () => {
  it('returns null for the noon-UTC import sentinel', () => {
    expect(hourBucket(D('2026-06-15T12:00:00.000Z'))).toBeNull()
  })
  it('buckets real hours', () => {
    expect(hourBucket(D('2026-06-15T08:00:00Z'))).toBe('morning')
    expect(hourBucket(D('2026-06-15T11:00:00Z'))).toBe('midday')
    expect(hourBucket(D('2026-06-15T15:00:00Z'))).toBe('afternoon')
    expect(hourBucket(D('2026-06-15T20:00:00Z'))).toBe('evening')
    expect(hourBucket(D('2026-06-15T23:00:00Z'))).toBe('night')
    expect(hourBucket(D('2026-06-15T02:00:00Z'))).toBe('night')
  })
  it('treats a non-zero-minute noon as a real midday hour (not the sentinel)', () => {
    expect(hourBucket(D('2026-06-15T12:30:00Z'))).toBe('midday')
  })
})

describe('confidenceScore', () => {
  it('scores frequent, evenly-spaced routines near 1', () => {
    expect(confidenceScore([7, 7, 7], 4, 'weekly', 21)).toBe(1)
  })
  it('scores erratic spacing near 0', () => {
    expect(confidenceScore([1, 13, 2], 4, 'weekly', 16)).toBe(0)
  })
  it('ranks the even one strictly above the erratic one', () => {
    expect(confidenceScore([7, 7, 7], 4, 'weekly', 21)).toBeGreaterThan(confidenceScore([1, 13, 2], 4, 'weekly', 16))
  })
})

// ---------------------------------------------------------------------------
// User Story 1 — detect routines from history alone (T006)
// ---------------------------------------------------------------------------

describe('detectRoutines — US1 core', () => {
  it('detects a weekday-morning merchant routine with cadence, bucket, count, median amount', () => {
    const txs = ['15', '16', '17', '18'].map((d) => tx({ merchant: 'Cafe', category: 'coffee', amount_cents: 500, date: `2026-06-${d}T08:00:00Z` }))
    const report = detectRoutines(txs, { now: D('2026-06-19T12:00:00Z') })
    const r = report.routines.find((x) => x.kind === 'merchant')
    expect(r).toBeDefined()
    expect(r!.cadence).toBe('weekday')
    expect(r!.timeBucket).toBe('morning')
    expect(r!.occurrenceCount).toBe(4)
    expect(r!.typicalAmountCents).toBe(500)
  })

  it('detects a category-level weekly routine when the merchant rotates', () => {
    const merchants = ['Whole Foods', 'Trader Joe’s', 'Costco', 'Safeway']
    const dates = ['2026-05-04', '2026-05-11', '2026-05-18', '2026-05-25']
    const txs = dates.map((d, i) => tx({ merchant: merchants[i], category: 'groceries', amount_cents: 7000 + i * 500, date: `${d}T15:00:00Z` }))
    const report = detectRoutines(txs, { now: D('2026-05-27T12:00:00Z') })
    const cat = report.routines.find((x) => x.kind === 'category' && x.key === 'groceries')
    expect(cat).toBeDefined()
    expect(cat!.cadence).toBe('weekly')
    // no single grocery merchant clears the support threshold on its own
    expect(report.routines.some((x) => x.kind === 'merchant')).toBe(false)
  })

  it('never surfaces a single-occurrence merchant', () => {
    const txs = [tx({ merchant: 'Rare Store', category: 'entertainment', date: '2026-06-10T14:00:00Z' })]
    const report = detectRoutines(txs, { now: D('2026-06-15T12:00:00Z') })
    expect(report.routines).toHaveLength(0)
  })

  it('is deterministic and input-order independent', () => {
    const txs = ['15', '16', '17', '18'].map((d) => tx({ merchant: 'Cafe', category: 'coffee', date: `2026-06-${d}T08:00:00Z` }))
    const now = D('2026-06-19T12:00:00Z')
    const a = detectRoutines(txs, { now })
    const b = detectRoutines([...txs].reverse(), { now })
    expect(a).toEqual(b)
  })

  it('ignores income and reimbursement transfers', () => {
    const income = ['15', '16', '17', '18'].map((d) => tx({ kind: 'income', merchant: 'Payroll', category: 'income', date: `2026-06-${d}T08:00:00Z` }))
    const transfers = ['15', '16', '17', '18'].map((d) => tx({ kind: 'transfer', merchant: 'Settle up', category: 'transfer', date: `2026-06-${d}T09:00:00Z` }))
    const report = detectRoutines([...income, ...transfers], { now: D('2026-06-19T12:00:00Z') })
    expect(report.routines).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// User Story 2 — validate against sample data (T012)
// ---------------------------------------------------------------------------

describe('detectRoutines — US2 demo fixture (SC-001 / SC-002)', () => {
  const report = detectRoutines(buildRoutineDemo(), { now: DEMO_NOW })

  it('surfaces all four planted routines with the right cadence', () => {
    const coffee = report.routines.find((r) => r.kind === 'merchant' && r.key === 'blue bottle coffee')
    const transit = report.routines.find((r) => r.kind === 'merchant' && r.key === 'mta')
    const groceries = report.routines.find((r) => r.kind === 'category' && r.key === 'groceries')
    const sub = report.routines.find((r) => r.kind === 'merchant' && r.key === 'streamly')

    expect(coffee).toMatchObject({ cadence: 'weekday', timeBucket: 'morning' })
    expect(transit).toMatchObject({ cadence: 'weekday', timeBucket: 'morning' })
    expect(groceries).toMatchObject({ cadence: 'weekly' })
    expect(sub).toMatchObject({ cadence: 'monthly', timeBucket: null })
  })

  it('surfaces exactly the four planted routines and no noise', () => {
    expect(report.routines).toHaveLength(4)
    // the one-off flight and dentist visit never surface
    expect(report.routines.some((r) => r.key === 'blue coast airlines' || r.key === 'city dental')).toBe(false)
    expect(report.monthlyRoutineCostCents).toBeGreaterThan(0)
  })

  it('stays silent on an all-one-off input (no false positives)', () => {
    // Genuinely non-repeating spend: distinct merchant AND category, spread out —
    // nothing clusters at either the merchant or category level.
    const oneOffs = [
      tx({ merchant: 'Store A', category: 'entertainment', date: '2026-04-02T14:00:00Z' }),
      tx({ merchant: 'Store B', category: 'health', date: '2026-04-20T10:00:00Z' }),
      tx({ merchant: 'Store C', category: 'fuel', date: '2026-05-08T09:00:00Z' }),
      tx({ merchant: 'Store D', category: 'dining', date: '2026-05-30T19:00:00Z' }),
      tx({ merchant: 'Store E', category: 'coffee', date: '2026-06-14T08:00:00Z' }),
    ]
    const r = detectRoutines(oneOffs, { now: D('2026-06-20T12:00:00Z') })
    expect(r.routines).toHaveLength(0)
    expect(r.monthlyRoutineCostCents).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// User Story 3 — monthly routine cost roll-up (T015)
// ---------------------------------------------------------------------------

describe('monthlyEquivalentCents', () => {
  it('applies the documented multiplier per cadence', () => {
    expect(monthlyEquivalentCents('weekly', 1000)).toBe(4345)
    expect(monthlyEquivalentCents('monthly', 1599)).toBe(1599)
    expect(monthlyEquivalentCents('weekday', 500)).toBe(10850)
    expect(monthlyEquivalentCents('daily', 500)).toBe(15000)
    expect(monthlyEquivalentCents('biweekly', 1000)).toBe(2170)
  })
})

describe('detectRoutines — US3 monthly cost roll-up', () => {
  it('sums each routine’s monthly-equivalent for mixed cadences', () => {
    const weekly = ['2026-05-04', '2026-05-11', '2026-05-18', '2026-05-25'].map((d) => tx({ merchant: 'Weekly Co', category: 'groceries', amount_cents: 1000, date: `${d}T15:00:00Z` }))
    const monthly = ['2026-03-27', '2026-04-26', '2026-05-26'].map((d) => tx({ merchant: 'Monthly Co', category: 'subs', amount_cents: 1599, date: `${d}T12:00:00Z` }))
    const report = detectRoutines([...weekly, ...monthly], { now: D('2026-05-27T12:00:00Z') })
    expect(report.routines).toHaveLength(2)
    expect(report.monthlyRoutineCostCents).toBe(4345 + 1599) // 5944
  })

  it('returns a zero, non-alarmist roll-up for empty input', () => {
    const report = detectRoutines([], { now: D('2026-06-15T12:00:00Z') })
    expect(report.routines).toEqual([])
    expect(report.monthlyRoutineCostCents).toBe(0)
  })
})
