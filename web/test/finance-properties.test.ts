import { describe, expect, it } from 'vitest'
import { computeShares, validateSplit, seedSplit, orderedOwnerIds, PERCENT_TOLERANCE } from '@/lib/splits'
import { toDisplayAmount, toUSDCents } from '@/lib/finance/money'
import { CURRENCIES, FALLBACK_RATE_FROM_USD } from '@/lib/finance/currency'
import { generateInsights } from '@/lib/finance/insights'
import { scoreFinancialHealth, type FinancialHealthInput } from '@/lib/finance/financialHealth'
import type { Transaction, Budget } from '@/lib/types'
import type { RoutineWithState } from '@/lib/finance/routines'

// ─────────────────────────────────────────────────────────────────────────────
// spec 025 — US1 CORRECTNESS ORACLE (property / invariant tests)
//
// These assert INVARIANTS that must hold for every input, not specific outputs
// pinned from the implementation. Inputs are fixed/seeded (never Math.random, so
// the suite is deterministic per the constitution). An invariant break here means
// a real correctness regression, not a stale snapshot.
// ─────────────────────────────────────────────────────────────────────────────

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)
const owners = (n: number) => Array.from({ length: n }, (_, i) => `owner-${String.fromCharCode(97 + i)}`)
const AMOUNTS = [0, 1, 2, 7, 99, 100, 101, 1000, 1234, 99_999, 100_000, 1_000_003]
const COUNTS = [1, 2, 3, 4, 5, 7]

describe('property — even shares always sum to the amount, none negative', () => {
  for (const amount of AMOUNTS) {
    for (const n of COUNTS) {
      it(`amount ${amount}¢ across ${n} owners`, () => {
        const shares = computeShares(amount, orderedOwnerIds(owners(n)), { method: 'even' })
        expect(sum(shares)).toBe(amount)
        for (const v of Object.values(shares)) expect(v).toBeGreaterThanOrEqual(0)
      })
    }
  }
})

describe('property — percent shares sum to the amount even at the tolerance edge', () => {
  // Percents may legally total 100 ± PERCENT_TOLERANCE. Both the under- and
  // over-100 edges must still produce shares that sum EXACTLY to the amount
  // (the floor-leftover distribution and the over-allocation reclaim path).
  const overPercents = { a: 33.5, b: 33.5, c: 33.4 } // sums to 100.4 (within 0.5)
  const underPercents = { a: 33.3, b: 33.3, c: 33.3 } // sums to 99.9 (within 0.5)
  it('the fixtures are within tolerance (guards the test itself)', () => {
    expect(validateSplit(1000, ['a', 'b', 'c'], { method: 'percent', percents: overPercents }).ok).toBe(true)
    expect(validateSplit(1000, ['a', 'b', 'c'], { method: 'percent', percents: underPercents }).ok).toBe(true)
    expect(Math.abs(33.5 + 33.5 + 33.4 - 100)).toBeLessThanOrEqual(PERCENT_TOLERANCE)
  })
  for (const amount of [100, 1000, 1234, 99_999]) {
    for (const [label, percents] of [['over-100', overPercents], ['under-100', underPercents]] as const) {
      it(`${label} percents on ${amount}¢ sum to amount, none negative`, () => {
        const shares = computeShares(amount, ['a', 'b', 'c'], { method: 'percent', percents })
        expect(sum(shares)).toBe(amount)
        for (const v of Object.values(shares)) expect(v).toBeGreaterThanOrEqual(0)
      })
    }
  }
})

describe('property — seedSplit round-trips losslessly through computeShares', () => {
  // computeShares(owners, seedSplit(stored)) === stored, for both even and custom
  // stored shares. This is the invariant the split editor relies on to reopen and
  // re-save a transaction to the cent.
  const cases: Array<{ name: string; amount: number; owners: string[]; stored: Record<string, number> }> = [
    { name: 'even 3-way', amount: 1000, owners: ['a', 'b', 'c'], stored: { a: 334, b: 333, c: 333 } },
    { name: 'custom 2-way', amount: 5000, owners: ['a', 'b'], stored: { a: 2000, b: 3000 } },
    { name: 'custom 3-way uneven', amount: 10_000, owners: ['a', 'b', 'c'], stored: { a: 1, b: 9998, c: 1 } },
    { name: 'single owner', amount: 4242, owners: ['solo'], stored: { solo: 4242 } },
  ]
  for (const c of cases) {
    it(c.name, () => {
      const ordered = orderedOwnerIds(c.owners)
      const seed = seedSplit(c.amount, ordered, c.stored)
      // SplitSeed is a subset of SplitInput, so it feeds computeShares directly.
      const rebuilt = computeShares(c.amount, ordered, seed)
      expect(rebuilt).toEqual(c.stored)
      expect(sum(rebuilt)).toBe(c.amount)
    })
  }
})

describe('property — currency conversion round-trips within display tolerance', () => {
  // cents → display(rounded to the currency's fraction digits) → cents should
  // return the original within the coarseness of one display unit. Worst case is
  // JPY (0 fraction digits) at a high rate; still < 2¢. USD at rate 1 is exact.
  const cents = [0, 1, 99, 100, 12_345, 1_000_000]
  for (const cur of CURRENCIES) {
    const rate = FALLBACK_RATE_FROM_USD[cur]
    for (const c of cents) {
      it(`${cur} @ ${rate}: ${c}¢ round-trips`, () => {
        const back = toUSDCents(toDisplayAmount(c, cur, rate), cur, rate)
        expect(Math.abs(back - c)).toBeLessThanOrEqual(2)
      })
    }
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// spec 027 — insights invariants
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2, positive: 3 }

const INSIGHT_ID_PATTERNS = [
  /^top-category-/,
  /^mom-/,
  /^budget-(over|near|under)-/,
  /^cashflow-/,
  /^recurring-/,
  /^outlier-/,
  /^trend30-/,
  /^mortgage-ratio-/,
]

let _txSeq = 0
function makeTxForProperty(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: `tx-prop-${++_txSeq}`,
    household_id: 'h',
    merchant: 'TestMerchant',
    category: 'dining',
    kind: 'expense',
    amount_cents: 5000,
    source: 's',
    date: '2026-06-15',
    created_by: 'x',
    created_at: '2026-06-15T12:00:00.000Z',
    updated_at: '2026-06-15T12:00:00.000Z',
    owner_ids: ['a'],
    shares: { a: 5000 },
    paid_by: 'a',
    ...overrides,
  }
}

describe('property — insights invariant 1: length ≤ limit', () => {
  const tx = makeTxForProperty()
  for (const limit of [1, 3, 5, 10, 20]) {
    it(`limit=${limit}`, () => {
      const now = new Date('2026-06-15T12:00:00.000Z')
      const insights = generateInsights([tx], [], [], now, limit)
      expect(insights.length).toBeLessThanOrEqual(limit)
    })
  }
})

describe('property — insights invariant 2: every id matches a documented pattern', () => {
  it('all returned insight ids match one of the 8 documented patterns', () => {
    const txs = [
      makeTxForProperty({ amount_cents: 12000, category: 'dining' }),
      makeTxForProperty({ amount_cents: 8000, category: 'groceries', date: '2026-05-15' }),
      makeTxForProperty({ merchant: 'Netflix', amount_cents: 1799, date: '2026-05-10' }),
      makeTxForProperty({ merchant: 'Netflix', amount_cents: 1799, date: '2026-04-10' }),
      makeTxForProperty({ merchant: 'Netflix', amount_cents: 1799, date: '2026-06-10' }),
    ]
    const budget: Budget = { id: 'b1', household_id: 'h', category: 'dining', monthly_limit_cents: 10000, budget_type: 'fixed', rollover_cap_cents: null, person_id: null }
    const now = new Date('2026-06-15T12:00:00.000Z')
    const insights = generateInsights(txs, [budget], [], now, 20)
    for (const insight of insights) {
      const matchesAny = INSIGHT_ID_PATTERNS.some((p) => p.test(insight.id))
      expect(matchesAny, `unexpected id "${insight.id}"`).toBe(true)
    }
  })
})

describe('property — insights invariant 3: magnitude_cents ≥ 0', () => {
  it('no insight has a negative magnitude', () => {
    const txs = [
      makeTxForProperty({ amount_cents: 5000 }),
      makeTxForProperty({ amount_cents: 100, date: '2026-05-15' }),
    ]
    const now = new Date('2026-06-15T12:00:00.000Z')
    const insights = generateInsights(txs, [], [], now, 20)
    for (const insight of insights) {
      expect(insight.magnitude_cents).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('property — insights invariant 4: sorted by severity (no lower rank precedes higher)', () => {
  it('insights are in non-decreasing severity rank order', () => {
    const txs = [
      makeTxForProperty({ amount_cents: 15000, category: 'dining' }),
      makeTxForProperty({ amount_cents: 3000, category: 'groceries', date: '2026-05-15' }),
      makeTxForProperty({ merchant: 'Netflix', amount_cents: 1799, date: '2026-05-10' }),
      makeTxForProperty({ merchant: 'Netflix', amount_cents: 1799, date: '2026-04-10' }),
      makeTxForProperty({ merchant: 'Netflix', amount_cents: 1799, date: '2026-06-10' }),
    ]
    const budget: Budget = { id: 'b2', household_id: 'h', category: 'dining', monthly_limit_cents: 10000, budget_type: 'fixed', rollover_cap_cents: null, person_id: null }
    const now = new Date('2026-06-15T12:00:00.000Z')
    const insights = generateInsights(txs, [budget], [], now, 20)
    for (let i = 1; i < insights.length; i++) {
      const prev = SEVERITY_RANK[insights[i - 1].severity] ?? 99
      const curr = SEVERITY_RANK[insights[i].severity] ?? 99
      expect(prev, `insight[${i - 1}].severity "${insights[i - 1].severity}" ranked higher than insight[${i}].severity "${insights[i].severity}"`).toBeLessThanOrEqual(curr)
    }
  })
})

// --- routine awareness (spec 044) — contracts/routine-awareness-dimension.md invariants 7-10 ----

const RA_NOW = new Date('2026-08-15')

function raExpense(amount_cents: number, date: string): Transaction {
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

function raRoutine(over: Partial<RoutineWithState>): RoutineWithState {
  return {
    routineKey: 'rc:netflix',
    kind: 'recurring_charge',
    merchantKey: 'netflix',
    merchantLabel: 'Netflix',
    category: 'streaming',
    weekday: null,
    hourBucket: null,
    personId: null,
    typicalAmountCents: 10000,
    amountVarianceCents: 0,
    occurrenceCount: 2,
    firstSeenAt: '2026-06-01',
    lastSeenAt: '2026-08-01',
    confidence: 90,
    derivedStatus: 'recognized',
    evidenceTransactionIds: [],
    status: 'confirmed',
    label: null,
    ...over,
  }
}

const raInput = (over: Partial<FinancialHealthInput> = {}): FinancialHealthInput => ({
  profile: null,
  transactions: [raExpense(100000, '2026-07-01')],
  budgets: [],
  goals: [],
  contributionsByGoal: {},
  weights: {},
  now: RA_NOW,
  ...over,
})

describe('property — routine_awareness: dismissing a routine never increases its score (while other active routines remain — hasData stays true on both sides)', () => {
  // Two routines contributing coverage; dismissing ONE (while the other stays active) can only
  // hold or lower the coverage ratio, never raise it.
  const twoActive = raInput({
    routines: [
      raRoutine({ routineKey: 'rc:a', status: 'confirmed', typicalAmountCents: 20000, occurrenceCount: 1 }),
      raRoutine({ routineKey: 'rc:b', status: 'confirmed', typicalAmountCents: 20000, occurrenceCount: 1 }),
    ],
  })
  const oneDismissed = raInput({
    routines: [
      raRoutine({ routineKey: 'rc:a', status: 'confirmed', typicalAmountCents: 20000, occurrenceCount: 1 }),
      raRoutine({ routineKey: 'rc:b', status: 'dismissed', typicalAmountCents: 20000, occurrenceCount: 1 }),
    ],
  })
  it('dismissing one of two active routines never raises the score', () => {
    const before = scoreFinancialHealth(twoActive).dimensions.find((d) => d.key === 'routine_awareness')!.score
    const after = scoreFinancialHealth(oneDismissed).dimensions.find((d) => d.key === 'routine_awareness')!.score
    expect(after).toBeLessThanOrEqual(before)
  })
})

describe('property — routine_awareness: dismissing the LAST active routine resets to neutral, not a penalized low score', () => {
  // This is a deliberate exception to strict monotonicity, not a bug: "zero active routines" is a
  // no-data state (hasData=false), which — like every other profile-null/no-data dimension in this
  // engine — reads as calm/neutral rather than judged against the coverage floor. A user dismissing
  // their only routine sees the dimension go quiet, not penalized.
  it('going from one low-coverage active routine to zero active routines lands on NEUTRAL (50)', () => {
    const oneActive = raInput({ routines: [raRoutine({ status: 'confirmed', typicalAmountCents: 20000, occurrenceCount: 1 })] })
    const zeroActive = raInput({ routines: [raRoutine({ status: 'dismissed', typicalAmountCents: 20000, occurrenceCount: 1 })] })
    const before = scoreFinancialHealth(oneActive).dimensions.find((d) => d.key === 'routine_awareness')!.score
    const after = scoreFinancialHealth(zeroActive).dimensions.find((d) => d.key === 'routine_awareness')!.score
    expect(before).toBeLessThan(50) // low coverage genuinely scores below neutral
    expect(after).toBe(50) // but "nothing left" is calm-neutral, not a continuation of the floor
  })
})

describe('property — routine_awareness: increasing its weight never decreases its composite share', () => {
  const base = raInput({ routines: [raRoutine({ typicalAmountCents: 60000, occurrenceCount: 1 })] }) // coverage 0.6 → 100
  it('for weights 1, 3, 5', () => {
    const scores = [1, 3, 5].map(
      (w) => scoreFinancialHealth({ ...base, weights: { routine_awareness: w } }).score
    )
    // routine_awareness scores 100 (well above the neutral other dimensions' 50) — up-weighting it
    // must never lower the composite.
    expect(scores[1]).toBeGreaterThanOrEqual(scores[0])
    expect(scores[2]).toBeGreaterThanOrEqual(scores[1])
  })
})

describe('property — routine_awareness: score always in [0,100] across varied coverage ratios', () => {
  const AMOUNTS = [0, 1, 5000, 50000, 100000, 500000, 1_000_000]
  for (const spend of AMOUNTS) {
    for (const routineAmount of AMOUNTS) {
      it(`window spend ${spend}¢, routine spend ${routineAmount}¢`, () => {
        const r = scoreFinancialHealth(
          raInput({
            transactions: spend > 0 ? [raExpense(spend, '2026-07-01')] : [],
            routines: routineAmount > 0 ? [raRoutine({ typicalAmountCents: routineAmount, occurrenceCount: 1 })] : [],
          })
        )
        const score = r.dimensions.find((d) => d.key === 'routine_awareness')!.score
        expect(score).toBeGreaterThanOrEqual(0)
        expect(score).toBeLessThanOrEqual(100)
      })
    }
  }
})
