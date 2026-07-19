import { describe, it, expect } from 'vitest'
import { generateInsights } from '../lib/finance/insights'
import type { Transaction, Budget, Property, Insight } from '../lib/types'

// Characterization tests for generateInsights. Every test pins a FIXED
// referenceDate so the engine never touches the real clock. These exercise
// every rule/branch/severity/threshold path that the golden-vector parity
// suite leaves uncovered.
//
// Fixed reference: June 12, 2026 (local). For this date:
//   current month  = June 2026  (Jun 1 .. Jul 1)
//   prior month    = May 2026
//   daysInMonth=30, dayOfMonth=12, daysLeft=18, monthProgress=12/30=0.4
// A later reference (June 25, 2026) is used where monthProgress >= 0.7 matters.
const REF = new Date(2026, 5, 12)
const REF_LATE = new Date(2026, 5, 25)

let txSeq = 0
function tx(over: Partial<Transaction> = {}): Transaction {
  txSeq++
  const kind = over.kind ?? 'expense'
  return {
    id: over.id ?? `t${txSeq}`,
    household_id: 'hh-1',
    merchant: over.merchant ?? 'Merchant',
    category: over.category ?? (kind === 'income' ? 'income' : 'groceries'),
    kind,
    amount_cents: over.amount_cents ?? 1000,
    source: 'Checking',
    date: over.date ?? '2026-06-05T12:00:00.000Z',
    created_by: 'u-me',
    created_at: '2026-06-05T12:00:00.000Z',
    updated_at: '2026-06-05T12:00:00.000Z',
    owner_ids: ['u-me'],
    shares: {},
    ...over,
  }
}

function budget(category: Budget['category'], monthly_limit_cents: number): Budget {
  return {
    id: `b-${category}`,
    household_id: 'hh-1',
    category,
    monthly_limit_cents,
    budget_type: 'fixed',
    rollover_cap_cents: null,
  }
}

const byId = (ins: Insight[], id: string): Insight | undefined =>
  ins.find((i) => i.id === id)
// June-2026 month tag suffix used in all generated ids.
const M = '2026-06'

describe('generateInsights — Rule 1: top category', () => {
  it('emits an info top-category insight with correct magnitude and share', () => {
    const ins = generateInsights(
      [
        tx({ category: 'groceries', amount_cents: 6000 }),
        tx({ category: 'coffee', amount_cents: 4000 }),
      ],
      [],
      [],
      REF
    )
    const top = byId(ins, `top-category-groceries-${M}`)
    expect(top).toBeTruthy()
    expect(top!.severity).toBe('info')
    expect(top!.category).toBe('groceries')
    expect(top!.magnitude_cents).toBe(6000)
    expect(top!.body).toContain('60%')
  })

  it('does NOT emit a top-category insight when there is no spend', () => {
    const ins = generateInsights([tx({ kind: 'income', amount_cents: 5000 })], [], [], REF)
    expect(ins.find((i) => i.id.startsWith('top-category-'))).toBeUndefined()
  })
})

describe('generateInsights — Rule 2: month-over-month category delta', () => {
  it('emits a warning when a category is up >=25% vs last month', () => {
    const ins = generateInsights(
      [
        tx({ category: 'dining', amount_cents: 10000, date: '2026-06-05T12:00:00.000Z' }),
        tx({ category: 'dining', amount_cents: 4000, date: '2026-05-05T12:00:00.000Z' }),
      ],
      [],
      [],
      REF
    )
    const mom = byId(ins, `mom-dining-${M}`)
    expect(mom).toBeTruthy()
    expect(mom!.severity).toBe('warning')
    // delta = (10000-4000)/4000 = 1.5 -> 150%
    expect(mom!.title).toContain('up 150%')
    expect(mom!.magnitude_cents).toBe(6000)
  })

  it('emits a positive insight when a category is down >=25% vs last month', () => {
    const ins = generateInsights(
      [
        tx({ category: 'dining', amount_cents: 3000, date: '2026-06-05T12:00:00.000Z' }),
        tx({ category: 'dining', amount_cents: 10000, date: '2026-05-05T12:00:00.000Z' }),
      ],
      [],
      [],
      REF
    )
    const mom = byId(ins, `mom-dining-${M}`)
    expect(mom).toBeTruthy()
    expect(mom!.severity).toBe('positive')
    expect(mom!.title).toContain('down 70%')
    expect(mom!.magnitude_cents).toBe(7000)
  })

  it('does NOT emit when prior or current is below the $20 floor', () => {
    const ins = generateInsights(
      [
        tx({ category: 'coffee', amount_cents: 1500, date: '2026-06-05T12:00:00.000Z' }),
        tx({ category: 'coffee', amount_cents: 300, date: '2026-05-05T12:00:00.000Z' }),
      ],
      [],
      [],
      REF
    )
    expect(ins.find((i) => i.id.startsWith('mom-'))).toBeUndefined()
  })

  it('does NOT emit when the delta is below 25%', () => {
    const ins = generateInsights(
      [
        tx({ category: 'dining', amount_cents: 11000, date: '2026-06-05T12:00:00.000Z' }),
        tx({ category: 'dining', amount_cents: 10000, date: '2026-05-05T12:00:00.000Z' }),
      ],
      [],
      [],
      REF
    )
    expect(ins.find((i) => i.id.startsWith('mom-'))).toBeUndefined()
  })
})

describe('generateInsights — Rule 3: budget status', () => {
  it('emits a critical over-budget insight (fraction >= 1.0)', () => {
    const ins = generateInsights(
      [tx({ category: 'groceries', amount_cents: 60000 })],
      [budget('groceries', 50000)],
      [],
      REF
    )
    const over = byId(ins, `budget-over-groceries-${M}`)
    expect(over).toBeTruthy()
    expect(over!.severity).toBe('critical')
    expect(over!.category).toBe('groceries')
    expect(over!.magnitude_cents).toBe(10000) // spent - limit
    expect(over!.body).toContain('18 days left')
  })

  it('emits a warning near-budget insight (0.85 <= fraction < 1.0)', () => {
    const ins = generateInsights(
      [tx({ category: 'groceries', amount_cents: 45000 })],
      [budget('groceries', 50000)],
      [],
      REF
    )
    const near = byId(ins, `budget-near-groceries-${M}`)
    expect(near).toBeTruthy()
    expect(near!.severity).toBe('warning')
    expect(near!.magnitude_cents).toBe(45000) // spent
    expect(near!.body).toContain('18 days to go')
  })

  it('emits a positive under-budget insight (fraction <= 0.5 && monthProgress >= 0.7)', () => {
    const ins = generateInsights(
      [tx({ category: 'groceries', amount_cents: 10000, date: '2026-06-05T12:00:00.000Z' })],
      [budget('groceries', 50000)],
      [],
      REF_LATE // June 25 -> progress 25/30 = 0.833
    )
    const under = byId(ins, `budget-under-groceries-${M}`)
    expect(under).toBeTruthy()
    expect(under!.severity).toBe('positive')
    expect(under!.magnitude_cents).toBe(40000) // remaining
    expect(under!.body).toContain('5 days left') // 30 - 25
  })

  it('does NOT emit under-budget early in the month (monthProgress < 0.7)', () => {
    const ins = generateInsights(
      [tx({ category: 'groceries', amount_cents: 10000 })],
      [budget('groceries', 50000)],
      [],
      REF // progress 0.4
    )
    expect(ins.find((i) => i.id.startsWith('budget-under-'))).toBeUndefined()
  })

  it('skips budgets with a non-positive limit', () => {
    const ins = generateInsights(
      [tx({ category: 'groceries', amount_cents: 60000 })],
      [budget('groceries', 0)],
      [],
      REF
    )
    expect(ins.find((i) => i.id.startsWith('budget-'))).toBeUndefined()
  })

  it('emits no budget insight in the mid-zone (0.5 < fraction < 0.85)', () => {
    const ins = generateInsights(
      [tx({ category: 'groceries', amount_cents: 35000 })],
      [budget('groceries', 50000)],
      [],
      REF_LATE
    )
    expect(ins.find((i) => i.id.startsWith('budget-'))).toBeUndefined()
  })
})

describe('generateInsights — Rule 4: cashflow / savings', () => {
  it('emits a critical deficit when spending exceeds income', () => {
    const ins = generateInsights(
      [
        tx({ category: 'groceries', amount_cents: 80000 }),
        tx({ kind: 'income', amount_cents: 50000 }),
      ],
      [],
      [],
      REF
    )
    const def = byId(ins, `cashflow-deficit-${M}`)
    expect(def).toBeTruthy()
    expect(def!.severity).toBe('critical')
    expect(def!.category).toBeNull()
    expect(def!.magnitude_cents).toBe(30000) // -(income - spend)
  })

  it('emits a positive savings insight when net/income >= 20%', () => {
    const ins = generateInsights(
      [
        tx({ category: 'groceries', amount_cents: 20000 }),
        tx({ kind: 'income', amount_cents: 100000 }),
      ],
      [],
      [],
      REF
    )
    const save = byId(ins, `cashflow-savings-${M}`)
    expect(save).toBeTruthy()
    expect(save!.severity).toBe('positive')
    expect(save!.magnitude_cents).toBe(80000) // net
    expect(save!.title).toContain('80%')
  })

  it('does NOT emit a savings insight when net is positive but below 20%', () => {
    const ins = generateInsights(
      [
        tx({ category: 'groceries', amount_cents: 90000 }),
        tx({ kind: 'income', amount_cents: 100000 }),
      ],
      [],
      [],
      REF
    )
    expect(ins.find((i) => i.id.startsWith('cashflow-'))).toBeUndefined()
  })

  it('does NOT emit any cashflow insight when there is no income and no spend', () => {
    const ins = generateInsights([], [], [], REF)
    expect(ins.find((i) => i.id.startsWith('cashflow-'))).toBeUndefined()
  })
})

describe('generateInsights — Rule 5: recurring subscriptions', () => {
  it('detects a monthly recurring charge (>=3 hits, ~monthly cadence)', () => {
    const ins = generateInsights(
      [
        tx({ merchant: 'Netflix', category: 'subs', amount_cents: 1599, date: '2026-04-10T12:00:00.000Z' }),
        tx({ merchant: 'Netflix', category: 'subs', amount_cents: 1599, date: '2026-05-10T12:00:00.000Z' }),
        tx({ merchant: 'Netflix', category: 'subs', amount_cents: 1599, date: '2026-06-10T12:00:00.000Z' }),
      ],
      [],
      [],
      REF
    )
    const rec = byId(ins, `recurring-${M}`)
    expect(rec).toBeTruthy()
    expect(rec!.severity).toBe('info')
    expect(rec!.category).toBeNull()
    expect(rec!.magnitude_cents).toBe(1599) // average burn
    expect(rec!.body).toContain('Netflix')
  })

  it('does NOT treat irregular cadence as recurring', () => {
    const ins = generateInsights(
      [
        tx({ merchant: 'Random', amount_cents: 1000, date: '2026-01-01T12:00:00.000Z' }),
        tx({ merchant: 'Random', amount_cents: 1000, date: '2026-03-15T12:00:00.000Z' }),
        tx({ merchant: 'Random', amount_cents: 1000, date: '2026-06-10T12:00:00.000Z' }),
      ],
      [],
      [],
      REF
    )
    expect(ins.find((i) => i.id.startsWith('recurring-'))).toBeUndefined()
  })

  it('does NOT treat fewer than 3 charges as recurring', () => {
    const ins = generateInsights(
      [
        tx({ merchant: 'Spotify', amount_cents: 999, date: '2026-05-10T12:00:00.000Z' }),
        tx({ merchant: 'Spotify', amount_cents: 999, date: '2026-06-10T12:00:00.000Z' }),
      ],
      [],
      [],
      REF
    )
    expect(ins.find((i) => i.id.startsWith('recurring-'))).toBeUndefined()
  })

  it('summarizes ">3 more" when more than three recurring merchants exist', () => {
    const merchants = ['Netflix', 'Spotify', 'Hulu', 'Disney']
    const txs: Transaction[] = []
    for (const m of merchants) {
      for (const day of ['2026-04-10', '2026-05-10', '2026-06-10']) {
        txs.push(tx({ merchant: m, category: 'subs', amount_cents: 1000, date: `${day}T12:00:00.000Z` }))
      }
    }
    const ins = generateInsights(txs, [], [], REF, 20)
    const rec = byId(ins, `recurring-${M}`)
    expect(rec).toBeTruthy()
    expect(rec!.body).toContain('+ 1 more')
    expect(rec!.magnitude_cents).toBe(4000) // 4 merchants x 1000 avg
  })
})

describe('generateInsights — Rule 6: outlier transaction', () => {
  // Build a baseline of >=5 trailing same-category charges so a median exists.
  const baseline = (cat: Transaction['category'], cents: number): Transaction[] =>
    ['2026-02-03', '2026-03-03', '2026-04-03', '2026-05-03', '2026-05-20'].map((d) =>
      tx({ category: cat, amount_cents: cents, date: `${d}T12:00:00.000Z` })
    )

  it('flags an unusual charge >=2x the category median (info under $500)', () => {
    const big = tx({ id: 'big-1', category: 'dining', amount_cents: 8000, date: '2026-06-05T12:00:00.000Z' })
    const ins = generateInsights([...baseline('dining', 2000), big], [], [], REF)
    const out = byId(ins, 'outlier-big-1')
    expect(out).toBeTruthy()
    expect(out!.severity).toBe('info') // < 50000
    expect(out!.category).toBe('dining')
    expect(out!.magnitude_cents).toBe(8000)
    expect(out!.body).toContain('4.0×')
  })

  it('escalates to warning when the outlier is >= $500', () => {
    const big = tx({ id: 'big-2', category: 'dining', amount_cents: 60000, date: '2026-06-05T12:00:00.000Z' })
    const ins = generateInsights([...baseline('dining', 2000), big], [], [], REF)
    const out = byId(ins, 'outlier-big-2')
    expect(out).toBeTruthy()
    expect(out!.severity).toBe('warning') // >= 50000
    expect(out!.magnitude_cents).toBe(60000)
  })

  it('does NOT flag a charge below 2x the median', () => {
    const normal = tx({ id: 'norm', category: 'dining', amount_cents: 3000, date: '2026-06-05T12:00:00.000Z' })
    const ins = generateInsights([...baseline('dining', 2000), normal], [], [], REF)
    expect(ins.find((i) => i.id.startsWith('outlier-'))).toBeUndefined()
  })

  it('does NOT compute a median for categories with fewer than 5 charges', () => {
    // 3 baseline + 1 big = 4 trailing fuel charges (< 5) -> no median computed.
    const few = ['2026-04-03', '2026-05-03', '2026-05-20'].map((d) =>
      tx({ category: 'fuel', amount_cents: 2000, date: `${d}T12:00:00.000Z` })
    )
    const big = tx({ id: 'big-3', category: 'fuel', amount_cents: 20000, date: '2026-06-05T12:00:00.000Z' })
    const ins = generateInsights([...few, big], [], [], REF)
    expect(ins.find((i) => i.id.startsWith('outlier-'))).toBeUndefined()
  })

  it('keeps the largest outlier when several qualify', () => {
    const big1 = tx({ id: 'o1', category: 'dining', amount_cents: 8000, date: '2026-06-04T12:00:00.000Z' })
    const big2 = tx({ id: 'o2', category: 'dining', amount_cents: 12000, date: '2026-06-06T12:00:00.000Z' })
    const ins = generateInsights([...baseline('dining', 2000), big1, big2], [], [], REF)
    expect(byId(ins, 'outlier-o2')).toBeTruthy()
    expect(byId(ins, 'outlier-o1')).toBeUndefined()
  })
})

describe('generateInsights — Rule 7: 30-day trend', () => {
  it('emits a warning when 30-day spend is up >=20% vs the prior 30', () => {
    const ins = generateInsights(
      [
        // recent 30 (within May 13 .. Jun 12)
        tx({ category: 'groceries', amount_cents: 30000, date: '2026-06-01T12:00:00.000Z' }),
        // prior 30 (Apr 13 .. May 13)
        tx({ category: 'groceries', amount_cents: 20000, date: '2026-04-20T12:00:00.000Z' }),
      ],
      [],
      [],
      REF
    )
    const trend = byId(ins, `trend30-${M}`)
    expect(trend).toBeTruthy()
    expect(trend!.severity).toBe('warning')
    expect(trend!.title).toContain('up 50%')
    expect(trend!.magnitude_cents).toBe(10000)
  })

  it('emits a positive insight when 30-day spend is down >=20%', () => {
    const ins = generateInsights(
      [
        tx({ category: 'groceries', amount_cents: 20000, date: '2026-06-01T12:00:00.000Z' }),
        tx({ category: 'groceries', amount_cents: 40000, date: '2026-04-20T12:00:00.000Z' }),
      ],
      [],
      [],
      REF
    )
    const trend = byId(ins, `trend30-${M}`)
    expect(trend).toBeTruthy()
    expect(trend!.severity).toBe('positive')
    expect(trend!.title).toContain('down 50%')
  })

  it('does NOT emit a trend when prior-30 spend is below the $100 floor', () => {
    const ins = generateInsights(
      [
        tx({ category: 'groceries', amount_cents: 30000, date: '2026-06-01T12:00:00.000Z' }),
        tx({ category: 'groceries', amount_cents: 5000, date: '2026-04-20T12:00:00.000Z' }),
      ],
      [],
      [],
      REF
    )
    expect(ins.find((i) => i.id.startsWith('trend30-'))).toBeUndefined()
  })

  it('does NOT emit a trend when the change is below 20%', () => {
    const ins = generateInsights(
      [
        tx({ category: 'groceries', amount_cents: 21000, date: '2026-06-01T12:00:00.000Z' }),
        tx({ category: 'groceries', amount_cents: 20000, date: '2026-04-20T12:00:00.000Z' }),
      ],
      [],
      [],
      REF
    )
    expect(ins.find((i) => i.id.startsWith('trend30-'))).toBeUndefined()
  })
})

describe('generateInsights — Rule 8: mortgage affordability', () => {
  function propWithMortgage(rate: number): Property {
    return {
      id: 'p1',
      household_id: 'hh-1',
      kind: 'primary_home',
      address: '1 Main St',
      nickname: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      mortgage: {
        property_id: 'p1',
        purchase_price_cents: 40000000,
        original_loan_cents: 30000000, // payment ~ $1,798.65 at 6%/30y
        annual_interest_rate_percent: rate,
        loan_term_years: 30,
        closing_date: '2024-01-01',
        auto_pay_source: null,
      },
    }
  }
  const income = (cents: number) => tx({ kind: 'income', amount_cents: cents })

  it('emits a positive insight when the ratio is below 28%', () => {
    // payment 179865 / income 700000 = 0.257 -> positive
    const ins = generateInsights([income(700000)], [], [propWithMortgage(6)], REF)
    const m = byId(ins, `mortgage-ratio-${M}`)
    expect(m).toBeTruthy()
    expect(m!.severity).toBe('positive')
    expect(m!.category).toBeNull()
    expect(m!.magnitude_cents).toBe(179865)
    expect(m!.title).not.toContain('high')
  })

  it('emits an info insight when the ratio is 28%–35%', () => {
    // 179865 / 600000 = 0.2998 -> info
    const ins = generateInsights([income(600000)], [], [propWithMortgage(6)], REF)
    const m = byId(ins, `mortgage-ratio-${M}`)
    expect(m).toBeTruthy()
    expect(m!.severity).toBe('info')
    expect(m!.title).not.toContain('high')
  })

  it('emits a warning ("— high") when the ratio exceeds 35%', () => {
    // 179865 / 400000 = 0.4497 -> warning
    const ins = generateInsights([income(400000)], [], [propWithMortgage(6)], REF)
    const m = byId(ins, `mortgage-ratio-${M}`)
    expect(m).toBeTruthy()
    expect(m!.severity).toBe('warning')
    expect(m!.title).toContain('— high')
  })

  it('does NOT emit a mortgage insight when there is no income this month', () => {
    const ins = generateInsights(
      [tx({ category: 'groceries', amount_cents: 1000 })],
      [],
      [propWithMortgage(6)],
      REF
    )
    expect(ins.find((i) => i.id.startsWith('mortgage-ratio-'))).toBeUndefined()
  })

  it('does NOT emit a mortgage insight when no property has a mortgage', () => {
    const propNoMortgage: Property = {
      id: 'p2',
      household_id: 'hh-1',
      kind: 'rental',
      address: '2 Main St',
      nickname: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }
    const ins = generateInsights([tx({ kind: 'income', amount_cents: 700000 })], [], [propNoMortgage], REF)
    expect(ins.find((i) => i.id.startsWith('mortgage-ratio-'))).toBeUndefined()
  })
})

describe('generateInsights — sorting & limit', () => {
  it('sorts critical-first and caps at the limit', () => {
    const ins = generateInsights(
      [
        // critical deficit
        tx({ category: 'groceries', amount_cents: 80000 }),
        tx({ kind: 'income', amount_cents: 50000 }),
      ],
      [budget('groceries', 50000)], // critical over-budget too
      [],
      REF,
      2
    )
    expect(ins.length).toBe(2)
    expect(ins.every((i) => i.severity === 'critical')).toBe(true)
  })

  it('returns an empty array when there is no qualifying data', () => {
    expect(generateInsights([], [], [], REF)).toEqual([])
  })
})

// --- spec 013 US3: recurring preview is iOS-canonical (amount desc, name
// tie-break, newest casing) and the outlier date follows the app locale. ---

describe('generateInsights — Rule 5: recurring preview ordering (013/US3)', () => {
  // Three ~monthly hits inside the trailing-6-month window of REF (Jun 12 2026).
  const monthly = (merchant: string, cents: number, casings?: [string, string, string]) =>
    ['2026-03-05', '2026-04-04', '2026-05-05'].map((d, i) =>
      tx({
        merchant: casings ? casings[i] : merchant,
        category: 'subs',
        amount_cents: cents,
        date: `${d}T12:00:00.000Z`,
      })
    )

  const previewOf = (ins: Insight[]): string => {
    const rec = byId(ins, `recurring-${M}`)
    expect(rec).toBeTruthy()
    // body = "Detected N recurring charges: <preview>."  (or "… <preview> + K more.")
    return rec!.body.split(': ')[1]
  }

  it('orders the 3-merchant preview by monthly amount, highest first', () => {
    // Insertion order (Map order) is Cheap first — amount order must win.
    const ins = generateInsights(
      [...monthly('Cheap', 500), ...monthly('Pricey', 5000), ...monthly('Middle', 2000)],
      [],
      [],
      REF
    )
    expect(previewOf(ins)).toBe('Pricey, Middle, Cheap.')
  })

  it('breaks amount ties by case-insensitive merchant name', () => {
    const ins = generateInsights(
      [...monthly('netflix', 1000), ...monthly('Apple', 1000)],
      [],
      [],
      REF
    )
    expect(previewOf(ins)).toBe('Apple, netflix.')
  })

  it("uses the most recent transaction's casing for each merchant", () => {
    // Same merchant key, casing changed over time — newest ("SPOTIFY") wins.
    const ins = generateInsights(
      monthly('spotify', 1200, ['spotify', 'Spotify', 'SPOTIFY']),
      [],
      [],
      REF
    )
    expect(previewOf(ins)).toBe('SPOTIFY.')
  })

  it('keeps "+ N more" after the top 3 by amount', () => {
    const ins = generateInsights(
      [
        ...monthly('Alpha', 400),
        ...monthly('Bravo', 3000),
        ...monthly('Delta', 2000),
        ...monthly('Golf', 1000),
      ],
      [],
      [],
      REF
    )
    expect(previewOf(ins)).toBe('Bravo, Delta, Golf + 1 more.')
  })
})

describe('generateInsights — Rule 6: outlier date locale (013/US3)', () => {
  const baseline = (cents: number): Transaction[] =>
    ['2026-02-03', '2026-03-03', '2026-04-03', '2026-05-03', '2026-05-20'].map((d) =>
      tx({ category: 'dining', amount_cents: cents, date: `${d}T12:00:00.000Z` })
    )
  const big = () =>
    tx({ id: 'big-loc', category: 'dining', amount_cents: 8000, date: '2026-06-05T12:00:00.000Z' })

  it('formats the outlier date in the caller-supplied locale', () => {
    const ins = generateInsights([...baseline(2000), big()], [], [], REF, 6, undefined, 'es-ES')
    const out = byId(ins, 'outlier-big-loc')
    expect(out).toBeTruthy()
    expect(out!.body).toContain('5 jun') // es-ES renders "5 jun", not "Jun 5"
    expect(out!.body).not.toContain('Jun 5')
  })

  it('defaults to en-US rendering', () => {
    const ins = generateInsights([...baseline(2000), big()], [], [], REF)
    expect(byId(ins, 'outlier-big-loc')!.body).toContain('Jun 5')
  })
})

// Spec 027: Rule 3 measures spend against the rollover-aware EFFECTIVE limit.
describe('budget insights are rollover-aware (spec 027)', () => {
  const flexBudget = (limit: number, created_at: string): Budget => ({
    id: 'b-dining',
    household_id: 'hh-1',
    category: 'dining',
    monthly_limit_cents: limit,
    budget_type: 'flex',
    rollover_cap_cents: null,
    created_at,
  })

  it('a fixed budget behaves exactly as before (no carry)', () => {
    // $400 spent on a $300 fixed limit → over by $100, body cites the $300 base.
    const b = budget('dining', 30000)
    const txs = [tx({ category: 'dining', amount_cents: 40000, date: '2026-06-09T12:00:00.000Z' })]
    const over = byId(generateInsights(txs, [b], [], REF), `budget-over-dining-${M}`)
    expect(over).toBeDefined()
    expect(over!.magnitude_cents).toBe(10000) // 40000 − 30000
    expect(over!.body).toContain('$300.00')
  })

  it('flex carried surplus lifts the effective limit out of "over"', () => {
    // May $50 on a $300 flex base → $250 rolls to June (effective $550).
    // June $400 spend is UNDER the $550 effective limit — no over-budget insight.
    const b = flexBudget(30000, '2026-05-01T12:00:00.000Z')
    const txs = [
      tx({ category: 'dining', amount_cents: 5000, date: '2026-05-08T12:00:00.000Z' }),
      tx({ category: 'dining', amount_cents: 40000, date: '2026-06-09T12:00:00.000Z' }),
    ]
    const ins = generateInsights(txs, [b], [], REF)
    expect(byId(ins, `budget-over-dining-${M}`)).toBeUndefined()
    // The same spend WITHOUT rollover (fixed) would have been over budget:
    const fixedIns = generateInsights(txs, [budget('dining', 30000)], [], REF)
    expect(byId(fixedIns, `budget-over-dining-${M}`)).toBeDefined()
  })

  it('flex still goes over once spend exceeds the effective limit, citing it', () => {
    // Effective $550; spend $600 → $50 over, body cites the $550 effective limit.
    const b = flexBudget(30000, '2026-05-01T12:00:00.000Z')
    const txs = [
      tx({ category: 'dining', amount_cents: 5000, date: '2026-05-08T12:00:00.000Z' }),
      tx({ category: 'dining', amount_cents: 60000, date: '2026-06-09T12:00:00.000Z' }),
    ]
    const over = byId(generateInsights(txs, [b], [], REF), `budget-over-dining-${M}`)
    expect(over).toBeDefined()
    expect(over!.magnitude_cents).toBe(5000) // 60000 − 55000
    expect(over!.body).toContain('$550.00')
  })
})
