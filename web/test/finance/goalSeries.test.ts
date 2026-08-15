import { describe, it, expect } from 'vitest'
import { cumulativeSeries, monthlySeries } from '@/lib/finance/goalSeries'
import { goalProgress, goalPacing } from '@/lib/finance/goals'
import type { GoalContribution } from '@/lib/types'

// spec 045 — the two chart series behind the goal detail page. Pure, integer USD
// cents, injected reference date. The load-bearing properties are the two
// identities: the cumulative line must END at the goal's saved total, and the
// monthly bars must SUM to it. Those are what stop a chart from ever quietly
// disagreeing with the headline figure printed above it.
//
// Property cases use a seeded LCG, never Math.random — deterministic fixtures per
// the constitution, mirroring test/finance/routines-properties.test.ts.

const CREATED = '2026-01-10T00:00:00.000Z'
const NOW = new Date(2026, 5, 15) // 2026-06-15 local

const c = (date: string, cents: number, id = `${date}-${cents}`): GoalContribution => ({
  id,
  goal_id: 'g1',
  amount_cents: cents,
  date,
  note: null,
  created_by: 'u1',
  created_at: `${date}T00:00:00.000Z`,
})

const dated = (targetDate: string | null, targetCents = 100000) => ({
  targetCents,
  targetDate,
  createdAt: CREATED,
  now: NOW,
})

/** Deterministic LCG (numerical recipes constants) — seeded, never Math.random. */
function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

/** `count` pseudo-random contribution sets, each 1–40 rows across 2026. */
function generatedCases(count: number): GoalContribution[][] {
  const cases: GoalContribution[][] = []
  for (let n = 0; n < count; n++) {
    const rnd = lcg(0xc0ffee + n * 7919)
    const rows = 1 + Math.floor(rnd() * 40)
    const set: GoalContribution[] = []
    for (let i = 0; i < rows; i++) {
      const month = 1 + Math.floor(rnd() * 12)
      const day = 1 + Math.floor(rnd() * 28)
      const cents = 1 + Math.floor(rnd() * 500000)
      set.push(
        c(`2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, cents, `g${n}-${i}`)
      )
    }
    cases.push(set)
  }
  return cases
}

const CASES = generatedCases(200)

describe('cumulativeSeries', () => {
  it('is empty for a goal with no contributions', () => {
    expect(cumulativeSeries([], dated('2026-12-31'))).toEqual([])
  })

  it('is ascending by day and non-decreasing in cumulative cents', () => {
    const series = cumulativeSeries(
      [c('2026-03-01', 5000), c('2026-02-01', 3000), c('2026-04-15', 2000)],
      dated('2026-12-31')
    )
    const days = series.map((p) => p.day)
    expect([...days].sort()).toEqual(days)
    for (let i = 1; i < series.length; i++) {
      expect(series[i].cumulativeCents).toBeGreaterThanOrEqual(series[i - 1].cumulativeCents)
    }
  })

  it('collapses two contributions on the same day into one running-total point', () => {
    const series = cumulativeSeries([c('2026-03-01', 5000, 'a'), c('2026-03-01', 2500, 'b')], dated(null))
    const onDay = series.filter((p) => p.day === '2026-03-01')
    expect(onDay).toHaveLength(1)
    expect(onDay[0].cumulativeCents).toBe(7500)
  })

  it('prepends a zero point at the goal’s creation day so one contribution still draws a line', () => {
    const series = cumulativeSeries([c('2026-03-01', 5000)], dated(null))
    expect(series.length).toBeGreaterThanOrEqual(2)
    expect(series[0]).toMatchObject({ day: '2026-01-10', cumulativeCents: 0 })
  })

  it('carries no pace line for an undated goal', () => {
    const series = cumulativeSeries([c('2026-03-01', 5000)], dated(null))
    expect(series.every((p) => p.paceCents === null)).toBe(true)
  })

  it('carries a pace line for a dated goal, on the same basis as goalPacing', () => {
    const target = '2026-12-31'
    const series = cumulativeSeries([c('2026-06-15', 5000)], dated(target))
    expect(series.every((p) => p.paceCents !== null)).toBe(true)

    // The point dated "today" must agree with goalPacing's expectation for today,
    // so the chart and the "behind pace" copy can never contradict each other.
    const today = series.find((p) => p.day === '2026-06-15')!
    const pacing = goalPacing(100000, target, CREATED, 5000, NOW)
    expect(today.paceCents).toBe(pacing.expected_cents)
  })

  it('starts the pace line at zero and never exceeds the target', () => {
    const series = cumulativeSeries(
      [c('2026-02-01', 1000), c('2027-06-01', 1000)],
      dated('2026-12-31')
    )
    expect(series[0].paceCents).toBe(0)
    for (const p of series) expect(p.paceCents!).toBeLessThanOrEqual(100000)
  })

  it('PROPERTY: the last point equals the goal’s saved total', () => {
    for (const contributions of CASES) {
      const series = cumulativeSeries(contributions, dated('2026-12-31'))
      const saved = goalProgress(100000, contributions).saved_cents
      expect(series[series.length - 1].cumulativeCents).toBe(saved)
    }
  })

  it('PROPERTY: cumulative cents never decrease and days never go backwards', () => {
    for (const contributions of CASES) {
      const series = cumulativeSeries(contributions, dated('2026-12-31'))
      for (let i = 1; i < series.length; i++) {
        expect(series[i].cumulativeCents).toBeGreaterThanOrEqual(series[i - 1].cumulativeCents)
        expect(series[i].day > series[i - 1].day).toBe(true)
      }
    }
  })
})

describe('monthlySeries', () => {
  it('is empty for a goal with no contributions', () => {
    expect(monthlySeries([])).toEqual([])
  })

  it('totals each month and is ascending by month', () => {
    const series = monthlySeries([
      c('2026-03-05', 5000),
      c('2026-03-20', 2500),
      c('2026-01-15', 1000),
    ])
    expect(series.map((p) => p.monthKey)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(series.map((p) => p.cents)).toEqual([1000, 0, 7500])
  })

  it('fills gap months with zero rather than making them adjacent', () => {
    const series = monthlySeries([c('2026-01-15', 1000), c('2026-05-15', 1000)])
    expect(series).toHaveLength(5)
    expect(series.filter((p) => p.cents === 0).map((p) => p.monthKey)).toEqual([
      '2026-02',
      '2026-03',
      '2026-04',
    ])
  })

  it('spans a year boundary', () => {
    const series = monthlySeries([c('2025-11-15', 1000), c('2026-02-15', 2000)])
    expect(series.map((p) => p.monthKey)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })

  it('emits a single month when every contribution shares one', () => {
    expect(monthlySeries([c('2026-03-01', 100), c('2026-03-02', 200)])).toEqual([
      { monthKey: '2026-03', cents: 300 },
    ])
  })

  it('PROPERTY: the months sum to the goal’s saved total', () => {
    for (const contributions of CASES) {
      const total = monthlySeries(contributions).reduce((s, p) => s + p.cents, 0)
      expect(total).toBe(goalProgress(100000, contributions).saved_cents)
    }
  })

  it('PROPERTY: months are ascending and contiguous', () => {
    for (const contributions of CASES) {
      const keys = monthlySeries(contributions).map((p) => p.monthKey)
      for (let i = 1; i < keys.length; i++) {
        expect(keys[i] > keys[i - 1]).toBe(true)
        // Contiguous: each key is exactly one calendar month after the previous.
        const [py, pm] = keys[i - 1].split('-').map(Number)
        const expected = pm === 12 ? `${py + 1}-01` : `${py}-${String(pm + 1).padStart(2, '0')}`
        expect(keys[i]).toBe(expected)
      }
    }
  })
})
