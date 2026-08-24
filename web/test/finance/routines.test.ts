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

describe('detectRoutines — behavioral_habit (FR-003)', () => {
  // research.md §6b: no transaction source carries a real time-of-day (every write path pins to
  // noon-UTC), so behavioral grouping keys on weekday only — hourBucket stays reserved/null.
  const NOW2 = new Date('2026-08-15')
  const mondays = ['2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27', '2026-08-03', '2026-08-10']
  const expectedWeekday = new Date('2026-07-06T00:00:00Z').getUTCDay()

  function habit(merchant: string, dates: string[], amounts: number[]): Transaction[] {
    return dates.map((date, i) =>
      tx({ id: `t-${merchant}-${date}`, merchant, date, amount_cents: amounts[i], category: 'coffee' })
    )
  }

  it('detects a weekday-consistent habit with varying amounts', () => {
    const amounts = [300, 350, 280, 320, 310, 290]
    const txns = habit('Blue Bottle', mondays, amounts)
    const routine = detectRoutines(txns, NOW2).find((r) => r.kind === 'behavioral_habit')
    expect(routine).toBeDefined()
    expect(routine!.merchantKey).toBe('blue bottle')
    expect(routine!.weekday).toBe(expectedWeekday)
    expect(routine!.occurrenceCount).toBe(6)
    expect(routine!.amountVarianceCents).toBeGreaterThan(0)
  })

  it('hourBucket is always null (no real time-of-day signal exists today)', () => {
    const txns = habit('Blue Bottle', mondays, [300, 350, 280, 320, 310, 290])
    const routine = detectRoutines(txns, NOW2).find((r) => r.kind === 'behavioral_habit')!
    expect(routine.hourBucket).toBeNull()
  })

  it('routineKey is `bh:<merchantKey>:<weekday>`', () => {
    const txns = habit('Blue Bottle', mondays, [300, 350, 280, 320, 310, 290])
    const routine = detectRoutines(txns, NOW2).find((r) => r.kind === 'behavioral_habit')!
    expect(routine.routineKey).toBe(`bh:blue bottle:${expectedWeekday}`)
  })

  it('below the minimum occurrence count produces nothing', () => {
    const txns = habit('Rare Spot', mondays.slice(0, 3), [300, 300, 300])
    expect(detectRoutines(txns, NOW2).find((r) => r.merchantKey === 'rare spot')).toBeUndefined()
  })

  it('genuinely irregular spending (different weekday each time) never produces a habit', () => {
    const dates = ['2026-07-06', '2026-07-14', '2026-07-22', '2026-07-30', '2026-08-07', '2026-08-11']
    const txns = habit('Scattered', dates, [400, 400, 400, 400, 400, 400])
    expect(detectRoutines(txns, NOW2).find((r) => r.merchantKey === 'scattered' && r.kind === 'behavioral_habit')).toBeUndefined()
  })

  it('bank-import transactions still contribute to recurring_charge detection (unaffected by FR-003)', () => {
    const txns = monthly('Import Sub', ['2026-05-15', '2026-06-15', '2026-07-15', '2026-08-15'])
    const routine = detectRoutines(txns, NOW2).find((r) => r.merchantKey === 'import sub')
    expect(routine?.kind).toBe('recurring_charge')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Review 2026-08-24, B9: normalizeMerchantKey stripped every character outside
// [a-z0-9\s], so ANY merchant name in a non-Latin script — four of the app's
// five translated locales — collapsed to the EMPTY key: all such merchants
// merged into one routine identity ('rc:'), breaking or misattributing
// recurring detection for those households. Normalization must be
// Unicode-aware, and an unnormalizable name must never form a group.
// ─────────────────────────────────────────────────────────────────────────────
describe('non-Latin merchant identities (B9)', () => {
  const NOW_B9 = new Date('2026-08-20T12:00:00.000Z')

  it('two Japanese merchants keep distinct routine identities', () => {
    const txns = [
      ...monthly('セブンイレブン', ['2026-05-05', '2026-06-05', '2026-07-05', '2026-08-05'], 1200),
      ...monthly('ローソン', ['2026-05-20', '2026-06-20', '2026-07-20', '2026-08-20'], 890),
    ]
    const routines = detectRoutines(txns, NOW_B9).filter((r) => r.kind === 'recurring_charge')
    expect(routines).toHaveLength(2)
    expect(new Set(routines.map((r) => r.merchantKey)).size).toBe(2)
    expect(routines.every((r) => r.merchantKey !== '')).toBe(true)
  })

  it('normalizeMerchantKey keeps non-Latin letters and still strips store codes', () => {
    expect(normalizeMerchantKey('세븐일레븐 1234')).toBe('세븐일레븐')
    expect(normalizeMerchantKey('স্টারবাকস')).toBe('স্টারবাকস')
    expect(normalizeMerchantKey('7-Eleven #1234')).toBe(normalizeMerchantKey('7 Eleven 1234'))
  })

  it('an all-punctuation merchant name never forms a routine group', () => {
    const txns = monthly('###', ['2026-05-05', '2026-06-05', '2026-07-05', '2026-08-05'])
    expect(detectRoutines(txns, NOW_B9)).toHaveLength(0)
  })
})
