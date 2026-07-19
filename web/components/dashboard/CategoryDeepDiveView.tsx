'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import { MoreHorizontal } from 'lucide-react'
import { useApp } from '@/lib/store'
import { Card, SectionLabel } from '@/components/ui'
import { categoryMeta } from '@/lib/categories'
import type { RankedCategory } from '@/lib/reports/categories'
import type { TransactionCategory } from '@/lib/types'
import type { ReportsStatus } from '@/lib/useReportsData'

// Reuse the existing donut leaf (spec 022) — recharts stays behind next/dynamic.
const CategoryPie = dynamic(() => import('./charts/CategoryPie').then((m) => m.CategoryPie), {
  ssr: false,
  loading: () => null,
})

const MAX_ROWS = 6
const OTHER_COLOR = 'color-mix(in srgb, var(--text) 25%, transparent)'

interface LegendEntry {
  category: TransactionCategory | null // null = the "Other" bucket
  cents: number
  share: number
  color: string
  label: string
}

/** Percent with tabular figures (spec 027). */
function pct(share: number): string {
  return `${Math.round(share * 100)}%`
}

/**
 * Category deep-dive (spec 027, US2): total spend per category for the window as the
 * calm donut + a ranked legend (category · amount · share), highest first — the same
 * vocabulary as the dashboard's SpendByCategoryCard. Plainspoken loading/empty/error
 * states (no shimmer, no red); error offers Retry.
 */
export function CategoryDeepDiveView({
  status,
  categories,
  onRetry,
}: {
  status: ReportsStatus
  categories: RankedCategory[]
  onRetry: () => void
}) {
  const { formatMoney, t } = useApp()

  const legend: LegendEntry[] = useMemo(() => {
    const top = categories.slice(0, MAX_ROWS)
    const rest = categories.slice(MAX_ROWS)
    const out: LegendEntry[] = top.map((r) => ({
      category: r.category,
      cents: r.cents,
      share: r.share,
      color: categoryMeta(r.category).tint,
      label: t(categoryMeta(r.category).label),
    }))
    if (rest.length > 0) {
      const cents = rest.reduce((s, r) => s + r.cents, 0)
      const share = rest.reduce((s, r) => s + r.share, 0)
      out.push({ category: null, cents, share, color: OTHER_COLOR, label: t('Other') })
    }
    return out
  }, [categories, t])

  if (status === 'loading') {
    return (
      <Card className="p-5">
        <SectionLabel>{t('Spending by category')}</SectionLabel>
        <p className="py-5 text-[13px] text-text-3">{t('Loading…')}</p>
      </Card>
    )
  }

  if (status === 'error') {
    return (
      <Card className="p-5">
        <SectionLabel>{t('Spending by category')}</SectionLabel>
        <p className="py-3 text-[13px] text-text-2">{t('Couldn’t load reports.')}</p>
        <button
          type="button"
          onClick={onRetry}
          className="ortho-interactive rounded-lg px-3 py-2 text-sm font-normal text-accent"
        >
          {t('Try again')}
        </button>
      </Card>
    )
  }

  if (legend.length === 0) {
    return (
      <Card className="p-5">
        <SectionLabel>{t('Spending by category')}</SectionLabel>
        <p className="py-5 text-[13px] text-text-3">{t('No expenses in this period yet.')}</p>
      </Card>
    )
  }

  return (
    <Card className="p-5">
      <SectionLabel>{t('Spending by category')}</SectionLabel>

      <div className="mt-3 h-40 w-full">
        <CategoryPie data={legend} />
      </div>

      <div className="mt-2 flex flex-col">
        {legend.map((entry, idx) => {
          const Icon = entry.category ? categoryMeta(entry.category).icon : MoreHorizontal
          return (
            <div key={entry.category ?? 'other'}>
              {idx > 0 && <div className="h-px bg-hairline" />}
              <div className="flex items-center gap-3 py-2.5">
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                  style={{ background: entry.color }}
                >
                  <Icon size={14} color="#fff" />
                </div>
                <span className="text-[15px] font-normal text-text">{entry.label}</span>
                <span className="ml-auto text-[13px] font-normal tabular-nums text-text-3">
                  {pct(entry.share)}
                </span>
                <span className="w-20 text-right text-[15px] font-normal tabular-nums text-text">
                  {formatMoney(entry.cents)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
