import type { Transaction, Budget, Property, Insight, TransactionCategory } from '../types'
import { CATEGORIES } from '../categories'
import { monthlyPaymentCents } from './mortgage'

// Insights mirror the iOS InsightEngine. Money is rendered in USD with 2
// decimals here (the engine is currency-agnostic; display conversion happens
// elsewhere). Amounts are USD cents.

function usd(cents: number): string {
  const dollars = Math.abs(cents) / 100
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: dollars % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(dollars)
}

const monthTag = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

function monthInterval(d: Date): [Date, Date] {
  return [new Date(d.getFullYear(), d.getMonth(), 1), new Date(d.getFullYear(), d.getMonth() + 1, 1)]
}

function inInterval(date: string, start: Date, end: Date): boolean {
  const t = new Date(date).getTime()
  return t >= start.getTime() && t < end.getTime()
}

function expensesIn(txs: Transaction[], start: Date, end: Date): Transaction[] {
  return txs.filter((t) => t.kind === 'expense' && inInterval(t.date, start, end))
}

function sumCents(txs: Transaction[]): number {
  return txs.reduce((s, t) => s + t.amount_cents, 0)
}

function catLabel(c: TransactionCategory): string {
  return CATEGORIES[c].label
}

/**
 * Generate dashboard insights from household data. Returns up to `limit`
 * insights, sorted by severity then magnitude.
 */
export function generateInsights(
  transactions: Transaction[],
  budgets: Budget[],
  properties: Property[],
  now: Date = new Date(),
  limit: number = 6
): Insight[] {
  const out: Insight[] = []
  const [mStart, mEnd] = monthInterval(now)
  const [pStart, pEnd] = monthInterval(new Date(now.getFullYear(), now.getMonth() - 1, 1))

  const monthExpenses = expensesIn(transactions, mStart, mEnd)
  const priorExpenses = expensesIn(transactions, pStart, pEnd)
  const monthTotal = sumCents(monthExpenses)

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dayOfMonth = now.getDate()
  const daysLeft = Math.max(0, daysInMonth - dayOfMonth)
  const monthProgress = dayOfMonth / daysInMonth

  const byCategory = (txs: Transaction[]) => {
    const m = new Map<TransactionCategory, number>()
    for (const t of txs) m.set(t.category, (m.get(t.category) ?? 0) + t.amount_cents)
    return m
  }
  const monthByCat = byCategory(monthExpenses)
  const priorByCat = byCategory(priorExpenses)

  // --- Rule 1: Top category ---
  let topCat: TransactionCategory | null = null
  let topVal = 0
  for (const [c, v] of monthByCat) {
    if (v > topVal) {
      topCat = c
      topVal = v
    }
  }
  if (topCat && topVal > 0 && monthTotal > 0) {
    const share = Math.round((topVal / monthTotal) * 100)
    out.push({
      id: `top-category-${topCat}-${monthTag(now)}`,
      title: `${catLabel(topCat)} is your top category`,
      body: `${usd(topVal)} this month — ${share}% of total spend.`,
      severity: 'info',
      icon: 'top',
      category: topCat,
      magnitude_cents: topVal,
    })
  }

  // --- Rule 2: Month-over-month category deltas ---
  for (const c of monthByCat.keys()) {
    const current = monthByCat.get(c) ?? 0
    const prior = priorByCat.get(c) ?? 0
    if (prior < 2000 || current < 2000) continue
    const delta = (current - prior) / prior
    if (Math.abs(delta) < 0.25) continue
    const pct = Math.round(Math.abs(delta) * 100)
    const up = delta > 0
    out.push({
      id: `mom-${c}-${monthTag(now)}`,
      title: `${catLabel(c)} ${up ? 'up' : 'down'} ${pct}% vs last month`,
      body: `${usd(prior)} → ${usd(current)}.`,
      severity: up ? 'warning' : 'positive',
      icon: up ? 'up' : 'down',
      category: c,
      magnitude_cents: Math.abs(current - prior),
    })
  }

  // --- Rule 3: Budget status ---
  for (const b of budgets) {
    if (b.monthly_limit_cents <= 0) continue
    const spent = monthByCat.get(b.category) ?? 0
    const fraction = spent / b.monthly_limit_cents
    if (fraction >= 1.0) {
      const over = spent - b.monthly_limit_cents
      out.push({
        id: `budget-over-${b.category}-${monthTag(now)}`,
        title: `Over budget on ${catLabel(b.category)}`,
        body: `You're ${usd(over)} over your ${usd(b.monthly_limit_cents)} limit with ${daysLeft} days left.`,
        severity: 'critical',
        icon: 'alert',
        category: b.category,
        magnitude_cents: over,
      })
    } else if (fraction >= 0.85) {
      const remaining = b.monthly_limit_cents - spent
      out.push({
        id: `budget-near-${b.category}-${monthTag(now)}`,
        title: `Approaching ${catLabel(b.category)} limit`,
        body: `${usd(remaining)} left of ${usd(b.monthly_limit_cents)} with ${daysLeft} days to go.`,
        severity: 'warning',
        icon: 'gauge',
        category: b.category,
        magnitude_cents: spent,
      })
    } else if (fraction <= 0.5 && monthProgress >= 0.7) {
      const remaining = b.monthly_limit_cents - spent
      out.push({
        id: `budget-under-${b.category}-${monthTag(now)}`,
        title: `Under budget on ${catLabel(b.category)}`,
        body: `${usd(remaining)} of ${usd(b.monthly_limit_cents)} still available with ${daysLeft} days left.`,
        severity: 'positive',
        icon: 'check',
        category: b.category,
        magnitude_cents: remaining,
      })
    }
  }

  // --- Rule 4: Cashflow / savings rate ---
  const monthIncome = sumCents(
    transactions.filter((t) => t.kind === 'income' && inInterval(t.date, mStart, mEnd))
  )
  if (monthIncome > 0 || monthTotal > 0) {
    const net = monthIncome - monthTotal
    if (net < 0) {
      out.push({
        id: `cashflow-deficit-${monthTag(now)}`,
        title: 'Spending exceeds income',
        body: `You're ${usd(-net)} over this month: ${usd(monthTotal)} out vs ${usd(monthIncome)} in.`,
        severity: 'critical',
        icon: 'minus',
        category: null,
        magnitude_cents: -net,
      })
    } else if (monthIncome > 0 && net / monthIncome >= 0.2) {
      const pct = Math.round((net / monthIncome) * 100)
      out.push({
        id: `cashflow-savings-${monthTag(now)}`,
        title: `Saving ${pct}% of income`,
        body: `Net ${usd(net)} saved this month — well above the 20% benchmark.`,
        severity: 'positive',
        icon: 'leaf',
        category: null,
        magnitude_cents: net,
      })
    }
  }

  // --- Rule 5: Recurring subscriptions (trailing 6 months) ---
  const sixMonthsAgo = new Date(now)
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const trailing = transactions.filter(
    (t) => t.kind === 'expense' && new Date(t.date).getTime() >= sixMonthsAgo.getTime()
  )
  const byMerchant = new Map<string, Transaction[]>()
  for (const t of trailing) {
    const key = t.merchant.trim().toLowerCase()
    const arr = byMerchant.get(key) ?? []
    arr.push(t)
    byMerchant.set(key, arr)
  }
  const recurring: { merchant: string; avg: number }[] = []
  for (const [, group] of byMerchant) {
    if (group.length < 3) continue
    const sorted = group
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    let monthlyHits = 0
    let gaps = 0
    for (let i = 1; i < sorted.length; i++) {
      const days = Math.round(
        (new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime()) /
          (1000 * 60 * 60 * 24)
      )
      gaps++
      if (days >= 28 && days <= 35) monthlyHits++
    }
    if (gaps === 0 || monthlyHits / gaps < 0.8) continue
    recurring.push({ merchant: group[0].merchant, avg: Math.round(sumCents(group) / group.length) })
  }
  if (recurring.length > 0) {
    const burn = recurring.reduce((s, r) => s + r.avg, 0)
    const names = recurring.map((r) => r.merchant)
    const top3 = names.slice(0, 3).join(', ')
    const extra = names.length > 3 ? ` + ${names.length - 3} more` : ''
    out.push({
      id: `recurring-${monthTag(now)}`,
      title: `Recurring monthly: ~${usd(burn)}`,
      body: `Detected ${recurring.length} recurring charges: ${top3}${extra}.`,
      severity: 'info',
      icon: 'subs',
      category: null,
      magnitude_cents: burn,
    })
  }

  // --- Rule 6: Outlier transaction (this month) ---
  const trailingByCat = new Map<TransactionCategory, Transaction[]>()
  for (const t of trailing) {
    const arr = trailingByCat.get(t.category) ?? []
    arr.push(t)
    trailingByCat.set(t.category, arr)
  }
  const medians = new Map<TransactionCategory, number>()
  for (const [c, group] of trailingByCat) {
    if (group.length < 5) continue
    const sorted = group.map((t) => t.amount_cents).sort((a, b) => a - b)
    medians.set(c, sorted[Math.floor(sorted.length / 2)])
  }
  let outlier: { tx: Transaction; multiple: number } | null = null
  for (const t of monthExpenses) {
    const median = medians.get(t.category)
    if (!median || median <= 0) continue
    const multiple = t.amount_cents / median
    if (multiple < 2.0) continue
    if (!outlier || t.amount_cents > outlier.tx.amount_cents) outlier = { tx: t, multiple }
  }
  if (outlier) {
    const { tx, multiple } = outlier
    const when = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
      new Date(tx.date)
    )
    out.push({
      id: `outlier-${tx.id}`,
      title: `Unusual ${catLabel(tx.category)} charge`,
      body: `${usd(tx.amount_cents)} at ${tx.merchant} on ${when} — ${multiple.toFixed(1)}× the typical amount.`,
      severity: tx.amount_cents >= 50000 ? 'warning' : 'info',
      icon: 'sparkle',
      category: tx.category,
      magnitude_cents: tx.amount_cents,
    })
  }

  // --- Rule 7: Daily trend (30 vs prior 30) ---
  const recent30Start = new Date(now)
  recent30Start.setDate(recent30Start.getDate() - 30)
  const prior30Start = new Date(now)
  prior30Start.setDate(prior30Start.getDate() - 60)
  const recent30 = sumCents(
    transactions.filter(
      (t) => t.kind === 'expense' && new Date(t.date).getTime() >= recent30Start.getTime()
    )
  )
  const prior30 = sumCents(
    transactions.filter((t) => {
      const ts = new Date(t.date).getTime()
      return t.kind === 'expense' && ts >= prior30Start.getTime() && ts < recent30Start.getTime()
    })
  )
  if (prior30 >= 10000) {
    const delta = (recent30 - prior30) / prior30
    if (Math.abs(delta) >= 0.2) {
      const pct = Math.round(Math.abs(delta) * 100)
      const up = delta > 0
      out.push({
        id: `trend30-${monthTag(now)}`,
        title: `Spending ${up ? 'up' : 'down'} ${pct}% over 30 days`,
        body: `${usd(recent30)} in the last 30 days vs ${usd(prior30)} the 30 before.`,
        severity: up ? 'warning' : 'positive',
        icon: up ? 'trend-up' : 'trend-down',
        category: null,
        magnitude_cents: Math.abs(recent30 - prior30),
      })
    }
  }

  // --- Rule 8: Mortgage affordability ---
  const firstMortgage = properties.find((p) => p.mortgage)?.mortgage
  if (firstMortgage && monthIncome > 0) {
    const payment = monthlyPaymentCents(
      firstMortgage.original_loan_cents,
      firstMortgage.annual_interest_rate_percent,
      firstMortgage.loan_term_years
    )
    if (payment > 0) {
      const ratio = payment / monthIncome
      const pct = Math.round(ratio * 100)
      const severity = ratio < 0.28 ? 'positive' : ratio <= 0.35 ? 'info' : 'warning'
      out.push({
        id: `mortgage-ratio-${monthTag(now)}`,
        title: `Mortgage at ${pct}% of income${ratio > 0.35 ? ' — high' : ''}`,
        body: `${usd(payment)} P&I vs ${usd(monthIncome)} income this month. Lenders typically target below 28%.`,
        severity,
        icon: 'house',
        category: null,
        magnitude_cents: payment,
      })
    }
  }

  // Sort by severity asc (critical first), tie-break magnitude desc.
  const order = { critical: 0, warning: 1, info: 2, positive: 3 }
  out.sort((a, b) => {
    if (order[a.severity] !== order[b.severity]) return order[a.severity] - order[b.severity]
    return b.magnitude_cents - a.magnitude_cents
  })
  return out.slice(0, limit)
}
