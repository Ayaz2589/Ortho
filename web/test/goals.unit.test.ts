import { describe, it, expect } from 'vitest'
import {
  goalProgress,
  goalPacing,
  goalOffTrackInsight,
  goalInsights,
} from '@/lib/finance/goals'
import { compareInsights } from '@/lib/finance/insights'
import type { Goal, GoalContribution, Insight } from '@/lib/types'

// Hand-derived correctness oracle (the spec-025 discipline): every expected value
// below is computed by hand in the comments, so the vectors generated from the
// implementation are checked against numbers that did NOT come from it.

const contribs = (...cents: number[]): GoalContribution[] =>
  cents.map((amount_cents, i) => ({
    id: `c${i}`,
    goal_id: 'g',
    amount_cents,
    date: '2026-06-15',
    note: null,
    created_by: 'u',
    created_at: '2026-06-15T12:00:00Z',
  }))

describe('goalProgress', () => {
  it('empty: 0 of target', () => {
    expect(goalProgress(200000, [])).toEqual({
      saved_cents: 0,
      target_cents: 200000,
      remaining_cents: 200000,
      fraction: 0,
      reached: false,
    })
  })

  it('single contribution: 25%', () => {
    // 50000 / 200000 = 0.25
    expect(goalProgress(200000, contribs(50000))).toEqual({
      saved_cents: 50000,
      target_cents: 200000,
      remaining_cents: 150000,
      fraction: 0.25,
      reached: false,
    })
  })

  it('multiple under target: $750 of $2000 = 37.5%', () => {
    // 75000 / 200000 = 0.375
    expect(goalProgress(200000, contribs(50000, 25000))).toEqual({
      saved_cents: 75000,
      target_cents: 200000,
      remaining_cents: 125000,
      fraction: 0.375,
      reached: false,
    })
  })

  it('exactly reached', () => {
    expect(goalProgress(300000, contribs(300000))).toEqual({
      saved_cents: 300000,
      target_cents: 300000,
      remaining_cents: 0,
      fraction: 1,
      reached: true,
    })
  })

  it('over-funded: remaining floored at 0, fraction capped at 1', () => {
    // 400000 saved vs 300000 target
    expect(goalProgress(300000, contribs(200000, 200000))).toEqual({
      saved_cents: 400000,
      target_cents: 300000,
      remaining_cents: 0,
      fraction: 1,
      reached: true,
    })
  })

  it('debt-payoff accrues identically to savings', () => {
    // Same math regardless of kind — $3000 paid off reaches a $3000 payoff goal.
    expect(goalProgress(300000, contribs(300000)).reached).toBe(true)
  })

  it('non-positive target guard: fraction 0, never reached', () => {
    const p = goalProgress(0, contribs(100))
    expect(p.fraction).toBe(0)
    expect(p.reached).toBe(false)
    expect(p.remaining_cents).toBe(0)
    expect(p.saved_cents).toBe(100)
  })
})

describe('goalPacing', () => {
  const start = '2026-01-01T00:00:00Z'

  it('behind beyond tolerance → off-track with suggested monthly', () => {
    // target 1_200_000, span 2026-01-01→2027-01-01 = 365 days (2026 not leap).
    // now 2026-07-01 → elapsed = 181 days. expected = round(1200000*181/365)
    //   = round(595068.493) = 595068. saved 100000 → shortfall 495068.
    // tolerance floor = round(1200000*0.05) = 60000; 495068 >= 60000 ⇒ off-track.
    // daysLeft = 365-181 = 184; monthsLeft = ceil(184/30)=7; remaining 1100000;
    // suggested = ceil(1100000/7) = ceil(157142.857) = 157143.
    expect(goalPacing(1200000, '2027-01-01', start, 100000, new Date('2026-07-01T12:00:00Z'))).toEqual({
      off_track: true,
      past_due: false,
      expected_cents: 595068,
      shortfall_cents: 495068,
      suggested_monthly_cents: 157143,
    })
  })

  it('on pace (saved ≥ expected) → not off-track', () => {
    // saved 600000 ≥ expected 595068 ⇒ shortfall 0 ⇒ not off-track.
    // suggested: remaining 600000, monthsLeft 7 ⇒ ceil(600000/7)=85715.
    expect(goalPacing(1200000, '2027-01-01', start, 600000, new Date('2026-07-01T12:00:00Z'))).toEqual({
      off_track: false,
      past_due: false,
      expected_cents: 595068,
      shortfall_cents: 0,
      suggested_monthly_cents: 85715,
    })
  })

  it('marginally behind within tolerance → not off-track', () => {
    // target 1_000_000; expected = round(1000000*181/365)=round(495890.41)=495890.
    // saved 460000 → shortfall 35890 < tolerance floor 50000 ⇒ not off-track.
    // suggested: remaining 540000, monthsLeft 7 ⇒ ceil(540000/7)=77143.
    expect(goalPacing(1000000, '2027-01-01', start, 460000, new Date('2026-07-01T12:00:00Z'))).toEqual({
      off_track: false,
      past_due: false,
      expected_cents: 495890,
      shortfall_cents: 35890,
      suggested_monthly_cents: 77143,
    })
  })

  it('reached regardless of date → not off-track', () => {
    expect(goalPacing(300000, '2027-01-01', start, 300000, new Date('2026-07-01T12:00:00Z'))).toEqual({
      off_track: false,
      past_due: false,
      expected_cents: expect.any(Number),
      shortfall_cents: 0,
      suggested_monthly_cents: 0,
    })
  })

  it('no target date → all zero, on-track', () => {
    expect(goalPacing(200000, null, start, 0, new Date('2026-07-01T12:00:00Z'))).toEqual({
      off_track: false,
      past_due: false,
      expected_cents: 0,
      shortfall_cents: 0,
      suggested_monthly_cents: 0,
    })
  })

  it('past due and not reached → off-track (fully behind), suggested = remaining', () => {
    // start 2026-01-01, target 2026-06-01, now 2026-07-01 ⇒ past due.
    // expected clamps to target 200000; saved 150000 ⇒ shortfall 50000.
    // daysLeft < 0 ⇒ monthsLeft 0 ⇒ suggested = remaining 50000.
    expect(goalPacing(200000, '2026-06-01', start, 150000, new Date('2026-07-01T12:00:00Z'))).toEqual({
      off_track: true,
      past_due: true,
      expected_cents: 200000,
      shortfall_cents: 50000,
      suggested_monthly_cents: 50000,
    })
  })

  it('zero/negative span (due now), not reached → off-track', () => {
    // start == target == now ⇒ span 0 ⇒ expected = target; past_due true.
    expect(goalPacing(200000, '2026-06-01', '2026-06-01T00:00:00Z', 50000, new Date('2026-06-01T12:00:00Z'))).toEqual({
      off_track: true,
      past_due: true,
      expected_cents: 200000,
      shortfall_cents: 150000,
      suggested_monthly_cents: 150000,
    })
  })
})

describe('goalOffTrackInsight', () => {
  const base: Goal = {
    id: 'g1',
    household_id: 'h',
    name: 'Emergency fund',
    kind: 'savings',
    target_cents: 1200000,
    target_date: '2027-01-01',
    linked_account_id: null,
    linked_category: 'groceries',
    created_by: 'u',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
  const now = new Date('2026-07-01T12:00:00Z')

  it('produces one calm insight when behind', () => {
    const ins = goalOffTrackInsight(base, contribs(100000), now)
    expect(ins).not.toBeNull()
    expect(ins!.id).toBe('goal-offtrack-g1')
    expect(ins!.severity).toBe('warning') // never 'critical' — behind is never red
    expect(ins!.severity).not.toBe('critical')
    expect(ins!.magnitude_cents).toBe(495068) // the shortfall
    expect(ins!.category).toBe('groceries')
    expect(ins!.icon).toBe('target')
  })

  it('null when on pace', () => {
    expect(goalOffTrackInsight(base, contribs(600000), now)).toBeNull()
  })

  it('null when reached', () => {
    expect(goalOffTrackInsight(base, contribs(1200000), now)).toBeNull()
  })

  it('null when undated', () => {
    expect(goalOffTrackInsight({ ...base, target_date: null }, contribs(0), now)).toBeNull()
  })
})

describe('goalInsights + compareInsights', () => {
  const now = new Date('2026-07-01T12:00:00Z')
  const mk = (id: string, target: number, cat: Goal['linked_category']): Goal => ({
    id,
    household_id: 'h',
    name: id,
    kind: 'savings',
    target_cents: target,
    target_date: '2027-01-01',
    linked_account_id: null,
    linked_category: cat,
    created_by: 'u',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  })

  it('flags off-track goals and sorts by magnitude desc', () => {
    const goals = [mk('small', 400000, null), mk('big', 1200000, null)]
    const byId: Record<string, GoalContribution[]> = { small: contribs(0), big: contribs(0) }
    const out = goalInsights(goals, byId, now)
    expect(out.map((i) => i.id)).toEqual(['goal-offtrack-big', 'goal-offtrack-small'])
  })

  it('compareInsights: critical before warning; magnitude tie-break desc', () => {
    const a = { severity: 'warning', magnitude_cents: 100 } as Insight
    const b = { severity: 'warning', magnitude_cents: 200 } as Insight
    const c = { severity: 'critical', magnitude_cents: 1 } as Insight
    expect([a, b, c].slice().sort(compareInsights).map((x) => x.magnitude_cents)).toEqual([1, 200, 100])
  })
})
