import { savingsRate } from '@/lib/reports/savings'
import { parseTxDate } from '@/lib/format'
import type { Transaction } from '@/lib/types'

export interface SavingsMonthPoint {
  yyyymm: string
  incomeCents: number
  expenseCents: number
  savedCents: number
  /** (income − expense) / income, or `null` when the month has no income. */
  rate: number | null
}

export interface SavingsTrendsSummary {
  /** Ascending chronological order, one entry per calendar month in `interval`. */
  months: SavingsMonthPoint[]
  windowIncomeCents: number
  windowExpenseCents: number
  windowSavedCents: number
  windowRate: number | null
  /** Highest-rate month, only when >1 month is present and a clear winner exists. */
  bestKey: string | null
  /** Lowest-rate month, only when >1 month is present and a clear loser exists. */
  leanestKey: string | null
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** `'YYYY-MM'` shifted by `delta` calendar months (negative goes back). Used
 *  to build the single-month view's trailing "in context" window without
 *  hand-rolled year-rollover arithmetic at each call site. */
export function shiftMonthKey(yyyymm: string, delta: number): string {
  const [y, m] = yyyymm.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

/**
 * Buckets transactions into the calendar months spanning `interval` and
 * summarizes the window (spec 057 US5 redesign) — the panel's C-3
 * justification is that the card keeps only the rate; this reconstructs both
 * terms behind it, month by month, plus which month saved the most and least
 * of its income.
 *
 * One function serves two call sites in the panel: the scope's own window
 * (however many months it spans), and a synthetic trailing window built for
 * the single-month "in context" chart — both are just "bucket this
 * interval."
 */
export function computeSavingsTrends(
  transactions: Transaction[],
  interval: { start: Date; end: Date }
): SavingsTrendsSummary {
  // The interval arrives month-aligned in one of two frames: LOCAL boundaries
  // (range mode) or UTC instants (a selected month, via monthBounds). Reading
  // local getters straight off a UTC instant scaffolded a phantom prior month
  // west of UTC (review 2026-08-24, B2). Reading the calendar month at NOON of
  // each instant lands in the same month in both frames for every offset
  // within ±11, so one scaffold serves both.
  const HALF_DAY_MS = 12 * 60 * 60 * 1000
  const order: string[] = []
  const index = new Map<string, SavingsMonthPoint>()
  const anchor = new Date(interval.start.getTime() + HALF_DAY_MS)
  let cursor = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  while (cursor.getTime() + HALF_DAY_MS < interval.end.getTime()) {
    const key = `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}`
    order.push(key)
    index.set(key, { yyyymm: key, incomeCents: 0, expenseCents: 0, savedCents: 0, rate: null })
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  }

  const startMs = interval.start.getTime()
  const endMs = interval.end.getTime()
  for (const tx of transactions) {
    const d = parseTxDate(tx.date)
    const ms = d.getTime()
    if (ms < startMs || ms >= endMs) continue
    const bucket = index.get(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`)
    if (!bucket) continue
    if (tx.kind === 'income') bucket.incomeCents += tx.amount_cents
    else if (tx.kind === 'expense') bucket.expenseCents += tx.amount_cents
  }

  const months = order.map((key) => {
    const b = index.get(key)!
    b.savedCents = b.incomeCents - b.expenseCents
    b.rate = savingsRate(b.incomeCents, b.expenseCents)
    return b
  })

  const windowIncomeCents = months.reduce((sum, m) => sum + m.incomeCents, 0)
  const windowExpenseCents = months.reduce((sum, m) => sum + m.expenseCents, 0)

  let bestKey: string | null = null
  let leanestKey: string | null = null
  if (months.length > 1) {
    let best: SavingsMonthPoint | null = null
    let leanest: SavingsMonthPoint | null = null
    let bestRate = -Infinity
    let leanestRate = Infinity
    for (const m of months) {
      if (m.rate === null) continue
      if (m.rate > bestRate) {
        bestRate = m.rate
        best = m
      }
      if (m.rate < leanestRate) {
        leanestRate = m.rate
        leanest = m
      }
    }
    if (best && leanest && best.yyyymm !== leanest.yyyymm) {
      bestKey = best.yyyymm
      leanestKey = leanest.yyyymm
    }
  }

  return {
    months,
    windowIncomeCents,
    windowExpenseCents,
    windowSavedCents: windowIncomeCents - windowExpenseCents,
    windowRate: savingsRate(windowIncomeCents, windowExpenseCents),
    bestKey,
    leanestKey,
  }
}
