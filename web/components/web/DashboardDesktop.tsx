'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useApp } from '@/lib/store'
import { categoryMeta, paletteFor } from '@/lib/categories'
import { generateInsights } from '@/lib/finance/insights'
import {
  monthlyPaymentCents,
  currentEquityCents,
} from '@/lib/finance/mortgage'
import {
  availableRanges,
  rangeInterval,
  DASHBOARD_RANGES,
  type DashboardRange,
} from '@/components/dashboard/range'
import type { Transaction, TransactionCategory } from '@/lib/types'
import { WebPageHeader, Seg, CardLabel, CatTile } from './kit'

function ShareBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 6, borderRadius: 6, background: 'var(--surface-2)', overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: color }} />
    </div>
  )
}

function Sparkline({ points, height = 64 }: { points: number[]; height?: number }) {
  const max = Math.max(1, ...points)
  const step = points.length > 1 ? 100 / (points.length - 1) : 100
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(2)},${(height - (p / max) * (height - 6) - 2).toFixed(2)}`)
    .join(' ')
  return (
    <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <line x1="0" y1={height - 0.5} x2="100" y2={height - 0.5} stroke="var(--hairline)" strokeWidth="1" />
      <path d={path} fill="none" stroke="var(--text-2)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}

const inRange = (iso: string, s: Date, e: Date) => {
  const t = new Date(iso).getTime()
  return t >= s.getTime() && t < e.getTime()
}

export function DashboardDesktop() {
  const {
    transactions,
    properties,
    budgets,
    householdMembers,
    formatMoney,
    spentBy,
    currentUserId,
  } = useApp()
  const now = useMemo(() => new Date(), [])
  const ranges = useMemo(() => availableRanges(transactions, now), [transactions, now])
  const [range, setRange] = useState<DashboardRange>('thisMonth')
  const activeRange = ranges.includes(range) ? range : ranges[0] ?? 'thisMonth'
  const interval = useMemo(() => rangeInterval(activeRange, now), [activeRange, now])

  const rangeOptions = DASHBOARD_RANGES.filter((r) => ranges.includes(r)).map((r) => ({
    value: r,
    label: r === 'thisMonth' ? 'Month' : r === 'last3Months' ? '3M' : r === 'last6Months' ? '6M' : '1Y',
  }))

  const expenses = useMemo(
    () => transactions.filter((t) => t.kind === 'expense' && inRange(t.date, interval.start, interval.end)),
    [transactions, interval]
  )
  const income = transactions
    .filter((t) => t.kind === 'income' && inRange(t.date, interval.start, interval.end))
    .reduce((s, t) => s + t.amount_cents, 0)
  const expenseTotalC = expenses.reduce((s, t) => s + t.amount_cents, 0)
  const net = income - expenseTotalC

  // Spend by category (top 6)
  const catTotals = useMemo(() => {
    const m = new Map<TransactionCategory, number>()
    for (const t of expenses) m.set(t.category, (m.get(t.category) ?? 0) + t.amount_cents)
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [expenses])
  const catMax = Math.max(1, ...catTotals.map(([, v]) => v))

  // Per owner (capped: totals + share bar + top merchants line)
  const owners = useMemo(() => {
    return householdMembers
      .map((u) => {
        const amount = spentBy(u.id, interval.start, interval.end)
        const merch = new Map<string, number>()
        for (const t of expenses) {
          if (t.owner_ids.includes(u.id)) merch.set(t.merchant, (merch.get(t.merchant) ?? 0) + t.amount_cents)
        }
        const top = [...merch.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m]) => m).join(' · ')
        return { user: u, amount, top }
      })
      .filter((o) => o.amount > 0)
      .sort((a, b) => b.amount - a.amount)
  }, [householdMembers, expenses, interval, spentBy])
  const ownerTotal = Math.max(1, owners.reduce((s, o) => s + o.amount, 0))

  // Top merchants (top 5)
  const merchants = useMemo(() => {
    const m = new Map<string, { cents: number; count: number }>()
    for (const t of expenses) {
      const e = m.get(t.merchant) ?? { cents: 0, count: 0 }
      e.cents += t.amount_cents
      e.count += 1
      m.set(t.merchant, e)
    }
    return [...m.entries()].sort((a, b) => b[1].cents - a[1].cents).slice(0, 5)
  }, [expenses])

  // Daily trend (30 vs prior 30)
  const trend = useMemo(() => {
    const day = 24 * 60 * 60 * 1000
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)
    const buckets = new Array(60).fill(0)
    for (const t of transactions) {
      if (t.kind !== 'expense') continue
      const d = new Date(t.date)
      d.setHours(0, 0, 0, 0)
      const idx = 59 - Math.round((today.getTime() - d.getTime()) / day)
      if (idx >= 0 && idx < 60) buckets[idx] += t.amount_cents
    }
    const recent = buckets.slice(30)
    const prior = buckets.slice(0, 30)
    const recentSum = recent.reduce((s, v) => s + v, 0)
    const priorSum = prior.reduce((s, v) => s + v, 0)
    const avg = Math.round(recentSum / 30)
    const delta = priorSum > 0 ? Math.round(((recentSum - priorSum) / priorSum) * 100) : null
    return { recent, avg, delta }
  }, [transactions, now])

  // Housing summary
  const housing = useMemo(() => {
    let cost = 0
    let equity = 0
    let netRental = 0
    let multi = false
    for (const p of properties) {
      const m = p.mortgage
      if (m) {
        const pay = monthlyPaymentCents(m.original_loan_cents, m.annual_interest_rate_percent, m.loan_term_years)
        cost += pay
        equity += currentEquityCents(m.purchase_price_cents, m.original_loan_cents, m.annual_interest_rate_percent, m.loan_term_years, m.closing_date)
        if (p.kind === 'multifamily') {
          multi = true
          const rent = (p.units ?? []).reduce((s, u) => s + u.monthly_rent_cents, 0)
          netRental += rent - pay
        }
      }
      if (p.lease) cost += p.lease.monthly_rent_cents
    }
    return { cost, equity, netRental, multi, count: properties.length }
  }, [properties])

  const insights = useMemo(
    () => generateInsights(transactions, budgets, properties, now, 2),
    [transactions, budgets, properties, now]
  )

  const rangeLabel =
    activeRange === 'thisMonth' ? 'This month' : activeRange === 'last3Months' ? 'Last 3 months' : activeRange === 'last6Months' ? 'Last 6 months' : 'Last 12 months'

  return (
    <div className="ow-page-inner" style={{ maxWidth: 1080, paddingTop: 0, paddingBottom: 0 }}>
      <WebPageHeader
        title="Dashboard"
        actions={rangeOptions.length > 1 ? <Seg size="sm" value={activeRange} onChange={setRange} options={rangeOptions} /> : undefined}
      />

      <div className="ow-grid">
        {/* Net summary */}
        <div className="ow-card ow-s7" style={{ padding: 24 }}>
          <CardLabel>{rangeLabel}</CardLabel>
          <div style={{ fontSize: 36, fontWeight: 300, letterSpacing: '-0.7px', fontVariantNumeric: 'tabular-nums', lineHeight: 1.05, color: net >= 0 ? 'var(--positive)' : 'var(--text)' }}>
            {formatMoney(net, { leadingPlus: net > 0 })}
          </div>
          <div style={{ display: 'flex', gap: 36, marginTop: 18 }}>
            <div>
              <div className="ow-cap">Income</div>
              <div style={{ fontSize: 17, fontWeight: 400, fontVariantNumeric: 'tabular-nums', color: 'var(--positive)', letterSpacing: '-0.3px' }}>
                {formatMoney(income, { leadingPlus: income > 0 })}
              </div>
            </div>
            <div>
              <div className="ow-cap">Expenses</div>
              <div style={{ fontSize: 17, fontWeight: 400, fontVariantNumeric: 'tabular-nums', color: 'var(--text)', letterSpacing: '-0.3px' }}>
                {formatMoney(expenseTotalC)}
              </div>
            </div>
          </div>
        </div>

        {/* Housing summary */}
        <div className="ow-card ow-s5" style={{ padding: 24, display: 'flex', flexDirection: 'column' }}>
          <CardLabel hint={`${housing.count} ${housing.count === 1 ? 'property' : 'properties'}`}>Housing</CardLabel>
          {housing.count === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>No properties yet. Add one from the Housing tab.</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 36 }}>
                <div>
                  <div className="ow-cap">Monthly cost</div>
                  <div style={{ fontSize: 22, fontWeight: 400, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.4px' }}>{formatMoney(housing.cost)}</div>
                </div>
                <div>
                  <div className="ow-cap">Equity built</div>
                  <div style={{ fontSize: 22, fontWeight: 400, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.4px' }}>{formatMoney(housing.equity)}</div>
                </div>
              </div>
              {housing.multi && (
                <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '0.5px solid var(--hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Net rental income</span>
                  <span style={{ fontSize: 15, fontWeight: 400, fontVariantNumeric: 'tabular-nums', color: housing.netRental >= 0 ? 'var(--positive)' : 'var(--text)' }}>
                    {formatMoney(housing.netRental, { leadingPlus: housing.netRental > 0 })}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Insights — quiet rows */}
        {insights.length > 0 && (
          <div className="ow-card ow-s12">
            {insights.map((ins, i) => (
              <div key={ins.id} className="ow-insight-row" style={i === 0 ? undefined : { borderTop: '0.5px solid var(--hairline)' }}>
                <div className="ow-insight-tile" style={{ background: ins.category ? categoryMeta(ins.category).tint : 'var(--cat-income)' }}>
                  {ins.category ? (
                    (() => {
                      const Icon = categoryMeta(ins.category).icon
                      return <Icon size={14} color="#fff" />
                    })()
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2 4l4 5 2.5-3L12 10.5" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 400 }}>{ins.title}.</span>{' '}
                  <span style={{ color: 'var(--text-2)' }}>{ins.body}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Spend by category */}
        <div className="ow-card ow-s6" style={{ padding: 24 }}>
          <CardLabel hint="Share of spend">Spend by category</CardLabel>
          {catTotals.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>No expenses in this period yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {catTotals.map(([cat, amt]) => (
                <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <CatTile category={cat} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                      <span style={{ fontSize: 14, fontWeight: 400, letterSpacing: '-0.1px' }}>{categoryMeta(cat).label}</span>
                      <span style={{ fontSize: 14, fontWeight: 400, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.2px' }}>{formatMoney(amt)}</span>
                    </div>
                    <ShareBar pct={(amt / catMax) * 100} color={categoryMeta(cat).tint} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Per owner — capped */}
        <div className="ow-card ow-s6" style={{ padding: 24, display: 'flex', flexDirection: 'column' }}>
          <CardLabel hint="Share of spend">Per owner</CardLabel>
          {owners.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>No household spending yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {owners.map((o) => {
                const pal = paletteFor(o.user.color_key)
                return (
                  <div key={o.user.id} style={{ display: 'flex', gap: 12 }}>
                    <div className="flex shrink-0 items-center justify-center rounded-full" style={{ width: 32, height: 32, background: pal.bg, color: pal.fg, fontWeight: 400, fontSize: 14 }}>
                      {o.user.initial}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                        <span style={{ fontSize: 14, fontWeight: 400, letterSpacing: '-0.1px' }}>
                          {o.user.id === currentUserId ? `${o.user.name} (you)` : o.user.name}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 400, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.2px' }}>{formatMoney(o.amount)}</span>
                      </div>
                      <ShareBar pct={(o.amount / ownerTotal) * 100} color={pal.bg} />
                      {o.top && (
                        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 5, letterSpacing: '-0.1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.top}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div style={{ marginTop: 'auto', paddingTop: 16 }}>
            <Link href="/transactions" className="ow-quiet-link">
              See all activity →
            </Link>
          </div>
        </div>

        {/* Top merchants */}
        <div className="ow-card ow-s6" style={{ padding: '12px 0' }}>
          <CardLabel hint={rangeLabel} style={{ padding: '12px 24px 0', marginBottom: 6 }}>Top merchants</CardLabel>
          {merchants.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '0 24px 12px' }}>No expenses in this period yet.</div>
          ) : (
            merchants.map(([name, info], i) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 24px', borderTop: i === 0 ? 'none' : '0.5px solid var(--hairline)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 400, letterSpacing: '-0.1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{info.count} {info.count === 1 ? 'visit' : 'visits'}</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 400, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.2px' }}>{formatMoney(info.cents)}</div>
              </div>
            ))
          )}
        </div>

        {/* Daily trend */}
        <div className="ow-card ow-s6" style={{ padding: 24, display: 'flex', flexDirection: 'column' }}>
          <CardLabel hint="Last 30 days">Daily spend</CardLabel>
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end' }}>
            <div style={{ width: '100%' }}>
              <Sparkline points={trend.recent.map((c) => c / 100)} height={64} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 16 }}>
            <div>
              <div className="ow-cap">Avg / day</div>
              <div style={{ fontSize: 17, fontWeight: 400, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.3px' }}>{formatMoney(trend.avg)}</div>
            </div>
            {trend.delta !== null && (
              <div style={{ textAlign: 'right' }}>
                <div className="ow-cap">vs. prior 30</div>
                <div style={{ fontSize: 17, fontWeight: 400, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.3px', color: 'var(--text-2)' }}>
                  {trend.delta >= 0 ? '+' : '−'}{Math.abs(trend.delta)}%
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
