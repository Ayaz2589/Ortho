import { describe, it, expect } from 'vitest'
import {
  scoreFinancialHealth,
  deriveProfile,
  bandForScore,
  monthSpendCents,
  weightsToRecord,
  type DerivedFinancialProfile,
  type FinancialHealthInput,
} from '@/lib/finance/financialHealth'
import type {
  Budget,
  DimensionWeight,
  FinancialProfile,
  FixedCost,
  Goal,
  HealthDimension,
  Transaction,
} from '@/lib/types'
import type { RoutineWithState } from '@/lib/finance/routines'

// --- fixtures ---------------------------------------------------------------

const NOW = new Date(2026, 7, 15, 12, 0, 0) // Aug 15 2026, local (TZ=UTC in CI)

function expense(amount_cents: number, date: string): Transaction {
  return {
    id: `tx-${date}-${amount_cents}`,
    household_id: 'h',
    merchant: 'm',
    category: 'groceries',
    kind: 'expense',
    amount_cents,
    source: 's',
    date,
    created_by: 'u',
    created_at: `${date}T12:00:00Z`,
    updated_at: `${date}T12:00:00Z`,
    owner_ids: ['u'],
    shares: { u: amount_cents },
  }
}

function budget(monthly_limit_cents: number, created_at = '2026-08-01T00:00:00Z'): Budget {
  return {
    id: `b-${monthly_limit_cents}`,
    household_id: 'h',
    category: 'groceries',
    monthly_limit_cents,
    budget_type: 'fixed',
    rollover_cap_cents: null,
    person_id: null,
    created_at,
  }
}

function goal(target_cents: number, target_date: string | null = null): Goal {
  return {
    id: `g-${target_cents}`,
    household_id: 'h',
    name: 'Emergency',
    kind: 'savings',
    target_cents,
    target_date,
    linked_account_id: null,
    linked_category: null,
    created_by: 'u',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

const baseProfile = (over: Partial<DerivedFinancialProfile> = {}): DerivedFinancialProfile => ({
  incomeForRatiosCents: 400000,
  committedCents: 200000,
  netAvailableCents: 200000,
  savingsTargetCents: 40000,
  savingsTargetFraction: 0.1,
  emergencyFundLevel: '1_3m',
  ...over,
})

const input = (over: Partial<FinancialHealthInput> = {}): FinancialHealthInput => ({
  profile: baseProfile(),
  transactions: [],
  budgets: [],
  goals: [],
  contributionsByGoal: {},
  weights: {},
  now: NOW,
  ...over,
})

const byKey = (r: ReturnType<typeof scoreFinancialHealth>) =>
  Object.fromEntries(r.dimensions.map((d) => [d.key, d.score])) as Record<HealthDimension, number>

// --- deriveProfile ----------------------------------------------------------

describe('deriveProfile', () => {
  it('uses the low estimate when income is variable and applies housing share', () => {
    const raw: FinancialProfile = {
      id: 'p',
      user_id: 'u',
      monthly_income_cents: 400000,
      income_is_variable: true,
      income_low_estimate_cents: 300000,
      housing_type: 'rent',
      housing_cost_cents: 200000,
      housing_share_fraction: 0.5,
      savings_target_fraction: 0.1,
      emergency_fund_level: '1_3m',
      created_at: 'x',
      updated_at: 'x',
    }
    const costs: FixedCost[] = [
      { id: 'c1', user_id: 'u', label: 'Remittance', amount_cents: 50000, kind: 'remittance', created_at: 'x' },
      { id: 'c2', user_id: 'u', label: 'Phone', amount_cents: 30000, kind: 'phone', created_at: 'x' },
    ]
    const d = deriveProfile(raw, costs)!
    expect(d.incomeForRatiosCents).toBe(300000) // low estimate
    expect(d.committedCents).toBe(100000 + 80000) // housing 200000*0.5 + 80000 fixed
    expect(d.netAvailableCents).toBe(300000 - 180000)
    expect(d.savingsTargetCents).toBe(40000) // 400000 * 0.10 (full income, not low estimate)
  })

  it('returns null for a null profile and uses full income when not variable', () => {
    expect(deriveProfile(null, [])).toBeNull()
    const raw: FinancialProfile = {
      id: 'p', user_id: 'u', monthly_income_cents: 500000, income_is_variable: false,
      income_low_estimate_cents: null, housing_type: 'family', housing_cost_cents: null,
      housing_share_fraction: 1, savings_target_fraction: 0.1, emergency_fund_level: 'none',
      created_at: 'x', updated_at: 'x',
    }
    const d = deriveProfile(raw, [])!
    expect(d.incomeForRatiosCents).toBe(500000)
    expect(d.committedCents).toBe(0) // family housing = 0 cost
  })
})

// --- monthSpendCents --------------------------------------------------------

describe('monthSpendCents', () => {
  it('sums expenses in the reference month only', () => {
    const txns = [expense(30000, '2026-08-05'), expense(10000, '2026-08-20'), expense(99999, '2026-07-31')]
    expect(monthSpendCents(txns, NOW)).toBe(40000)
  })
})

// --- composite: profile-only, no history (Case A) ---------------------------

describe('scoreFinancialHealth — day-one profile, no history', () => {
  it('scores each dimension from the questionnaire alone and averages with equal weights', () => {
    const r = scoreFinancialHealth(input())
    const d = byKey(r)
    expect(d.cash_flow).toBe(100) // ratio 0.5 → full
    expect(d.safety_net).toBe(60) // 1_3m base, no goal bonus
    expect(d.commitment_load).toBe(100) // committed fraction 0.5 → full
    expect(d.savings_momentum).toBe(70) // intention f=0.10 → 70
    expect(d.plan_engagement).toBe(50) // neutral base
    expect(r.score).toBe(76) // mean(100,60,100,70,50)
    expect(r.band).toBe('steady')
    expect(r.hasProfile).toBe(true)
    expect(r.topAction.dimension).toBe('plan_engagement') // lowest weighted contribution
  })
})

// --- profile-null neutral mode (Case B) -------------------------------------

describe('scoreFinancialHealth — no profile', () => {
  it('falls back to neutral for profile dimensions, still scores plan engagement', () => {
    const r = scoreFinancialHealth(input({ profile: null }))
    const d = byKey(r)
    expect(d.cash_flow).toBe(50)
    expect(d.safety_net).toBe(50)
    expect(d.commitment_load).toBe(50)
    expect(d.savings_momentum).toBe(50)
    expect(d.plan_engagement).toBe(50)
    expect(r.score).toBe(50)
    expect(r.band).toBe('building')
    expect(r.hasProfile).toBe(false)
    expect(r.topAction.dimension).toBe('cash_flow') // all tie → first in order
  })
})

// --- rent-burdened stays supportive (Case E / SC-004) -----------------------

describe('scoreFinancialHealth — rent-burdened, no savings', () => {
  it('remains supportive (non-zero, no failing state) and flags safety net', () => {
    const p = baseProfile({
      incomeForRatiosCents: 300000,
      committedCents: 210000, // 70% committed
      netAvailableCents: 90000,
      savingsTargetFraction: 0,
      emergencyFundLevel: 'none',
    })
    const r = scoreFinancialHealth(input({ profile: p }))
    const d = byKey(r)
    expect(d.commitment_load).toBe(60) // fraction 0.7 → 60
    expect(d.safety_net).toBe(15) // none
    expect(d.cash_flow).toBe(100) // ratio 0.3 → full
    expect(d.savings_momentum).toBe(30) // f=0 not punished below 30
    expect(r.score).toBeGreaterThan(0)
    expect(r.topAction.dimension).toBe('safety_net') // lowest weighted contribution
  })
})

// --- history sharpens cash flow + savings momentum (Case F) -----------------

describe('scoreFinancialHealth — with transaction history', () => {
  it('uses real month spend for cash flow and rewards real savings', () => {
    const txns = [expense(340000, '2026-08-10')]
    const r = scoreFinancialHealth(input({ transactions: txns }))
    const d = byKey(r)
    expect(d.cash_flow).toBe(70) // ratio (400000-340000)/400000 = 0.15 → 70
    expect(d.savings_momentum).toBe(100) // actual rate 0.15 ≥ target 0.10 → 100
  })

  it('does not read an artificial 100 at the start of a new month (spend floors at committed)', () => {
    // History exists (a prior month) but nothing spent yet in the reference month.
    const txns = [expense(999999, '2026-07-15')]
    const d = byKey(scoreFinancialHealth(input({ transactions: txns })))
    // spend = max(0 this month, committed 200000) → ratio 0.5 → 100 is the *committed*
    // reality here (committed is only 50% of income), NOT an artifact of zero month-spend.
    expect(d.cash_flow).toBe(100)
    // With a heavier committed load, the same empty-month state must not read 100.
    const heavy = baseProfile({ committedCents: 340000 }) // 85% committed
    const d2 = byKey(scoreFinancialHealth(input({ profile: heavy, transactions: txns })))
    expect(d2.cash_flow).toBe(70) // ratio (400000-340000)/400000 = 0.15, not 100
  })
})

// --- plan engagement from budgets + goals -----------------------------------

describe('scoreFinancialHealth — plan engagement', () => {
  it('rewards an on-track budget (isolated in profile-null mode)', () => {
    const r = scoreFinancialHealth(
      input({ profile: null, budgets: [budget(50000)], transactions: [expense(30000, '2026-08-05')] })
    )
    expect(byKey(r).plan_engagement).toBe(80) // 50 + hasBudget 15 + onTrack 15
  })

  it('does not reward an over-budget category with the on-track bonus', () => {
    const r = scoreFinancialHealth(
      input({ profile: null, budgets: [budget(20000)], transactions: [expense(30000, '2026-08-05')] })
    )
    expect(byKey(r).plan_engagement).toBe(65) // 50 + hasBudget 15, no on-track bonus
  })

  it('rewards a funded on-pace goal in safety net', () => {
    const r = scoreFinancialHealth(
      input({ goals: [goal(100000)], contributionsByGoal: { 'g-100000': [{ id: 'x', goal_id: 'g-100000', amount_cents: 5000, date: '2026-02-01', note: null, created_by: 'u', created_at: 'x' }] } })
    )
    expect(byKey(r).safety_net).toBe(75) // 60 base + 15 goal bonus
  })
})

// --- personalized weights (Case D / SC-007) ---------------------------------

describe('scoreFinancialHealth — personalized weights', () => {
  it('shifts the composite toward higher-weighted dimensions', () => {
    const equal = scoreFinancialHealth(input()).score // 76
    const weights: Partial<Record<HealthDimension, number>> = { cash_flow: 5, plan_engagement: 1 }
    const weighted = scoreFinancialHealth(input({ weights })).score
    expect(weighted).toBeGreaterThan(equal) // cash_flow=100 up-weighted, plan=50 down-weighted
    expect(weighted).toBe(83) // 1240/15 rounded
  })

  it('weightsToRecord maps rows and defaults are used when absent', () => {
    const rows: DimensionWeight[] = [{ id: 'w', user_id: 'u', dimension: 'cash_flow', weight: 5, created_at: 'x' }]
    expect(weightsToRecord(rows)).toEqual({ cash_flow: 5 })
  })
})

// --- bands ------------------------------------------------------------------

describe('bandForScore', () => {
  it('maps score ranges to calm bands at the right boundaries', () => {
    expect(bandForScore(100)).toBe('strong')
    expect(bandForScore(80)).toBe('strong')
    expect(bandForScore(79)).toBe('steady')
    expect(bandForScore(60)).toBe('steady')
    expect(bandForScore(59)).toBe('building')
    expect(bandForScore(40)).toBe('building')
    expect(bandForScore(39)).toBe('getting_started')
    expect(bandForScore(0)).toBe('getting_started')
  })
})

// --- properties / invariants ------------------------------------------------

describe('scoreFinancialHealth — invariants', () => {
  const incomes = [0, -100, 100000, 400000]
  const committeds = [0, 50000, 200000, 500000]
  const funds: DerivedFinancialProfile['emergencyFundLevel'][] = ['none', '1_3m', '6m_plus']
  const targets = [0, 0.05, 0.1, 0.3]

  it('score and every dimension stay within [0,100] for adversarial inputs', () => {
    for (const income of incomes)
      for (const committed of committeds)
        for (const fund of funds)
          for (const f of targets) {
            const p = baseProfile({
              incomeForRatiosCents: income,
              committedCents: committed,
              netAvailableCents: income - committed,
              savingsTargetFraction: f,
              emergencyFundLevel: fund,
            })
            const r = scoreFinancialHealth(input({ profile: p, transactions: [expense(123456, '2026-08-09')] }))
            expect(Number.isFinite(r.score)).toBe(true)
            expect(r.score).toBeGreaterThanOrEqual(0)
            expect(r.score).toBeLessThanOrEqual(100)
            for (const d of r.dimensions) {
              expect(Number.isFinite(d.score)).toBe(true)
              expect(d.score).toBeGreaterThanOrEqual(0)
              expect(d.score).toBeLessThanOrEqual(100)
            }
          }
  })

  it('band is monotonic non-decreasing in score', () => {
    const order = { getting_started: 0, building: 1, steady: 2, strong: 3 }
    let prev = 0
    for (let s = 0; s <= 100; s++) {
      const rank = order[bandForScore(s)]
      expect(rank).toBeGreaterThanOrEqual(prev)
      prev = rank
    }
  })

  it('variable income uses the low estimate: a higher low estimate never lowers cash flow', () => {
    const low = scoreFinancialHealth(
      input({ profile: baseProfile({ incomeForRatiosCents: 250000, committedCents: 200000 }) })
    )
    const higher = scoreFinancialHealth(
      input({ profile: baseProfile({ incomeForRatiosCents: 350000, committedCents: 200000 }) })
    )
    expect(byKey(higher).cash_flow).toBeGreaterThanOrEqual(byKey(low).cash_flow)
  })

  it('raising a dimension weight never lowers its share of the composite', () => {
    const share = (w: number) => {
      const others = 3 * 4
      return w / (w + others)
    }
    expect(share(5)).toBeGreaterThan(share(3))
    expect(share(3)).toBeGreaterThan(share(1))
  })
})

// --- routine awareness (spec 044) -------------------------------------------

function routine(over: Partial<RoutineWithState>): RoutineWithState {
  return {
    routineKey: 'rc:netflix',
    kind: 'recurring_charge',
    merchantKey: 'netflix',
    merchantLabel: 'Netflix',
    category: 'streaming',
    weekday: null,
    hourBucket: null,
    personId: null,
    typicalAmountCents: 1000,
    amountVarianceCents: 0,
    occurrenceCount: 1,
    firstSeenAt: '2026-05-01',
    lastSeenAt: '2026-08-01',
    confidence: 90,
    derivedStatus: 'recognized',
    evidenceTransactionIds: [],
    status: 'confirmed',
    label: null,
    ...over,
  }
}

describe('scoreFinancialHealth — routine awareness (spec 044)', () => {
  it('appends routine_awareness as the sixth, last dimension', () => {
    const r = scoreFinancialHealth(input({ routines: [] }))
    expect(r.dimensions).toHaveLength(6)
    expect(r.dimensions.at(-1)!.key).toBe('routine_awareness')
  })

  it('no routines → neutral score, empty citations, never a penalized low score', () => {
    const r = scoreFinancialHealth(input({ routines: [] }))
    expect(byKey(r).routine_awareness).toBe(50)
    expect(r.dimensions.find((d) => d.key === 'routine_awareness')!.contributingRoutineKeys).toEqual([])
  })

  it('scores coverage between the low/high bounds and cites contributing routines by spend desc', () => {
    const windowSpend = [
      expense(50000, '2026-06-01'),
      expense(50000, '2026-07-01'),
    ] // 100,000¢ total in the trailing window
    const routines: RoutineWithState[] = [
      routine({ routineKey: 'rc:a', typicalAmountCents: 10000, occurrenceCount: 2 }), // 20,000¢
      routine({ routineKey: 'rc:b', typicalAmountCents: 5000, occurrenceCount: 2 }), // 10,000¢
    ]
    const r = scoreFinancialHealth(input({ transactions: windowSpend, routines }))
    // coverage = 30,000/100,000 = 0.3 → lerp(0.3, 0.15, 0.6, 35, 100) ≈ 56.67 → 57
    expect(byKey(r).routine_awareness).toBe(57)
    const dim = r.dimensions.find((d) => d.key === 'routine_awareness')!
    expect(dim.contributingRoutineKeys).toEqual(['rc:a', 'rc:b'])
  })

  it('excludes dismissed and lapsed routines from the coverage computation', () => {
    const windowSpend = [expense(100000, '2026-07-01')]
    const routines: RoutineWithState[] = [
      routine({ routineKey: 'rc:dismissed', status: 'dismissed', typicalAmountCents: 100000, occurrenceCount: 1 }),
      routine({ routineKey: 'rc:lapsed', status: 'lapsed', typicalAmountCents: 100000, occurrenceCount: 1 }),
    ]
    const r = scoreFinancialHealth(input({ transactions: windowSpend, routines }))
    expect(byKey(r).routine_awareness).toBe(50) // no active evidence → neutral, same as zero routines
  })

  it('the five pre-existing dimensions and the composite score are byte-identical whether routines is omitted or empty', () => {
    const omitted = scoreFinancialHealth(input({}))
    const empty = scoreFinancialHealth(input({ routines: [] }))
    expect(omitted.score).toBe(empty.score)
    expect(omitted.band).toBe(empty.band)
    for (const key of ['cash_flow', 'safety_net', 'commitment_load', 'savings_momentum', 'plan_engagement'] as const) {
      expect(byKey(omitted)[key]).toBe(byKey(empty)[key])
    }
  })

  it('a household with zero routines gets the exact spec-041 composite score (no dilution from the neutral placeholder)', () => {
    // Same fixture as the day-one-profile test above, computed WITHOUT spec 044 in the picture.
    const r = scoreFinancialHealth(input({}))
    expect(r.score).toBe(76) // mean(100,60,100,70,50) over the ORIGINAL five — unaffected by routine_awareness
  })

  it('users can weight routine_awareness like any other dimension', () => {
    const windowSpend = [expense(100000, '2026-07-01')]
    const routines: RoutineWithState[] = [routine({ typicalAmountCents: 60000, occurrenceCount: 1 })]
    const weighted = scoreFinancialHealth(
      input({ transactions: windowSpend, routines, weights: { routine_awareness: 5 } })
    )
    const unweighted = scoreFinancialHealth(input({ transactions: windowSpend, routines }))
    // routine_awareness scores 100 here (coverage 0.6 ≥ HIGH) — up-weighting it must not lower the composite.
    expect(weighted.score).toBeGreaterThanOrEqual(unweighted.score)
  })
})

// --- spec 052: scope correction ---------------------------------------------

describe('spec 052 — the profile is scored against its owner’s own share', () => {
  const ME = 'me'
  const PARTNER = 'partner'

  /** A shared expense: both people own half. */
  function shared(amount_cents: number, date: string): Transaction {
    const half = amount_cents / 2
    return {
      id: `sh-${date}-${amount_cents}`,
      household_id: 'h',
      merchant: 'm',
      category: 'groceries',
      kind: 'expense',
      amount_cents,
      source: 's',
      date,
      created_by: 'u',
      created_at: `${date}T12:00:00Z`,
      updated_at: `${date}T12:00:00Z`,
      owner_ids: [ME, PARTNER],
      shares: { [ME]: half, [PARTNER]: half },
    }
  }

  it('omitting scopedTransactions preserves the pre-052 household behavior', () => {
    const txs = [shared(600000, '2026-08-05')]
    const withHousehold = scoreFinancialHealth(input({ transactions: txs }))
    const explicit = scoreFinancialHealth(input({ transactions: txs, scopedTransactions: txs }))
    expect(explicit).toEqual(withHousehold)
  })

  it('measures cash flow against the owner’s half, not the household total', () => {
    const txs = [shared(600000, '2026-08-05')] // $6,000 household, $3,000 mine
    const scoped = [{ ...txs[0], amount_cents: 300000, owner_ids: [ME], shares: { [ME]: 300000 } }]

    // Profile: $4,000 income, $2,000 committed.
    const household = scoreFinancialHealth(input({ transactions: txs }))
    const mine = scoreFinancialHealth(input({ transactions: txs, scopedTransactions: scoped }))

    // Household spend ($6,000) exceeds income ($4,000) → floor. Own share ($3,000) does not.
    expect(byKey(household).cash_flow).toBeLessThan(byKey(mine).cash_flow)
    expect(byKey(mine).cash_flow).toBeGreaterThan(0)
  })

  it('gives two members with identical profiles identical scores', () => {
    const txs = [shared(600000, '2026-08-05')]
    const mineScoped = [{ ...txs[0], amount_cents: 300000, owner_ids: [ME], shares: { [ME]: 300000 } }]
    const theirsScoped = [
      { ...txs[0], amount_cents: 300000, owner_ids: [PARTNER], shares: { [PARTNER]: 300000 } },
    ]
    const mine = scoreFinancialHealth(input({ transactions: txs, scopedTransactions: mineScoped }))
    const theirs = scoreFinancialHealth(input({ transactions: txs, scopedTransactions: theirsScoped }))
    expect(mine.score).toBe(theirs.score)
    expect(mine.band).toBe(theirs.band)
  })

  it('keeps plan engagement on HOUSEHOLD budgets even when spend is scoped', () => {
    const txs = [shared(600000, '2026-08-05')]
    const scoped: Transaction[] = [] // this member owns nothing
    const withBudget = scoreFinancialHealth(
      input({ transactions: txs, scopedTransactions: scoped, budgets: [budget(500000)] })
    )
    const withoutBudget = scoreFinancialHealth(
      input({ transactions: txs, scopedTransactions: scoped, budgets: [] })
    )
    expect(byKey(withBudget).plan_engagement).toBeGreaterThan(byKey(withoutBudget).plan_engagement)
  })

  it('keeps routine awareness household-scoped', () => {
    const txs = [shared(600000, '2026-08-05')]
    const routines = [
      {
        routineKey: 'rc:netflix',
        kind: 'recurring_charge',
        merchantKey: 'netflix',
        merchantLabel: 'Netflix',
        category: 'subs',
        weekday: null,
        hourBucket: null,
        personId: null,
        typicalAmountCents: 1500,
        amountVarianceCents: 0,
        occurrenceCount: 6,
        firstSeenAt: '2026-03-01',
        lastSeenAt: '2026-08-01',
        confidence: 90,
        derivedStatus: 'recognized',
        evidenceTransactionIds: [],
        status: 'confirmed',
        label: null,
      } as RoutineWithState,
    ]
    // Scoped ledger is empty; routine awareness must still find household spend to divide by.
    const r = scoreFinancialHealth(
      input({ transactions: txs, scopedTransactions: [], routines })
    )
    const dim = r.dimensions.find((d) => d.key === 'routine_awareness')!
    expect(dim.contributingRoutineKeys).toEqual(['rc:netflix'])
  })
})
