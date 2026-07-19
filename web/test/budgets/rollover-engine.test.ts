// RED-first unit tests for the pure rollover recurrence (spec 027).
// The golden-vector lock lives in budget-rollover.parity.test.ts; these inline
// cases drive the initial implementation and cover each carry rule directly.
import { describe, it, expect } from 'vitest'
import {
  computeRolloverLedger,
  type RolloverConfig,
} from '../../lib/finance/budgets'

const cfg = (over: Partial<RolloverConfig>): RolloverConfig => ({
  type: 'fixed',
  baseLimitCents: 0,
  rolloverCapCents: null,
  ...over,
})

describe('computeRolloverLedger', () => {
  it('fixed: resets every month, no carry in or out', () => {
    const led = computeRolloverLedger(cfg({ type: 'fixed', baseLimitCents: 40000 }), [
      30000, 50000, 20000,
    ])
    expect(led.map((m) => m.carriedInCents)).toEqual([0, 0, 0])
    expect(led.map((m) => m.effectiveLimitCents)).toEqual([40000, 40000, 40000])
    expect(led.map((m) => m.remainingCents)).toEqual([10000, -10000, 20000])
    expect(led.map((m) => m.carriedOutCents)).toEqual([0, 0, 0])
  })

  it('flex: unused surplus accumulates forward', () => {
    const led = computeRolloverLedger(cfg({ type: 'flex', baseLimitCents: 60000 }), [
      50000, 40000, 55000,
    ])
    expect(led.map((m) => m.carriedInCents)).toEqual([0, 10000, 30000])
    expect(led.map((m) => m.effectiveLimitCents)).toEqual([60000, 70000, 90000])
    expect(led.map((m) => m.remainingCents)).toEqual([10000, 30000, 35000])
    expect(led.map((m) => m.carriedOutCents)).toEqual([10000, 30000, 35000])
  })

  it('flex: an overspend is forgiven — no debt carries to next month', () => {
    const led = computeRolloverLedger(cfg({ type: 'flex', baseLimitCents: 60000 }), [
      50000, 75000, 50000,
    ])
    expect(led.map((m) => m.carriedInCents)).toEqual([0, 10000, 0])
    expect(led.map((m) => m.remainingCents)).toEqual([10000, -5000, 10000])
    expect(led.map((m) => m.carriedOutCents)).toEqual([10000, 0, 10000])
  })

  it('flex: accumulated carry is capped', () => {
    const led = computeRolloverLedger(
      cfg({ type: 'flex', baseLimitCents: 60000, rolloverCapCents: 15000 }),
      [40000, 40000, 40000],
    )
    expect(led.map((m) => m.carriedInCents)).toEqual([0, 15000, 15000])
    expect(led.map((m) => m.effectiveLimitCents)).toEqual([60000, 75000, 75000])
    expect(led.map((m) => m.carriedOutCents)).toEqual([15000, 15000, 15000])
  })

  it('flex: opening carry seeds the first month', () => {
    const led = computeRolloverLedger(
      cfg({ type: 'flex', baseLimitCents: 60000, openingCarryCents: 20000 }),
      [10000],
    )
    expect(led[0].carriedInCents).toBe(20000)
    expect(led[0].effectiveLimitCents).toBe(80000)
    expect(led[0].remainingCents).toBe(70000)
    expect(led[0].carriedOutCents).toBe(70000)
  })

  it('non_monthly: sinking fund builds, then a big bill draws it negative', () => {
    const led = computeRolloverLedger(cfg({ type: 'non_monthly', baseLimitCents: 5000 }), [
      0, 0, 0, 0, 0, 60000,
    ])
    expect(led.map((m) => m.carriedInCents)).toEqual([0, 5000, 10000, 15000, 20000, 25000])
    expect(led.map((m) => m.remainingCents)).toEqual([
      5000, 10000, 15000, 20000, 25000, -30000,
    ])
    // signed carry — the shortfall carries out
    expect(led.map((m) => m.carriedOutCents)).toEqual([
      5000, 10000, 15000, 20000, 25000, -30000,
    ])
  })

  it('non_monthly: a negative fund recovers as the base accrues', () => {
    const led = computeRolloverLedger(
      cfg({ type: 'non_monthly', baseLimitCents: 5000, openingCarryCents: -30000 }),
      [0, 0],
    )
    expect(led.map((m) => m.carriedInCents)).toEqual([-30000, -25000])
    expect(led.map((m) => m.remainingCents)).toEqual([-25000, -20000])
  })

  it('zero base: flex stays flat; non_monthly can still go negative', () => {
    expect(computeRolloverLedger(cfg({ type: 'flex', baseLimitCents: 0 }), [0])[0]).toMatchObject({
      effectiveLimitCents: 0,
      remainingCents: 0,
      carriedOutCents: 0,
    })
    expect(
      computeRolloverLedger(cfg({ type: 'non_monthly', baseLimitCents: 0 }), [100])[0],
    ).toMatchObject({ remainingCents: -100, carriedOutCents: -100 })
  })

  it('boundary: empty spend series returns an empty ledger', () => {
    expect(computeRolloverLedger(cfg({ type: 'flex', baseLimitCents: 60000 }), [])).toEqual([])
  })

  it('invariants hold for every month', () => {
    const led = computeRolloverLedger(
      cfg({ type: 'flex', baseLimitCents: 60000, rolloverCapCents: 25000 }),
      [50000, 90000, 30000, 40000],
    )
    for (const m of led) {
      expect(m.effectiveLimitCents).toBe(m.baseLimitCents + m.carriedInCents)
      expect(m.remainingCents).toBe(m.effectiveLimitCents - m.spentCents)
      expect(Number.isInteger(m.carriedOutCents)).toBe(true)
      expect(m.carriedOutCents).toBeGreaterThanOrEqual(0) // flex
      expect(m.carriedOutCents).toBeLessThanOrEqual(25000) // capped
    }
  })
})
