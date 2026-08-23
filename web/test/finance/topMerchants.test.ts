import { describe, it, expect } from 'vitest'
import { computeTopMerchants } from '@/lib/finance/topMerchants'
import type { Transaction } from '@/lib/types'

// Spec 057 US6 redesign: the panel inverts priority into three fixed-height
// zones — a verdict + meter for the standing recurring commitment, a
// day-of-month cycle strip (detection is monthly by construction, so day-of-
// month is the only axis that holds 1 dot and 20 at a fixed height), and a
// bounded top-5 ranked list with per-merchant deltas. This engine derives all
// three from transactions + the existing recurring-charge detector, reused
// as-is (FR-016).

let seq = 0
function expense(merchant: string, dateIso: string, cents: number, extra: Partial<Transaction> = {}): Transaction {
  seq++
  return {
    id: `tx-${seq}`,
    household_id: 'hh',
    merchant,
    category: 'other',
    kind: 'expense',
    amount_cents: cents,
    source: 'manual',
    date: dateIso,
    created_by: 'u',
    created_at: dateIso,
    updated_at: dateIso,
    owner_ids: [],
    shares: {},
    ...extra,
  } as Transaction
}

/** 3 monthly occurrences ending in July, spaced 30 days apart — enough to
 *  cross detectRoutines' recurringMinCount(3)/cadence(21-40d) thresholds. */
function monthlyCharge(merchant: string, day: number, cents: number, months: string[]): Transaction[] {
  return months.map((ym) => expense(merchant, `${ym}-${String(day).padStart(2, '0')}T12:00:00.000Z`, cents))
}

const AUGUST = { start: new Date(2026, 7, 1), end: new Date(2026, 8, 1) }
const TODAY_MID_AUGUST = new Date(2026, 7, 15, 12)

describe('computeTopMerchants — ranking', () => {
  it('ranks merchants by period spend, descending, and merges store-code variants under one key', () => {
    const s = computeTopMerchants(
      [
        expense('Dunkin #4521', '2026-08-05T12:00:00.000Z', 500),
        expense('Dunkin #9902', '2026-08-10T12:00:00.000Z', 500),
        expense('Uber Eats', '2026-08-06T12:00:00.000Z', 900),
      ],
      AUGUST,
      TODAY_MID_AUGUST
    )
    // Merged Dunkin total ($10.00) outranks Uber Eats ($9.00).
    expect(s.entries.map((e) => e.merchant)).toEqual(['Dunkin #4521', 'Uber Eats'])
    expect(s.entries[0].cents).toBe(1000)
    expect(s.entries[0].count).toBe(2)
  })

  it('computes a delta against the immediately preceding equal-length window', () => {
    const s = computeTopMerchants(
      [
        expense('Uber Eats', '2026-07-06T12:00:00.000Z', 700),
        expense('Uber Eats', '2026-08-06T12:00:00.000Z', 900),
      ],
      AUGUST,
      TODAY_MID_AUGUST
    )
    expect(s.entries[0].deltaCents).toBe(200)
    expect(s.hasPriorPeriod).toBe(true)
  })

  it('reports no prior period when the preceding window has no activity at all', () => {
    const s = computeTopMerchants([expense('Uber Eats', '2026-08-06T12:00:00.000Z', 900)], AUGUST, TODAY_MID_AUGUST)
    expect(s.hasPriorPeriod).toBe(false)
  })
})

describe('computeTopMerchants — recurring verdict (zone 1)', () => {
  it('sums the typical amount of every active recurring charge as the standing monthly commitment', () => {
    const txns = [
      ...monthlyCharge('Netflix', 15, 1599, ['2026-05', '2026-06', '2026-07']),
      ...monthlyCharge('Con Edison', 6, 21430, ['2026-05', '2026-06', '2026-07']),
      expense('Trader Joes', '2026-08-03T12:00:00.000Z', 8644),
    ]
    const s = computeTopMerchants(txns, AUGUST, TODAY_MID_AUGUST)
    expect(s.standingMonthlyCents).toBe(1599 + 21430)
    expect(s.activeRecurringCount).toBe(2)
  })

  it('excludes a lapsed recurring charge from the standing monthly commitment', () => {
    const txns = monthlyCharge('Old Gym', 15, 5000, ['2026-01', '2026-02', '2026-03'])
    // Nothing since March; by August that is well past 2 missed 30-day cycles.
    const s = computeTopMerchants(txns, AUGUST, TODAY_MID_AUGUST)
    expect(s.standingMonthlyCents).toBe(0)
    expect(s.activeRecurringCount).toBe(0)
  })

  it('measures this period\'s recurring share against the period total', () => {
    const txns = [
      ...monthlyCharge('Netflix', 15, 1599, ['2026-05', '2026-06', '2026-07', '2026-08']),
      expense('Trader Joes', '2026-08-03T12:00:00.000Z', 8401),
    ]
    const s = computeTopMerchants(txns, AUGUST, TODAY_MID_AUGUST)
    expect(s.periodTotalCents).toBe(1599 + 8401)
    expect(s.recurringInPeriodCents).toBe(1599)
    expect(s.share).toBeCloseTo(1599 / (1599 + 8401))
  })
})

describe('computeTopMerchants — cycle strip (zone 2)', () => {
  it('marks a charge that already landed this period as a landed dot on its calendar day', () => {
    const txns = monthlyCharge('Netflix', 15, 1599, ['2026-05', '2026-06', '2026-07', '2026-08'])
    const s = computeTopMerchants(txns, AUGUST, TODAY_MID_AUGUST)
    expect(s.dots).toHaveLength(1)
    expect(s.dots[0]).toMatchObject({ day: 15, amountCents: 1599, landed: true })
    expect(s.landedCount).toBe(1)
    expect(s.aheadCount).toBe(0)
  })

  it("marks an active charge that hasn't landed yet this cycle as 'ahead', expected on its usual day", () => {
    // Last landed July 24; by mid-August (today) it hasn't billed again yet.
    const txns = monthlyCharge('Hyundai Insurance', 24, 8900, ['2026-05', '2026-06', '2026-07'])
    const s = computeTopMerchants(txns, AUGUST, TODAY_MID_AUGUST)
    expect(s.dots).toHaveLength(1)
    expect(s.dots[0]).toMatchObject({ day: 24, amountCents: 8900, landed: false })
    expect(s.aheadCount).toBe(1)
    expect(s.aheadCents).toBe(8900)
  })

  it('never shows an ahead dot for a lapsed charge', () => {
    const txns = monthlyCharge('Old Gym', 15, 5000, ['2026-01', '2026-02', '2026-03'])
    const s = computeTopMerchants(txns, AUGUST, TODAY_MID_AUGUST)
    expect(s.dots).toHaveLength(0)
  })

  it('picks the soonest ahead charge as "next", wrapping the month if needed', () => {
    const txns = [
      ...monthlyCharge('Late Bill', 3, 1000, ['2026-05', '2026-06', '2026-07']), // day 3, before today (15th) → wraps to next month
      ...monthlyCharge('Soon Bill', 20, 2000, ['2026-05', '2026-06', '2026-07']), // day 20, after today (15th) → sooner
    ]
    const s = computeTopMerchants(txns, AUGUST, TODAY_MID_AUGUST)
    expect(s.nextCharge?.merchantLabel).toBe('Soon Bill')
  })

  it('drops the today marker and ahead dots for a window not containing today', () => {
    const txns = monthlyCharge('Netflix', 15, 1599, ['2026-05', '2026-06', '2026-07'])
    const past = { start: new Date(2026, 6, 1), end: new Date(2026, 7, 1) } // July, before "today"
    const s = computeTopMerchants(txns, past, TODAY_MID_AUGUST)
    expect(s.containsToday).toBe(false)
    expect(s.aheadCount).toBe(0)
  })

  it('folds a long multi-month window onto the same 31-day axis instead of densifying', () => {
    const txns = monthlyCharge('Netflix', 15, 1599, ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'])
    const sixMonths = { start: new Date(2026, 2, 1), end: new Date(2026, 8, 1) }
    const s = computeTopMerchants(txns, sixMonths, TODAY_MID_AUGUST)
    expect(s.isLongWindow).toBe(true)
    expect(s.containsToday).toBe(false)
    // Six landings, all on day 15 — folded onto one calendar day, not 6 separate months of chart width.
    expect(s.landedCount).toBe(6)
    expect(s.dots.every((d) => d.day === 15)).toBe(true)
  })

  it('caps same-day dots at three, carrying the rest in the tally only', () => {
    const txns = [
      ...monthlyCharge('A', 8, 1000, ['2026-05', '2026-06', '2026-07', '2026-08']),
      ...monthlyCharge('B', 8, 2000, ['2026-05', '2026-06', '2026-07', '2026-08']),
      ...monthlyCharge('C', 8, 3000, ['2026-05', '2026-06', '2026-07', '2026-08']),
      ...monthlyCharge('D', 8, 4000, ['2026-05', '2026-06', '2026-07', '2026-08']),
    ]
    const s = computeTopMerchants(txns, AUGUST, TODAY_MID_AUGUST)
    const day8Dots = s.dots.filter((d) => d.day === 8)
    expect(day8Dots.length).toBe(3)
    expect(s.landedCount).toBe(4) // all 4 still counted in the tally
    expect(s.landedCents).toBe(10000)
  })
})

describe('computeTopMerchants — empty inputs', () => {
  it('returns a calm zero summary with no expenses in the period', () => {
    const s = computeTopMerchants([], AUGUST, TODAY_MID_AUGUST)
    expect(s.entries).toEqual([])
    expect(s.periodTotalCents).toBe(0)
    expect(s.standingMonthlyCents).toBe(0)
    expect(s.dots).toEqual([])
  })
})
