import { describe, it, expect } from 'vitest'
import {
  goalCadence,
  goalPaceMonths,
  goalProjection,
  whatIfScenarios,
  savingsDebtsSummary,
} from '@/lib/finance/goalProjection'
import { goalProgress } from '@/lib/finance/goals'
import type { Goal, GoalContribution } from '@/lib/types'

// The spec-059 projection engine. Every derivation the Savings & Debts surfaces
// print comes from here, so this suite is the contract
// (specs/059-savings-debts-redesign/contracts/projection-engine.md).

let seq = 0
function contribution(date: string, amountCents: number): GoalContribution {
  seq += 1
  return {
    id: `c${seq}`,
    goal_id: 'g1',
    amount_cents: amountCents,
    date,
    note: null,
    created_by: 'u1',
    created_at: `${date}T12:00:00.000Z`,
  }
}

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    household_id: 'h1',
    name: 'Tasnuva Owes Ayaz',
    kind: 'debt_payoff',
    target_cents: 1_750_000,
    target_date: null,
    linked_account_id: null,
    linked_category: null,
    created_by: 'u1',
    created_at: '2026-02-01T00:00:00.000Z',
    updated_at: '2026-02-01T00:00:00.000Z',
    ...overrides,
  }
}

/** The handoff's worked example: $600 on the 1st, Feb–Aug 2026. */
function steadySeven(): GoalContribution[] {
  return ['2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01'].map(
    (d) => contribution(d, 60_000)
  )
}

/** Mid-August 2026, after the month's payment has landed. */
const NOW = new Date(2026, 7, 15)

describe('goalCadence', () => {
  it('returns null with no contributions', () => {
    expect(goalCadence([])).toBeNull()
  })

  it('picks the modal amount and day, and the first month', () => {
    const cadence = goalCadence(steadySeven())
    expect(cadence).toEqual({
      amountCents: 60_000,
      dayOfMonth: 1,
      firstMonthKey: '2026-02',
      contributionCount: 7,
    })
  })

  it('picks the most frequent amount, not the mean', () => {
    // A single catch-up payment must not drag the cadence off the amount that is
    // actually paid every month — that figure gets printed on the card.
    const cadence = goalCadence([
      contribution('2026-02-01', 60_000),
      contribution('2026-03-01', 60_000),
      contribution('2026-04-01', 60_000),
      contribution('2026-05-01', 500_000),
    ])
    expect(cadence?.amountCents).toBe(60_000)
  })

  it('breaks an amount tie toward the LARGER amount', () => {
    // Conservative direction: a larger cadence never makes a debt look like it
    // clears sooner than it will.
    const cadence = goalCadence([
      contribution('2026-02-01', 60_000),
      contribution('2026-03-01', 65_000),
      contribution('2026-04-01', 60_000),
      contribution('2026-05-01', 65_000),
    ])
    expect(cadence?.amountCents).toBe(65_000)
  })

  it('breaks a day tie toward the EARLIER day', () => {
    const cadence = goalCadence([
      contribution('2026-02-01', 60_000),
      contribution('2026-03-15', 60_000),
      contribution('2026-04-01', 60_000),
      contribution('2026-05-15', 60_000),
    ])
    expect(cadence?.dayOfMonth).toBe(1)
  })

  it('reads the first month from the earliest contribution, not input order', () => {
    const cadence = goalCadence([
      contribution('2026-08-01', 60_000),
      contribution('2026-02-01', 60_000),
      contribution('2026-05-01', 60_000),
    ])
    expect(cadence?.firstMonthKey).toBe('2026-02')
  })
})

describe('goalPaceMonths', () => {
  it('is empty without a cadence', () => {
    expect(goalPaceMonths([], null, NOW)).toEqual([])
  })

  it('marks every steady month on plan', () => {
    const contributions = steadySeven()
    const months = goalPaceMonths(contributions, goalCadence(contributions), NOW)
    expect(months).toHaveLength(7)
    expect(months.map((m) => m.monthKey)).toEqual([
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
    ])
    expect(months.every((m) => m.status === 'on_plan')).toBe(true)
  })

  it('fills a gap month as missed at zero, rather than closing the gap', () => {
    const contributions = [
      contribution('2026-02-01', 60_000),
      contribution('2026-03-01', 60_000),
      // April skipped
      contribution('2026-05-01', 60_000),
    ]
    const months = goalPaceMonths(contributions, goalCadence(contributions), new Date(2026, 4, 15))
    expect(months.map((m) => m.monthKey)).toEqual(['2026-02', '2026-03', '2026-04', '2026-05'])
    expect(months[2]).toMatchObject({ monthKey: '2026-04', cents: 0, status: 'missed' })
  })

  it('distinguishes under, over and on-plan against the tolerance', () => {
    const contributions = [
      contribution('2026-02-01', 60_000), // exact
      contribution('2026-03-01', 30_000), // half — under
      contribution('2026-04-01', 90_000), // above — over
      contribution('2026-05-01', 60_000),
      contribution('2026-06-01', 60_000),
    ]
    const months = goalPaceMonths(contributions, goalCadence(contributions), new Date(2026, 5, 15))
    expect(months.map((m) => m.status)).toEqual(['on_plan', 'under', 'over', 'on_plan', 'on_plan'])
  })

  it('treats a month exactly at the ±2% boundary as on plan', () => {
    // 2% of $600 is $12. $588 and $612 are both still on plan.
    const contributions = [
      contribution('2026-02-01', 60_000),
      contribution('2026-03-01', 60_000),
      contribution('2026-04-01', 58_800),
      contribution('2026-05-01', 61_200),
    ]
    const months = goalPaceMonths(contributions, goalCadence(contributions), new Date(2026, 4, 15))
    expect(months.map((m) => m.status)).toEqual(['on_plan', 'on_plan', 'on_plan', 'on_plan'])
  })

  it('does not call the current month missed before its cadence day arrives', () => {
    // Reference date is the 3rd; the cadence day is the 15th. Calling that a
    // missed month would be alarming AND wrong — the payment isn't due yet.
    const contributions = [
      contribution('2026-02-15', 60_000),
      contribution('2026-03-15', 60_000),
      contribution('2026-04-15', 60_000),
    ]
    const months = goalPaceMonths(contributions, goalCadence(contributions), new Date(2026, 4, 3))
    expect(months.map((m) => m.monthKey)).toEqual(['2026-02', '2026-03', '2026-04'])
  })

  it('does count the current month once its cadence day has passed', () => {
    const contributions = [
      contribution('2026-02-15', 60_000),
      contribution('2026-03-15', 60_000),
      contribution('2026-04-15', 60_000),
    ]
    const months = goalPaceMonths(contributions, goalCadence(contributions), new Date(2026, 4, 20))
    expect(months.map((m) => m.monthKey)).toEqual(['2026-02', '2026-03', '2026-04', '2026-05'])
    expect(months[3].status).toBe('missed')
  })
})

describe('goalProjection — guard rails', () => {
  it.each([0, 1, 2])('refuses to project with %i contributions', (n) => {
    const contributions = steadySeven().slice(0, n)
    const projection = goalProjection(goal(), contributions, NOW)
    expect(projection.available).toBe(false)
    expect(projection.unavailableReason).toBe('insufficient_history')
    // Nothing date-shaped may leak out — this is the single enforcement point
    // for "no projected date anywhere" (SC-008).
    expect(projection.finishDate).toBeNull()
    expect(projection.paymentsToGo).toBeNull()
    expect(projection.pacePerMonthCents).toBeNull()
    expect(projection.basis).toBeNull()
  })

  it('refuses when the target is already reached', () => {
    const projection = goalProjection(goal({ target_cents: 100_000 }), steadySeven(), NOW)
    expect(projection.available).toBe(false)
    expect(projection.unavailableReason).toBe('reached')
    expect(projection.finishDate).toBeNull()
  })

  it('refuses when the derived pace is zero', () => {
    const contributions = [
      contribution('2026-02-01', 0),
      contribution('2026-03-01', 0),
      contribution('2026-04-01', 0),
    ]
    const projection = goalProjection(goal(), contributions, NOW)
    expect(projection.available).toBe(false)
    expect(projection.unavailableReason).toBe('no_pace')
    expect(projection.finishDate).toBeNull()
  })

  it('still reports pace history even when it refuses to project', () => {
    // The refusal is about the FUTURE. What already happened is still true, so
    // the ledger and consistency copy have something honest to say.
    const contributions = steadySeven().slice(0, 2)
    const projection = goalProjection(goal(), contributions, NOW)
    expect(projection.available).toBe(false)
    expect(projection.monthCount).toBeGreaterThan(0)
  })
})

describe('goalProjection — the handoff worked example', () => {
  it('projects $13,300 remaining at $600/mo as 23 payments finishing July 2028', () => {
    const projection = goalProjection(goal(), steadySeven(), NOW)
    expect(projection.available).toBe(true)
    expect(projection.basis).toBe('cadence')
    expect(projection.pacePerMonthCents).toBe(60_000)
    expect(projection.paymentsToGo).toBe(23)
    expect(projection.finishDate?.getFullYear()).toBe(2028)
    expect(projection.finishDate?.getMonth()).toBe(6) // July
    expect(projection.onPlanCount).toBe(7)
    expect(projection.monthCount).toBe(7)
    expect(projection.streakMonths).toBe(7)
    expect(projection.missedMonthKeys).toEqual([])
  })

  it('rounds a partial final payment up to a whole one', () => {
    // $13,300 / $600 = 22.17 payments. Stated as 23; the remainder is not
    // called out (handoff, flagged to the client).
    const projection = goalProjection(goal(), steadySeven(), NOW)
    const progress = goalProgress(1_750_000, steadySeven())
    expect(progress.remaining_cents / 60_000).toBeCloseTo(22.17, 2)
    expect(projection.paymentsToGo).toBe(23)
  })

  it('switches the basis to the recent average once a month goes off plan', () => {
    const contributions = [
      contribution('2026-02-01', 60_000),
      contribution('2026-03-01', 60_000),
      contribution('2026-04-01', 30_000), // short
      contribution('2026-05-01', 60_000),
      contribution('2026-06-01', 60_000),
    ]
    const projection = goalProjection(goal(), contributions, new Date(2026, 5, 15))
    expect(projection.available).toBe(true)
    expect(projection.basis).toBe('recent_average')
    // mean of the last three: 30_000, 60_000, 60_000 → 50_000
    expect(projection.pacePerMonthCents).toBe(50_000)
  })

  it('counts an over-plan month as on plan', () => {
    // Paying MORE than planned is not a deviation to be explained.
    const contributions = [
      contribution('2026-02-01', 60_000),
      contribution('2026-03-01', 60_000),
      contribution('2026-04-01', 96_000),
    ]
    const projection = goalProjection(goal(), contributions, new Date(2026, 3, 15))
    expect(projection.onPlanCount).toBe(3)
    expect(projection.monthCount).toBe(3)
  })

  it('reports the streak and missed months of an uneven history', () => {
    const contributions = [
      contribution('2026-01-01', 142_800),
      contribution('2026-02-01', 142_800),
      contribution('2026-03-01', 70_000), // under
      contribution('2026-04-01', 142_800),
      // May missed
      contribution('2026-06-01', 180_000), // over
      contribution('2026-07-01', 90_000), // under
      contribution('2026-08-01', 142_800),
    ]
    const projection = goalProjection(goal({ target_cents: 2_300_000 }), contributions, NOW)
    expect(projection.missedMonthKeys).toEqual(['2026-05'])
    expect(projection.streakMonths).toBe(3) // Jun, Jul, Aug — under still counts
    expect(projection.onPlanCount).toBe(5)
    expect(projection.monthCount).toBe(8)
  })
})

describe('goalProjection — cadence is a MONTHLY rate, not a per-payment amount', () => {
  it('reads a semi-monthly payer at their true monthly rate', () => {
    // $300 on the 1st and the 15th is $600/mo. Taking the modal PAYMENT would
    // read it as $300/mo and put the finish date nearly two years too far out —
    // and, because every month then reads as "over" (which counts as on plan),
    // it would ship that wrong date under basis 'cadence', the engine's
    // highest-confidence label, instead of falling back to the recent average.
    const semi = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'].flatMap((m) => [
      contribution(`${m}-01`, 30_000),
      contribution(`${m}-15`, 30_000),
    ])
    const projection = goalProjection(goal(), semi, new Date(2026, 7, 20))

    expect(projection.cadence?.amountCents).toBe(60_000)
    expect(projection.months.every((m) => m.status === 'on_plan')).toBe(true)
    expect(projection.paymentsToGo).toBe(23)
    expect(projection.finishDate?.getFullYear()).toBe(2028)
    expect(projection.finishDate?.getMonth()).toBe(6) // July
  })

  it('still counts every contribution for the disclosure', () => {
    const semi = ['2026-02', '2026-03', '2026-04'].flatMap((m) => [
      contribution(`${m}-01`, 30_000),
      contribution(`${m}-15`, 30_000),
    ])
    expect(goalCadence(semi)?.contributionCount).toBe(6)
    expect(goalCadence(semi)?.dayOfMonth).toBe(1)
  })

  it('is unchanged for a once-a-month payer', () => {
    expect(goalCadence(steadySeven())?.amountCents).toBe(60_000)
  })
})

describe('whatIfScenarios', () => {
  it('is empty when there is no projection to vary', () => {
    const projection = goalProjection(goal(), steadySeven().slice(0, 1), NOW)
    expect(whatIfScenarios(projection, 1_330_000, NOW)).toEqual([])
  })

  it('offers keep / +25% / +67% / skip when on plan, with clean amounts', () => {
    const projection = goalProjection(goal(), steadySeven(), NOW)
    const rows = whatIfScenarios(projection, 1_330_000, NOW)
    expect(rows.map((r) => r.kind)).toEqual(['current', 'increase', 'increase', 'skip'])
    expect(rows[0].monthlyCents).toBe(60_000)
    expect(rows[0].deltaMonths).toBe(0)
    expect(rows[1].monthlyCents).toBe(75_000) // $750
    expect(rows[2].monthlyCents).toBe(100_000) // $1,000, cleaned from $1,002
  })

  it('marks paying more as sooner, and skipping as exactly one month later', () => {
    const projection = goalProjection(goal(), steadySeven(), NOW)
    const rows = whatIfScenarios(projection, 1_330_000, NOW)
    expect(rows[1].deltaMonths).toBeLessThan(0)
    expect(rows[2].deltaMonths).toBeLessThan(rows[1].deltaMonths)
    expect(rows[3].deltaMonths).toBe(1)
  })

  it('presents the PLANNED amount as an improvement when the goal is off plan', () => {
    // The inversion that matters: once a member has drifted, the plan they set
    // is the good news, not the baseline they are failing.
    const contributions = [
      contribution('2026-02-01', 142_800),
      contribution('2026-03-01', 142_800),
      contribution('2026-04-01', 70_000),
      contribution('2026-05-01', 142_800),
      contribution('2026-06-01', 90_000),
      contribution('2026-07-01', 90_000),
    ]
    const g = goal({ target_cents: 2_300_000 })
    const projection = goalProjection(g, contributions, new Date(2026, 6, 15))
    expect(projection.basis).toBe('recent_average')

    const remaining = goalProgress(g.target_cents, contributions).remaining_cents
    const rows = whatIfScenarios(projection, remaining, new Date(2026, 6, 15))
    expect(rows.map((r) => r.kind)).toEqual(['current', 'planned', 'increase'])
    expect(rows[1].monthlyCents).toBe(142_800)
    expect(rows[1].deltaMonths).toBeLessThan(0)
  })

  it('never proposes two identical increase rows', () => {
    // Rounding to a clean $50 figure collapses +25% and +67% of a small pace
    // onto the same number ($100 → $150 and $150), which would render the same
    // row twice with different-looking labels.
    const contributions = [
      contribution('2026-02-01', 10_000),
      contribution('2026-03-01', 10_000),
      contribution('2026-04-01', 10_000),
    ]
    const projection = goalProjection(goal({ target_cents: 500_000 }), contributions, new Date(2026, 3, 15))
    const rows = whatIfScenarios(projection, 470_000, new Date(2026, 3, 15))
    const increases = rows.filter((r) => r.kind === 'increase').map((r) => r.monthlyCents)
    expect(new Set(increases).size).toBe(increases.length)
    expect([...increases]).toEqual([...increases].sort((a, b) => a - b))
  })

  it('never proposes an increase at or below the current pace', () => {
    // Guards the rounding: a tiny cadence must not round its "pay more" row down.
    const contributions = [
      contribution('2026-02-01', 1_000),
      contribution('2026-03-01', 1_000),
      contribution('2026-04-01', 1_000),
    ]
    const projection = goalProjection(goal({ target_cents: 500_000 }), contributions, new Date(2026, 3, 15))
    const rows = whatIfScenarios(projection, 497_000, new Date(2026, 3, 15))
    for (const row of rows.filter((r) => r.kind === 'increase')) {
      expect(row.monthlyCents).toBeGreaterThan(projection.pacePerMonthCents!)
    }
  })
})

describe('savingsDebtsSummary', () => {
  const debtA = goal({ id: 'a', name: 'Tasnuva Pay Off Credit Card', target_cents: 2_300_000 })
  const debtB = goal({ id: 'b', name: 'Tasnuva Owes Ayaz', target_cents: 1_750_000 })
  const savings = goal({ id: 'c', name: 'ROG XReal Glasses', kind: 'savings', target_cents: 100_000 })

  function byGoal() {
    return {
      a: ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01'].map(
        (d) => ({ ...contribution(d, 142_800), goal_id: 'a' })
      ),
      b: steadySeven().map((c) => ({ ...c, goal_id: 'b' })),
      c: ['2026-06-01', '2026-07-01', '2026-08-01'].map((d) => ({ ...contribution(d, 10_000), goal_id: 'c' })),
    }
  }

  it('sums the monthly commitment, the contributed total and the combined target', () => {
    const summary = savingsDebtsSummary([debtA, debtB, savings], byGoal(), NOW)
    expect(summary.monthlyCommitmentCents).toBe(142_800 + 60_000 + 10_000) // $2,128
    expect(summary.contributedCents).toBe(1_142_400 + 420_000 + 30_000) // $15,924
    expect(summary.targetCents).toBe(4_150_000) // $41,500
    expect(summary.activeCount).toBe(3)
  })

  it('names the soonest and the latest finisher', () => {
    const summary = savingsDebtsSummary([debtA, debtB, savings], byGoal(), NOW)
    expect(summary.nextToFinish?.name).toBe('ROG XReal Glasses')
    expect(summary.lastToFinish?.name).toBe('Tasnuva Owes Ayaz')
  })

  it('reports one item as both next and last, so the caller can drop the "last" clause', () => {
    const contributions = byGoal()
    const summary = savingsDebtsSummary([debtB], { b: contributions.b }, NOW)
    expect(summary.nextToFinish?.name).toBe('Tasnuva Owes Ayaz')
    expect(summary.lastToFinish?.name).toBe('Tasnuva Owes Ayaz')
  })

  it('reports no finishers at all when nothing has enough history', () => {
    const summary = savingsDebtsSummary([debtB], { b: [contribution('2026-02-01', 60_000)] }, NOW)
    expect(summary.nextToFinish).toBeNull()
    expect(summary.lastToFinish).toBeNull()
  })

  it('excludes a reached item from the monthly commitment, as it does from the count', () => {
    // "You're putting $600 a month toward 1 item" is incoherent when $400 of it
    // is a loan that is already paid off.
    const paidOff = goal({ id: 'p', name: 'Car loan', target_cents: 80_000 })
    const summary = savingsDebtsSummary(
      [paidOff],
      { p: [contribution('2026-01-01', 40_000), contribution('2026-02-01', 40_000)].map((c) => ({ ...c, goal_id: 'p' })) },
      NOW
    )
    expect(summary.activeCount).toBe(0)
    expect(summary.monthlyCommitmentCents).toBe(0)
  })

  it('counts a reached item in the totals but not as active', () => {
    const reached = goal({ id: 'd', name: 'Done', kind: 'savings', target_cents: 20_000 })
    const summary = savingsDebtsSummary(
      [debtB, reached],
      {
        b: byGoal().b,
        d: [
          { ...contribution('2026-02-01', 10_000), goal_id: 'd' },
          { ...contribution('2026-03-01', 10_000), goal_id: 'd' },
        ],
      },
      NOW
    )
    expect(summary.activeCount).toBe(1)
    expect(summary.targetCents).toBe(1_750_000 + 20_000)
  })

  it('is empty and harmless with no items at all', () => {
    const summary = savingsDebtsSummary([], {}, NOW)
    expect(summary).toEqual({
      monthlyCommitmentCents: 0,
      contributedCents: 0,
      targetCents: 0,
      activeCount: 0,
      nextToFinish: null,
      lastToFinish: null,
    })
  })
})

describe('purity and cross-engine agreement', () => {
  it('does not mutate its inputs', () => {
    const contributions = steadySeven()
    const snapshot = JSON.parse(JSON.stringify(contributions))
    goalProjection(goal(), contributions, NOW)
    expect(contributions).toEqual(snapshot)
  })

  it('returns deeply equal results for the same inputs', () => {
    const contributions = steadySeven()
    const a = goalProjection(goal(), contributions, NOW)
    const b = goalProjection(goal(), contributions, NOW)
    expect(a).toEqual(b)
  })

  it('never claims completion while the vectored engine still shows money owed', () => {
    // Property (contract C6): the two engines use different models but must not
    // contradict each other on whether money is still owed.
    const amounts = [1, 7, 99, 500, 3_333, 60_000, 142_800, 1_000_000]
    const targets = [1_000, 50_000, 1_750_000, 2_300_000, 9_999_999]
    for (const amount of amounts) {
      for (const target of targets) {
        const contributions = ['2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01'].map((d) =>
          contribution(d, amount)
        )
        const g = goal({ target_cents: target })
        const projection = goalProjection(g, contributions, new Date(2026, 4, 15))
        if (!projection.available) continue
        const remaining = goalProgress(target, contributions).remaining_cents
        expect(projection.paymentsToGo! * projection.pacePerMonthCents!).toBeGreaterThanOrEqual(remaining)
      }
    }
  })
})
