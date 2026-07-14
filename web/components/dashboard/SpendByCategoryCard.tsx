'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { ChevronDown, MoreHorizontal } from 'lucide-react'
import { useApp } from '@/lib/store'

// Deferred so recharts leaves the Dashboard initial-load bundle (spec 022, US1).
// The card's legend rows (the money figures) stay eager and paint immediately; the
// donut streams in. The wrapping `h-40` div reserves its height → no layout shift.
const CategoryPie = dynamic(() => import('./charts/CategoryPie').then((m) => m.CategoryPie), {
  ssr: false,
  loading: () => null,
})
import { Card, SectionLabel } from '@/components/ui'
import { categoryMeta } from '@/lib/categories'
import { shortDate } from '@/lib/format'
import type { Transaction, TransactionCategory } from '@/lib/types'
import { longLabel, type DashboardRange, type Interval } from './range'

const MAX_ROWS = 25
const OTHER_COLOR = 'color-mix(in srgb, var(--text) 25%, transparent)'

interface LegendEntry {
  /** null = the "Other" bucket aggregating non-top categories. */
  category: TransactionCategory | null
  cents: number
  color: string
  label: string
}

export function SpendByCategoryCard({
  range,
  interval,
  label,
}: {
  range: DashboardRange
  interval: Interval
  label?: string
}) {
  const { transactions, formatMoney, ownersDisplay, locale, t } = useApp()
  const [expanded, setExpanded] = useState<TransactionCategory | null>(null)

  const inRange = (date: string) => {
    const t = new Date(date).getTime()
    return t >= interval.start.getTime() && t < interval.end.getTime()
  }

  // All categories with non-zero spend in the interval, sorted descending.
  const entries = useMemo(() => {
    const totals = new Map<TransactionCategory, number>()
    for (const t of transactions) {
      if (t.kind !== 'expense' || !inRange(t.date)) continue
      totals.set(t.category, (totals.get(t.category) ?? 0) + t.amount_cents)
    }
    return [...totals.entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([category, cents]) => ({ category, cents }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, interval.start, interval.end])

  const legend: LegendEntry[] = useMemo(() => {
    const top = entries.slice(0, 5)
    const rest = entries.slice(5)
    const out: LegendEntry[] = top.map(({ category, cents }) => ({
      category,
      cents,
      color: categoryMeta(category).tint,
      label: t(categoryMeta(category).label),
    }))
    const otherTotal = rest.reduce((s, e) => s + e.cents, 0)
    if (otherTotal > 0) {
      out.push({ category: null, cents: otherTotal, color: OTHER_COLOR, label: t('Other') })
    }
    return out
  }, [entries, t])

  return (
    <Card className="p-5">
      <SectionLabel right={label ?? t(longLabel(range))}>{t('Spend by category')}</SectionLabel>

      {entries.length === 0 ? (
        <p className="py-5 text-[13px] text-text-3">{t('No expenses in this period yet.')}</p>
      ) : (
        <>
          <div className="mt-3 h-40 w-full">
            <CategoryPie data={legend} />
          </div>

          <div className="mt-2 flex flex-col">
            {legend.map((entry, idx) => {
              const expandable = entry.category != null
              const isOpen = expandable && expanded === entry.category
              return (
                <div key={entry.category ?? 'other'}>
                  {idx > 0 && <div className="h-px bg-hairline" />}
                  <button
                    type="button"
                    disabled={!expandable}
                    onClick={() =>
                      expandable &&
                      setExpanded(isOpen ? null : (entry.category as TransactionCategory))
                    }
                    className="flex w-full items-center gap-3 py-2.5 text-left disabled:cursor-default"
                  >
                    <LegendIcon entry={entry} />
                    <span className="text-[15px] font-normal text-text">{entry.label}</span>
                    <span className="ml-auto text-[15px] font-normal tabular-nums text-text">
                      {formatMoney(entry.cents)}
                    </span>
                    {expandable && (
                      <ChevronDown
                        size={14}
                        className="text-text-3 transition-transform"
                        style={{ transform: isOpen ? 'rotate(180deg)' : undefined }}
                      />
                    )}
                  </button>
                  {isOpen && entry.category && (
                    <ExpandedTransactions
                      category={entry.category}
                      transactions={transactions}
                      inRange={inRange}
                      formatMoney={formatMoney}
                      ownersDisplay={ownersDisplay}
                      locale={locale}
                      t={t}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </Card>
  )
}

function LegendIcon({ entry }: { entry: LegendEntry }) {
  const Icon = entry.category ? categoryMeta(entry.category).icon : MoreHorizontal
  return (
    <div
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
      style={{ background: entry.color }}
    >
      <Icon size={14} color="#fff" />
    </div>
  )
}

function ExpandedTransactions({
  category,
  transactions,
  inRange,
  formatMoney,
  ownersDisplay,
  locale,
  t,
}: {
  category: TransactionCategory
  transactions: Transaction[]
  inRange: (date: string) => boolean
  formatMoney: (cents: number) => string
  ownersDisplay: (tx: Transaction) => { label: string }
  locale: string
  t: (key: string, ...args: Array<string | number>) => string
}) {
  // transactions are newest-first from the store.
  const all = transactions.filter(
    (t) => t.kind === 'expense' && t.category === category && inRange(t.date)
  )
  const shown = all.slice(0, MAX_ROWS)
  const remaining = Math.max(0, all.length - shown.length)

  if (all.length === 0) {
    return (
      <p className="py-2 pl-10 text-[13px] text-text-3">{t('No transactions in this period.')}</p>
    )
  }

  return (
    <div className="pb-2 pl-10">
      {shown.map((tx, i) => (
        <div key={tx.id}>
          {i > 0 && <div className="h-px bg-hairline" />}
          <div className="flex items-center gap-2.5 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-normal text-text">{tx.merchant}</p>
              <p className="text-[11px] text-text-3">
                {shortDate(new Date(tx.date), locale)} · {ownersDisplay(tx).label}
              </p>
            </div>
            <span className="text-sm font-normal tabular-nums text-text">
              {formatMoney(tx.amount_cents)}
            </span>
          </div>
        </div>
      ))}
      {remaining > 0 && (
        <p className="pt-2.5 text-center text-xs text-text-3">{t('+ {0} more', remaining)}</p>
      )}
    </div>
  )
}