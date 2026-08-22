'use client'

import { useMemo } from 'react'
import { useApp } from '@/lib/store'
import { useDashboardScopeContext } from '@/lib/widgets/DashboardScopeContext'
import { useMoneyScope, useScopedTransactions } from '@/lib/widgets/MoneyScopeContext'
import { rankCategories } from '@/lib/reports/categories'
import { categoryMeta } from '@/lib/categories'
import { startOfDay } from '@/lib/format'
import { usePanelCaption } from '@/components/widgets/WidgetPanel'
import { PanelEmpty, PanelSectionLabel, PanelRow } from '@/components/widgets/panels/kit'
import type { TransactionCategory } from '@/lib/types'

const DAY_MS = 24 * 60 * 60 * 1000

interface Mover {
  category: TransactionCategory
  deltaCents: number
}

/**
 * Spending-pace detail panel (spec 057, US4). The card shows one ±% against
 * the prior 30 days — one number hiding a dozen category movements in both
 * directions. The panel breaks the trailing window down by category, ranked
 * by amount; surfaces the biggest movers between the two windows; and shows
 * the full 60-day series `SpendingPaceBody` already buckets but only ever
 * displays the trailing half of (reused here rather than re-bucketed).
 *
 * Honours BOTH scope axes, mirroring the card's own anchor: the trailing 30
 * ends at the scope window's end, clamped to `now`.
 *
 * An increase reads no more alarmingly than a decrease (FR-021) — a bigger
 * mover is never framed as worse purely by colour: increases stay neutral
 * (`text-2`), decreases keep the card's existing "spending less" `positive`
 * tint. Neither is ever red.
 */
export function SpendingPacePanel() {
  const { transactions: allTransactions, formatMoney, t, resolveUser } = useApp()
  const scope = useMoneyScope()
  const transactions = useScopedTransactions(allTransactions)
  const { interval, now, periodLabel } = useDashboardScopeContext()

  const subject = scope.kind === 'person' ? resolveUser(scope.personId).name : t('Household')
  usePanelCaption({ subject, period: periodLabel })

  const anchorMs = Math.min(interval.end.getTime() - 1, now.getTime())

  const { dailyTotals, recentByCategory, priorByCategory } = useMemo(() => {
    const dailyTotals = new Array<number>(60).fill(0)
    const recentByCategory = new Map<TransactionCategory, number>()
    const priorByCategory = new Map<TransactionCategory, number>()
    const anchorStart = startOfDay(new Date(anchorMs)).getTime()
    const oldest = anchorStart - 59 * DAY_MS
    for (const tx of transactions) {
      if (tx.kind !== 'expense') continue
      const d = startOfDay(new Date(tx.date)).getTime()
      if (d < oldest || d > anchorStart) continue
      const idx = Math.round((d - oldest) / DAY_MS)
      if (idx < 0 || idx >= 60) continue
      dailyTotals[idx] += tx.amount_cents
      const bucket = idx < 30 ? priorByCategory : recentByCategory
      bucket.set(tx.category, (bucket.get(tx.category) ?? 0) + tx.amount_cents)
    }
    return { dailyTotals, recentByCategory, priorByCategory }
  }, [transactions, anchorMs])

  const recentRows = useMemo(
    () => rankCategories([...recentByCategory.entries()].map(([category, cents]) => ({ category, cents }))),
    [recentByCategory]
  )

  const movers = useMemo<Mover[]>(() => {
    const categories = new Set([...recentByCategory.keys(), ...priorByCategory.keys()])
    return [...categories]
      .map((category) => ({
        category,
        deltaCents: (recentByCategory.get(category) ?? 0) - (priorByCategory.get(category) ?? 0),
      }))
      .filter((m) => m.deltaCents !== 0)
      .sort((a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents))
  }, [recentByCategory, priorByCategory])

  const recentTotal = [...recentByCategory.values()].reduce((s, v) => s + v, 0)

  if (recentTotal <= 0) {
    return <PanelEmpty>{t('No expenses in the last 30 days.')}</PanelEmpty>
  }

  return (
    <div className="flex flex-col gap-6 p-5">
      <div className="flex flex-col gap-2">
        <PanelSectionLabel>{t('60-day trend')}</PanelSectionLabel>
        <div className="flex h-16 items-end gap-3">
          <div data-testid="trend-prior" className="flex h-full flex-1 items-end gap-[1px]" style={{ opacity: 0.45 }}>
            {dailyTotals.slice(0, 30).map((v, i) => (
              <TrendBar key={i} value={v} max={Math.max(...dailyTotals, 1)} />
            ))}
          </div>
          <div data-testid="trend-recent" className="flex h-full flex-1 items-end gap-[1px]" style={{ opacity: 1 }}>
            {dailyTotals.slice(30).map((v, i) => (
              <TrendBar key={i} value={v} max={Math.max(...dailyTotals, 1)} />
            ))}
          </div>
        </div>
        <div className="flex justify-between text-xs text-text-3">
          <span>{t('Prior 30 days')}</span>
          <span>{t('Last 30 days')}</span>
        </div>
      </div>

      {movers.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <PanelSectionLabel>{t('Biggest movers')}</PanelSectionLabel>
          {movers.map((m) => (
            <PanelRow
              key={m.category}
              label={t(categoryMeta(m.category).label)}
              value={formatMoney(m.deltaCents, { leadingPlus: true })}
              valueClassName={m.deltaCents > 0 ? 'tabular-nums text-text-2' : 'tabular-nums text-positive'}
            />
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <PanelSectionLabel>{t('Where it went')}</PanelSectionLabel>
        {recentRows.map((row) => (
          <PanelRow key={row.category} label={t(categoryMeta(row.category).label)} value={formatMoney(row.cents)} />
        ))}
      </div>
    </div>
  )
}

function TrendBar({ value, max }: { value: number; max: number }) {
  return (
    <div
      className="flex-1 rounded-[1px]"
      style={{ height: `${(value / max) * 100}%`, background: 'var(--positive)' }}
    />
  )
}
