import type { Transaction, Budget, Property, Insight, TransactionCategory, InsightSeverity } from '../types'
import { CATEGORIES } from '../categories'
import { monthlyPaymentCents } from './mortgage'
import { budgetStatusForMonth } from './budgets'
import { INSIGHT_THRESHOLDS as T } from './insights-thresholds'
import { HOUSEHOLD_SCOPE, scopeBudgets, scopeTransactions, type MoneyScope } from '../scope/moneyScope'
import { parseLocalDate } from '../format'

// Insights mirror the iOS InsightEngine. Money is rendered in USD with 2
// decimals here (the engine is currency-agnostic; display conversion happens
// elsewhere). Amounts are USD cents.

// Cache the formatter at module scope: `new Intl.NumberFormat` is one of the
// heaviest routine JS ops (see money.ts's currencyFormatter cache), and usd() is
// called a dozen-plus times per generateInsights run — several inside per-budget
// loops — always with these identical en-US/USD options. Output is unchanged.
const USD_FMT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function usd(cents: number): string {
  return USD_FMT.format(Math.abs(cents) / 100)
}

const monthTag = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

function monthInterval(d: Date): [Date, Date] {
  return [new Date(d.getFullYear(), d.getMonth(), 1), new Date(d.getFullYear(), d.getMonth() + 1, 1)]
}

function inInterval(date: string, start: Date, end: Date): boolean {
  // Date-only strings ("YYYY-MM-DD") parse as UTC midnight with `new Date()`,
  // but monthInterval() builds local-calendar [mStart, mEnd) boundaries. A
  // boundary-dated row (e.g. June 1 date-only) parses as UTC midnight, which
  // falls *before* local midnight June 1 for users west of UTC, silently
  // landing the row in the previous month. Parse date-only strings as local
  // midnight (same regime as monthInterval) to keep both sides consistent.
  const t = date.includes('T') ? new Date(date).getTime() : parseLocalDate(date).getTime()
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

/** Translation hook, mirroring iOS InsightEngine's `tr`. The default is an
 *  interpolating identity so the golden-vector generator (and any caller
 *  without a store) keeps producing the canonical English strings. */
export type InsightTranslate = (key: string, ...args: Array<string | number>) => string
const identityTr: InsightTranslate = (key, ...args) =>
  args.length ? key.replace(/\{(\d+)\}/g, (m, i) => String(args[Number(i)] ?? m)) : key

/**
 * Generate dashboard insights from household data. Returns up to `limit`
 * insights, sorted by severity then magnitude.
 */
export function generateInsights(
  transactions: Transaction[],
  budgets: Budget[],
  properties: Property[],
  now: Date = new Date(),
  limit: number = 6,
  tr: InsightTranslate = identityTr,
  // Display locale for the outlier date (iOS renders it via
  // Localizer.currentLocale). The default keeps the golden vectors and any
  // store-less caller on canonical en-US.
  locale: string = 'en-US',
  // spec 051/054 — whose money these observations are about. Household (the default) returns
  // both input arrays unchanged, so the golden vectors stay byte-identical.
  scope: MoneyScope = HOUSEHOLD_SCOPE
): Insight[] {
  transactions = scopeTransactions(transactions, scope)
  // Spec 054: the budget rules below must weigh a person's spend against a limit with the
  // same owner — a household allowance is never borrowed for one person (FR-003).
  budgets = scopeBudgets(budgets, scope)
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
      title: tr('{0} is your top category', tr(catLabel(topCat))),
      body: tr('{0} this month — {1}% of total spend.', usd(topVal), share),
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
    if (prior < T.momMinCents || current < T.momMinCents) continue
    const delta = (current - prior) / prior
    if (Math.abs(delta) < T.momDeltaFloor) continue
    const pct = Math.round(Math.abs(delta) * 100)
    const up = delta > 0
    out.push({
      id: `mom-${c}-${monthTag(now)}`,
      title: up ? tr('{0} up {1}% vs last month', tr(catLabel(c)), pct) : tr('{0} down {1}% vs last month', tr(catLabel(c)), pct),
      body: tr('{0} → {1}.', usd(prior), usd(current)),
      severity: up ? 'warning' : 'positive',
      icon: up ? 'up' : 'down',
      category: c,
      magnitude_cents: Math.abs(current - prior),
    })
  }

  // --- Rule 3: Budget status ---
  // Rollover-aware (spec 027): compare spend against the EFFECTIVE limit
  // (base + carried surplus/shortfall), so the insight can't contradict the
  // dashboard card. For `fixed` budgets the effective limit equals the base and
  // carriedIn is 0, so this is byte-identical to the pre-027 behavior.
  for (const b of budgets) {
    if (b.monthly_limit_cents <= 0) continue
    const status = budgetStatusForMonth(b, transactions, now)
    const limit = status.effectiveLimitCents
    const spent = status.spentCents
    if (limit <= 0) continue
    const fraction = spent / limit
    if (fraction >= T.budgetOverFraction) {
      const over = spent - limit
      out.push({
        id: `budget-over-${b.category}-${monthTag(now)}`,
        title: tr('Over budget on {0}', tr(catLabel(b.category))),
        body: tr("You're {0} over your {1} limit with {2} days left.", usd(over), usd(limit), daysLeft),
        severity: 'critical',
        icon: 'alert',
        category: b.category,
        magnitude_cents: over,
      })
    } else if (fraction >= T.budgetNearFraction) {
      const remaining = limit - spent
      out.push({
        id: `budget-near-${b.category}-${monthTag(now)}`,
        title: tr('Approaching {0} limit', tr(catLabel(b.category))),
        body: tr('{0} left of {1} with {2} days to go.', usd(remaining), usd(limit), daysLeft),
        severity: 'warning',
        icon: 'gauge',
        category: b.category,
        magnitude_cents: spent,
      })
    } else if (fraction <= T.budgetUnderFraction && monthProgress >= T.budgetUnderProgress) {
      const remaining = limit - spent
      out.push({
        id: `budget-under-${b.category}-${monthTag(now)}`,
        title: tr('Under budget on {0}', tr(catLabel(b.category))),
        body: tr('{0} of {1} still available with {2} days left.', usd(remaining), usd(limit), daysLeft),
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
        title: tr('Spending exceeds income'),
        body: tr("You're {0} over this month: {1} out vs {2} in.", usd(-net), usd(monthTotal), usd(monthIncome)),
        severity: 'critical',
        icon: 'minus',
        category: null,
        magnitude_cents: -net,
      })
    } else if (monthIncome > 0 && net / monthIncome >= T.savingsRateFloor) {
      const pct = Math.round((net / monthIncome) * 100)
      out.push({
        id: `cashflow-savings-${monthTag(now)}`,
        title: tr('Saving {0}% of income', pct),
        body: tr('Net {0} saved this month — well above the 20% benchmark.', usd(net)),
        severity: 'positive',
        icon: 'leaf',
        category: null,
        magnitude_cents: net,
      })
    }
  }

  // --- Rule 5: Recurring subscriptions (trailing 6 months) ---
  const sixMonthsAgo = new Date(now)
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - T.recurringWindowMonths)
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
    if (group.length < T.recurringMinCount) continue
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
      if (days >= T.recurringCadenceMinDays && days <= T.recurringCadenceMaxDays) monthlyHits++
    }
    if (gaps === 0 || monthlyHits / gaps < T.recurringHitRatio) continue
    // Truncate toward zero to match iOS `Int64` integer division (InsightEngine.swift).
    // Display casing comes from the merchant's MOST RECENT transaction (iOS-canonical).
    recurring.push({
      merchant: sorted[sorted.length - 1].merchant,
      avg: Math.trunc(sumCents(group) / group.length),
    })
  }
  // iOS-canonical preview order: highest monthly burn first; amount ties break
  // by case-insensitive name using plain code-unit comparison (NOT localeCompare
  // — the vectors need one deterministic order in every runtime and language).
  recurring.sort((a, b) => {
    if (b.avg !== a.avg) return b.avg - a.avg
    const an = a.merchant.toLowerCase()
    const bn = b.merchant.toLowerCase()
    return an < bn ? -1 : an > bn ? 1 : 0
  })
  if (recurring.length > 0) {
    const burn = recurring.reduce((s, r) => s + r.avg, 0)
    const names = recurring.map((r) => r.merchant)
    const top3 = names.slice(0, 3).join(', ')
    const extra = names.length > 3 ? ` ${tr('+ {0} more', names.length - 3)}` : ''
    out.push({
      id: `recurring-${monthTag(now)}`,
      title: tr('Recurring monthly: ~{0}', usd(burn)),
      body: `${tr('Detected {0} recurring charges', recurring.length)}: ${top3}${extra}.`,
      severity: 'info',
      icon: 'subs',
      category: null,
      magnitude_cents: burn,
      preview_merchants: names.slice(0, 3),
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
    if (group.length < T.outlierMedianMinCount) continue
    const sorted = group.map((t) => t.amount_cents).sort((a, b) => a - b)
    medians.set(c, sorted[Math.floor(sorted.length / 2)])
  }
  let outlier: { tx: Transaction; multiple: number } | null = null
  for (const t of monthExpenses) {
    const median = medians.get(t.category)
    if (!median || median <= 0) continue
    const multiple = t.amount_cents / median
    if (multiple < T.outlierMultiple) continue
    if (!outlier || t.amount_cents > outlier.tx.amount_cents) outlier = { tx: t, multiple }
  }
  if (outlier) {
    const { tx, multiple } = outlier
    const when = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(
      new Date(tx.date)
    )
    out.push({
      id: `outlier-${tx.id}`,
      title: tr('Unusual {0} charge', tr(catLabel(tx.category))),
      body: tr('{0} at {1} on {2} — {3} the typical amount.', usd(tx.amount_cents), tx.merchant, when, `${multiple.toFixed(1)}×`),
      severity: tx.amount_cents >= T.outlierWarnCents ? 'warning' : 'info',
      icon: 'sparkle',
      category: tx.category,
      magnitude_cents: tx.amount_cents,
    })
  }

  // --- Rule 7: Daily trend (30 vs prior 30) ---
  const recent30Start = new Date(now)
  recent30Start.setDate(recent30Start.getDate() - T.trendWindowDays)
  const prior30Start = new Date(now)
  prior30Start.setDate(prior30Start.getDate() - 2 * T.trendWindowDays)
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
  if (prior30 >= T.trendMinPriorCents) {
    const delta = (recent30 - prior30) / prior30
    if (Math.abs(delta) >= T.trendDeltaFloor) {
      const pct = Math.round(Math.abs(delta) * 100)
      const up = delta > 0
      out.push({
        id: `trend30-${monthTag(now)}`,
        title: up ? tr('Spending up {0}% over 30 days', pct) : tr('Spending down {0}% over 30 days', pct),
        body: tr('{0} in the last 30 days vs {1} the 30 before.', usd(recent30), usd(prior30)),
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
      const severity =
        ratio < T.mortgageComfortableRatio ? 'positive' : ratio <= T.mortgageHighRatio ? 'info' : 'warning'
      out.push({
        id: `mortgage-ratio-${monthTag(now)}`,
        title: ratio > T.mortgageHighRatio ? tr('Mortgage at {0}% of income — high', pct) : tr('Mortgage at {0}% of income', pct),
        body: tr('{0} P&I vs {1} income this month. Lenders typically target below 28%.', usd(payment), usd(monthIncome)),
        severity,
        icon: 'house',
        category: null,
        magnitude_cents: payment,
      })
    }
  }

  // Sort by severity asc (critical first), tie-break magnitude desc.
  out.sort(compareInsights)
  return out.slice(0, limit)
}

/** Severity ordering for the insight list: critical first, then warning, info,
 *  positive; ties broken by magnitude descending. Exported (spec 027) so the
 *  goal off-track insights (`lib/finance/goals.ts`) merge into the same ordering
 *  as the base rules in the dashboard consumers. Extracted verbatim from the
 *  former inline sort — no behavior change to `generateInsights`/`insights.json`. */
const SEVERITY_ORDER: Record<InsightSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  positive: 3,
}
export function compareInsights(a: Insight, b: Insight): number {
  if (SEVERITY_ORDER[a.severity] !== SEVERITY_ORDER[b.severity]) {
    return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  }
  return b.magnitude_cents - a.magnitude_cents
}
