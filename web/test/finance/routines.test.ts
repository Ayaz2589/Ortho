import { describe, expect, it } from 'vitest'
import {
  applyRoutineStates,
  detectRoutines,
  normalizeMerchantKey,
  type DetectedRoutine,
} from '../../lib/finance/routines'
import type { RecognizedRoutineState, Transaction } from '../../lib/types'

// Minimal Transaction factory — only the fields routines.ts reads. Mirrors
// test/finance/personSummary.test.ts's convention.
function tx(over: Partial<Transaction>): Transaction {
  return {
    id: `t-${Math.random().toString(36).slice(2)}`,
    household_id: 'h',
    merchant: 'Netflix',
    category: 'streaming',
    kind: 'expense',
    amount_cents: 1599,
    source: 'manual',
    date: '2026-06-15',
    created_by: 'u',
    created_at: '',
    updated_at: '',
    owner_ids: [],
    shares: {},
    ...over,
  } as Transaction
}

const NOW = new Date('2026-08-01')

function monthly(merchant: string, dates: string[], amount = 1599): Transaction[] {
  return dates.map((date) => tx({ id: `t-${merchant}-${date}`, merchant, date, amount_cents: amount }))
}

describe('normalizeMerchantKey', () => {
  it('strips a trailing POS store/location number', () => {
    expect(normalizeMerchantKey("Dunkin' #04521")).toBe('dunkin')
    expect(normalizeMerchantKey('DUNKIN 4521')).toBe('dunkin')
  })

  it('case-folds', () => {
    expect(normalizeMerchantKey('Blue Bottle Coffee')).toBe('blue bottle coffee')
    expect(normalizeMerchantKey('BLUE BOTTLE COFFEE')).toBe('blue bottle coffee')
  })

  it('collapses internal whitespace and punctuation', () => {
    expect(normalizeMerchantKey('Whole   Foods,  Inc.')).toBe('whole foods inc')
    expect(normalizeMerchantKey('  Netflix  ')).toBe('netflix')
  })

  it('is idempotent', () => {
    const once = normalizeMerchantKey("DD/BR #3401")
    expect(normalizeMerchantKey(once)).toBe(once)
  })

  it('does not strip short numbers that are part of the name itself', () => {
    // A 1-2 digit trailing number is plausibly part of the brand, not a store code —
    // only 3-6 digit POS/store codes are stripped (see routines-thresholds.ts).
    expect(normalizeMerchantKey('7 Eleven')).toBe('7 eleven')
  })
})

describe('detectRoutines — recurring_charge (FR-001/FR-002)', () => {
  it('detects a consistent monthly charge as a recurring_charge candidate', () => {
    const txns = monthly('Netflix', ['2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01'])
    const result = detectRoutines(txns, NOW)
    const routine = result.find((r) => r.kind === 'recurring_charge' && r.merchantKey === 'netflix')
    expect(routine).toBeDefined()
    expect(routine!.occurrenceCount).toBe(4)
    expect(routine!.typicalAmountCents).toBe(1599)
    expect(routine!.derivedStatus).toBe('recognized')
  })

  it('below the minimum occurrence count produces nothing', () => {
    const txns = monthly('Netflix', ['2026-07-01', '2026-08-01'])
    const result = detectRoutines(txns, NOW)
    expect(result.find((r) => r.merchantKey === 'netflix')).toBeUndefined()
  })

  it('rejects a group whose amounts fail the tolerance/hit-ratio gate', () => {
    const dates = ['2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01']
    const amounts = [1000, 1000, 1000, 5000, 5000] // 3/5 = 0.6 < default 0.75 hit ratio
    const txns = dates.map((date, i) => tx({ id: `t-${date}`, merchant: 'Spotty', date, amount_cents: amounts[i] }))
    const result = detectRoutines(txns, NOW)
    expect(result.find((r) => r.merchantKey === 'spotty')).toBeUndefined()
  })

  it('rejects a group whose cadence fails the gap-window gate', () => {
    // Weekly (7-day gaps) is well outside the 21-40 day recurring-charge band.
    const txns = monthly('Weekly Thing', ['2026-07-01', '2026-07-08', '2026-07-15', '2026-07-22'])
    const result = detectRoutines(txns, NOW)
    expect(result.find((r) => r.merchantKey === 'weekly thing')).toBeUndefined()
  })

  it('routineKey is `rc:<merchantKey>` and stable across a superset re-detection run', () => {
    const base = monthly('Hulu', ['2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01'])
    const superset = [...base, tx({ id: 't-hulu-extra', merchant: 'Hulu', date: '2026-04-01', amount_cents: 1599 })]
    const r1 = detectRoutines(base, NOW).find((r) => r.merchantKey === 'hulu')!
    const r2 = detectRoutines(superset, NOW).find((r) => r.merchantKey === 'hulu')!
    expect(r1.routineKey).toBe('rc:hulu')
    expect(r1.routineKey).toBe(r2.routineKey)
  })

  it('confidence is always within [0,100]', () => {
    const txns = monthly('Netflix', ['2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01'])
    const routine = detectRoutines(txns, NOW).find((r) => r.merchantKey === 'netflix')!
    expect(routine.confidence).toBeGreaterThanOrEqual(0)
    expect(routine.confidence).toBeLessThanOrEqual(100)
  })

  it('reads as lapsed once the pattern has missed its expected cycles', () => {
    // Window is 6 months trailing NOW (2026-08-01), so windowStart ≈ 2026-02-01 —
    // only the 3 in-window occurrences count; last seen 2026-04-01, ~122 days
    // before NOW, well past 2 missed ~30-day cycles (60 days).
    const txns = monthly('Old Gym', ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01'])
    const routine = detectRoutines(txns, NOW).find((r) => r.merchantKey === 'old gym')!
    expect(routine).toBeDefined()
    expect(routine.derivedStatus).toBe('lapsed')
  })
})

describe('applyRoutineStates', () => {
  const base: DetectedRoutine = {
    routineKey: 'rc:netflix',
    kind: 'recurring_charge',
    merchantKey: 'netflix',
    merchantLabel: 'Netflix',
    category: 'streaming',
    weekday: null,
    hourBucket: null,
    personId: null,
    typicalAmountCents: 1599,
    amountVarianceCents: 0,
    occurrenceCount: 4,
    firstSeenAt: '2026-05-01',
    lastSeenAt: '2026-08-01',
    confidence: 90,
    derivedStatus: 'recognized',
    evidenceTransactionIds: ['a', 'b', 'c', 'd'],
  }
  const state = (over: Partial<RecognizedRoutineState>): RecognizedRoutineState => ({
    id: 's1',
    household_id: 'h',
    routine_key: 'rc:netflix',
    status: 'confirmed',
    label: null,
    person_id: null,
    created_by: 'u',
    created_at: '',
    updated_at: '',
    ...over,
  })

  it('no matching state row → status falls back to derivedStatus, label null', () => {
    const [out] = applyRoutineStates([base], [])
    expect(out.status).toBe('recognized')
    expect(out.label).toBeNull()
  })

  it('a dismissed state row always wins over derivedStatus', () => {
    const [out] = applyRoutineStates([base], [state({ status: 'dismissed' })])
    expect(out.status).toBe('dismissed')
  })

  it('a confirmed state row wins when the routine is still recognized', () => {
    const [out] = applyRoutineStates([base], [state({ status: 'confirmed' })])
    expect(out.status).toBe('confirmed')
  })

  it('lapsed derivedStatus wins even over a confirmed state row', () => {
    const lapsed = { ...base, derivedStatus: 'lapsed' as const }
    const [out] = applyRoutineStates([lapsed], [state({ status: 'confirmed' })])
    expect(out.status).toBe('lapsed')
  })

  it('label falls back to null when the state row carries no rename', () => {
    const [out] = applyRoutineStates([base], [state({ status: 'confirmed', label: null })])
    expect(out.label).toBeNull()
  })

  it('label reflects a non-null rename', () => {
    const [out] = applyRoutineStates([base], [state({ status: 'confirmed', label: 'Streaming bill' })])
    expect(out.label).toBe('Streaming bill')
  })

  it('output length always equals input length (never drops a routine)', () => {
    const out = applyRoutineStates([base, { ...base, routineKey: 'rc:other' }], [])
    expect(out.length).toBe(2)
  })
})
