import { describe, it, expect } from 'vitest'
import { cumulativeSeries, monthlySeries } from '@/lib/finance/goalSeries'
import { goalPacing, goalProgress } from '@/lib/finance/goals'
import type { GoalContribution } from '@/lib/types'

// ─────────────────────────────────────────────────────────────────────────────
// spec 045 — goalSeries under a NON-UTC timezone.
//
// This file runs under vitest.tz.config.ts (TZ=America/New_York), not the
// default TZ=UTC suite, because `goalSeries` does calendar-day and calendar-month
// math and the whole class of bug it could carry is invisible at UTC.
//
// Two specific hazards:
//
// 1. A date-only string like "2026-06-01" parses as UTC midnight, which in
//    America/New_York (UTC-4 in EDT) is 20:00 on MAY 31 local. Bucketing that
//    through local getters would file a June contribution under May — the exact
//    defect spec 027/A2 fixed in insights.ts. `monthlySeries` therefore keys off
//    the stored string, not a re-derived local date.
//
// 2. The pace line uses `dayIndex`, built from LOCAL getters, and must agree with
//    `goalPacing.expected_cents`, which uses the same rule. If either side
//    drifted to UTC the chart and the "behind pace" copy would disagree by a day
//    east or west of UTC.
// ─────────────────────────────────────────────────────────────────────────────

const CREATED = '2026-01-10T00:00:00.000Z'
const NOW = new Date(2026, 5, 15) // local June 15

const c = (date: string, cents: number, id = `${date}-${cents}`): GoalContribution => ({
  id,
  goal_id: 'g1',
  amount_cents: cents,
  date,
  note: null,
  created_by: 'u1',
  created_at: `${date}T00:00:00.000Z`,
})

describe('monthlySeries under America/New_York', () => {
  it('files a month-boundary contribution in its OWN month, not the previous one', () => {
    // June 1 must be June, not May — the A2 misbucketing class.
    const series = monthlySeries([c('2026-06-01', 5000)])
    expect(series).toEqual([{ monthKey: '2026-06', cents: 5000 }])
  })

  it('files a month-END contribution in its own month too', () => {
    // The mirror hazard: May 31 must not slide forward into June.
    const series = monthlySeries([c('2026-05-31', 5000)])
    expect(series).toEqual([{ monthKey: '2026-05', cents: 5000 }])
  })

  it('keeps the sum identity across a boundary pair', () => {
    const contributions = [c('2026-05-31', 5000), c('2026-06-01', 3000)]
    const series = monthlySeries(contributions)
    expect(series.map((p) => p.monthKey)).toEqual(['2026-05', '2026-06'])
    expect(series.reduce((s, p) => s + p.cents, 0)).toBe(
      goalProgress(100000, contributions).saved_cents
    )
  })

  it('files a year-boundary contribution in the correct year', () => {
    expect(monthlySeries([c('2026-01-01', 1000)])).toEqual([{ monthKey: '2026-01', cents: 1000 }])
  })
})

describe('cumulativeSeries under America/New_York', () => {
  it('plots a contribution on its own stored day', () => {
    const series = cumulativeSeries([c('2026-06-01', 5000)], {
      targetCents: 100000,
      targetDate: null,
      createdAt: CREATED,
      now: NOW,
    })
    expect(series[series.length - 1].day).toBe('2026-06-01')
  })

  it('anchors at the goal’s creation day on the USER’s calendar, like goalPacing does', () => {
    // `created_at` is an instant, not a calendar day: 2026-01-10T00:00Z is 19:00
    // on Jan 9 in New York. `goalPacing` reads it through LOCAL getters
    // (`dayIndex(new Date(startISO))`), so the pace span starts on Jan 9 here —
    // and the chart's anchor MUST use the same basis, or the dashed pace line
    // would start a day away from the span it is drawn against.
    const local = new Date(CREATED)
    const expected = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`

    const series = cumulativeSeries([c('2026-06-01', 5000)], {
      targetCents: 100000,
      targetDate: '2026-12-31',
      createdAt: CREATED,
      now: NOW,
    })
    expect(series[0]).toMatchObject({ day: expected, cumulativeCents: 0, paceCents: 0 })
    expect(expected).toBe('2026-01-09') // ...which is NOT the UTC day, by design
  })

  it('keeps the saved-total identity', () => {
    const contributions = [c('2026-05-31', 5000), c('2026-06-01', 3000)]
    const series = cumulativeSeries(contributions, {
      targetCents: 100000,
      targetDate: '2026-12-31',
      createdAt: CREATED,
      now: NOW,
    })
    expect(series[series.length - 1].cumulativeCents).toBe(
      goalProgress(100000, contributions).saved_cents
    )
  })

  it('agrees with goalPacing on the pace expectation for the same day', () => {
    const contributions = [c('2026-06-15', 5000)]
    const series = cumulativeSeries(contributions, {
      targetCents: 100000,
      targetDate: '2026-12-31',
      createdAt: CREATED,
      now: NOW,
    })
    const today = series.find((p) => p.day === '2026-06-15')!
    expect(today.paceCents).toBe(goalPacing(100000, '2026-12-31', CREATED, 5000, NOW).expected_cents)
  })
})
