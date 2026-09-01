import { describe, it, expect } from 'vitest'
import { goalCadence, goalPaceMonths, goalProjection, savingsDebtsSummary } from '@/lib/finance/goalProjection'
import type { Goal, GoalContribution } from '@/lib/types'

// ─────────────────────────────────────────────────────────────────────────────
// spec 059 — goalProjection under a NON-UTC timezone.
//
// Runs under vitest.tz.config.ts (TZ=America/New_York), not the default UTC
// suite, because every figure this engine prints is a calendar month and the
// whole class of bug is invisible at UTC.
//
// Three specific hazards:
//
// 1. A date-only string like "2026-06-01" parses as UTC midnight, which in
//    America/New_York is 20:00 on MAY 31 local. Deriving the cadence day or the
//    month key through `new Date(...)` + local getters would file a June
//    contribution under May and report a cadence day of 31. The engine therefore
//    reads both straight off the stored string.
//
// 2. `nextCadenceDate` / `addMonths` build local Dates from local getters. If
//    either slipped to UTC methods, a finish date near a month boundary would
//    land in the wrong month west of UTC — the card would print "Clear by June"
//    where the UTC run printed July.
//
// 3. The aggregate header picks the min/max finish date across items. A
//    one-month slip in either direction silently renames "next to finish".
// ─────────────────────────────────────────────────────────────────────────────

const c = (date: string, cents: number): GoalContribution => ({
  id: date,
  goal_id: 'g1',
  amount_cents: cents,
  date,
  note: null,
  created_by: 'u1',
  created_at: `${date}T12:00:00.000Z`,
})

const GOAL: Goal = {
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
}

/** First-of-the-month contributions — the dates most likely to slip a month. */
const FIRSTS = [
  '2026-02-01',
  '2026-03-01',
  '2026-04-01',
  '2026-05-01',
  '2026-06-01',
  '2026-07-01',
  '2026-08-01',
].map((d) => c(d, 60_000))

const NOW = new Date(2026, 7, 15) // local August 15

describe('goalProjection under America/New_York', () => {
  it('confirms the suite really is running west of UTC', () => {
    // Guards the guard: if this file ever ran at UTC, every assertion below
    // would pass vacuously and prove nothing.
    expect(new Date('2026-06-01T00:00:00.000Z').getMonth()).toBe(4) // local May
  })

  it('reads the cadence day off the stored string, not a re-derived local date', () => {
    const cadence = goalCadence(FIRSTS)
    expect(cadence?.dayOfMonth).toBe(1)
    expect(cadence?.firstMonthKey).toBe('2026-02')
  })

  it('buckets first-of-month contributions into their own month', () => {
    const months = goalPaceMonths(FIRSTS, goalCadence(FIRSTS), NOW)
    expect(months.map((m) => m.monthKey)).toEqual([
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
    ])
    // A month-slip would show up as a missed month and a doubled neighbour.
    expect(months.every((m) => m.status === 'on_plan')).toBe(true)
  })

  it('projects the same finish month as the UTC suite', () => {
    const projection = goalProjection(GOAL, FIRSTS, NOW)
    expect(projection.paymentsToGo).toBe(23)
    expect(projection.finishDate?.getFullYear()).toBe(2028)
    expect(projection.finishDate?.getMonth()).toBe(6) // July, same as at UTC
  })

  it('keeps a 31st cadence inside short months', () => {
    const endOfMonth = [c('2026-01-31', 50_000), c('2026-03-31', 50_000), c('2026-05-31', 50_000)]
    const projection = goalProjection({ target_cents: 1_000_000 }, endOfMonth, new Date(2026, 5, 15))
    expect(projection.cadence?.dayOfMonth).toBe(31)
    // Whatever month it lands in, it must be a real day of that month — never
    // spilled into the next one by Date's rollover.
    const finish = projection.finishDate!
    expect(finish.getDate()).toBeLessThanOrEqual(31)
    expect(finish.getDate()).toBeGreaterThan(27)
  })

  it('names the same next/last finisher as at UTC', () => {
    const savings: Goal = { ...GOAL, id: 'g2', name: 'ROG XReal Glasses', kind: 'savings', target_cents: 100_000 }
    const summary = savingsDebtsSummary(
      [GOAL, savings],
      {
        g1: FIRSTS,
        g2: [c('2026-06-01', 10_000), c('2026-07-01', 10_000), c('2026-08-01', 10_000)].map((x) => ({
          ...x,
          goal_id: 'g2',
        })),
      },
      NOW
    )
    expect(summary.nextToFinish?.name).toBe('ROG XReal Glasses')
    expect(summary.lastToFinish?.name).toBe('Tasnuva Owes Ayaz')
  })
})
