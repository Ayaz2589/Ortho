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
    expect(d.transactions.length).toBeGreaterThan(150)
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

describe('demo household — realistic volume & messiness', () => {
  const merchantsOf = (d: ReturnType<typeof buildDemoHousehold>) =>
    new Set(d.transactions.map((t) => t.transaction.merchant))

  it('generates a realistic monthly volume, not the old ~11/mo basket', () => {
    const d = buildDemoHousehold(NOW)
    // A full past month (May 2026 = monthOf(NOW, -2)) should read like a real
    // two-person household (~60-100/mo per research §5), floored conservatively.
    const inMay = d.transactions.filter((t) => t.transaction.date.startsWith('2026-05'))
    expect(inMay.length).toBeGreaterThanOrEqual(40)
  })

  it('has two earners, one with variable income (research U2)', () => {
    const d = buildDemoHousehold(NOW)
    const incomes = d.transactions.filter((t) => t.transaction.kind === 'income')
    const owners = new Set(incomes.flatMap((t) => t.transaction.owner_ids))
    expect(owners.has(DEMO.ownerPersonId)).toBe(true)
    expect(owners.has(DEMO.partnerPersonId)).toBe(true)
    // The partner's freelance income varies month to month.
    const partnerAmts = new Set(
      incomes
        .filter((t) => t.transaction.owner_ids.length === 1 && t.transaction.owner_ids[0] === DEMO.partnerPersonId)
        .map((t) => t.transaction.amount_cents)
    )
    expect(partnerAmts.size).toBeGreaterThan(1)
  })

  it('models subscription creep — many small recurring subs (research U5)', () => {
    const d = buildDemoHousehold(NOW)
    const subs = d.transactions.filter((t) => t.transaction.category === 'subs')
    expect(subs.length).toBeGreaterThanOrEqual(50)
    expect(new Set(subs.map((t) => t.transaction.merchant)).size).toBeGreaterThanOrEqual(10)
  })

  it('carries a recurring remittance line and shock + fragility rows', () => {
    const merchants = merchantsOf(buildDemoHousehold(NOW))
    expect(merchants.has('Remitly — Family')).toBe(true) // nyc §9 remittance
    expect(merchants.has('Mavis Discount Tire')).toBe(true) // car-repair shock (U11)
    expect(merchants.has('Mount Sinai — Billing')).toBe(true) // medical shock (U11)
    expect(merchants.has('Overdraft Fee')).toBe(true) // fragility chain (U6/U8)
  })

  it('leaves an ambiguous/miscategorized tail (research U4)', () => {
    const merchants = merchantsOf(buildDemoHousehold(NOW))
    expect(['Venmo', 'PayPal', 'Square', 'Cash App'].some((m) => merchants.has(m))).toBe(true)
  })

  it('has multiple transfers (remittances + periodic settle-ups)', () => {
    const d = buildDemoHousehold(NOW)
    const transfers = d.transactions.filter((t) => t.transaction.kind === 'transfer')
    expect(transfers.length).toBeGreaterThan(6)
  })
})
