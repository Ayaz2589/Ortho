// spec 030 — the now-anchored primary demo household (realism layer). Verifies it
// is deterministic given `now`, populates every screen the store loads, keeps the
// ledger invariant (shares reconcile), never emits future-dated current-month
// rows, and leaves the demo savings goal ON pace (not off-track).
import { describe, it, expect } from 'vitest'
import { buildDemoHousehold, DEMO } from './realism'
import { goalOffTrackInsight } from '@/lib/finance/goals'

const NOW = new Date(Date.UTC(2026, 6, 15, 12, 0, 0)) // 2026-07-15

describe('demo household — determinism & coverage', () => {
  it('is deterministic given the same `now`', () => {
    expect(JSON.stringify(buildDemoHousehold(NOW))).toBe(JSON.stringify(buildDemoHousehold(NOW)))
  })

  it('populates every screen the store loads', () => {
    const d = buildDemoHousehold(NOW)
    expect(d.users.length).toBe(2)
    expect(d.people.length).toBe(2)
    expect(d.members.some((m) => m.role === 'owner' && m.user_id === DEMO.ownerUserId)).toBe(true)
    expect(d.transactions.length).toBeGreaterThan(20)
    expect(d.budgets.map((b) => b.budget_type).sort()).toEqual(['fixed', 'fixed', 'flex', 'non_monthly'])
    expect(d.goals.length).toBe(2)
    expect(d.goalContributions.length).toBeGreaterThan(0)
    expect(d.tags.length).toBeGreaterThan(0)
    expect(d.linkedInstitutions.length).toBeGreaterThan(0)
    expect(d.linkedAccounts.length).toBeGreaterThan(0)
    expect(d.entitlements[0].status).toBe('active')
  })

  it('keeps the ledger invariant: every transaction’s shares reconcile', () => {
    const d = buildDemoHousehold(NOW)
    for (const gt of d.transactions) {
      const sum = gt.shares.reduce((n, s) => n + s.amount_cents, 0)
      expect(sum).toBe(gt.transaction.amount_cents)
    }
  })

  it('never emits a future-dated row (all dates ≤ now)', () => {
    const d = buildDemoHousehold(NOW)
    for (const gt of d.transactions) {
      expect(new Date(gt.transaction.date).getTime()).toBeLessThanOrEqual(NOW.getTime())
    }
  })

  it('carries tags + notes on at least one transaction', () => {
    const d = buildDemoHousehold(NOW)
    expect(d.transactions.some((t) => (t.transaction.tags?.length ?? 0) > 0)).toBe(true)
    expect(d.transactions.some((t) => !!t.transaction.notes)).toBe(true)
  })

  it('leaves the emergency savings goal ON pace (not off-track) at `now`', () => {
    const d = buildDemoHousehold(NOW)
    const goal = d.goals.find((g) => g.id === 'demo-goal-emergency')!
    const contribs = d.goalContributions.filter((c) => c.goal_id === goal.id)
    expect(goalOffTrackInsight(goal, contribs, NOW)).toBeNull()
  })
})
