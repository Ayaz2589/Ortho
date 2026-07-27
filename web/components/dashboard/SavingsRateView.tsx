'use client'

import dynamic from 'next/dynamic'
import { useApp } from '@/lib/store'
import { Card, SectionLabel } from '@/components/ui'
import type { SavingsRateRow } from '@/lib/reports/savings'
import type { ReportsStatus } from '@/lib/useReportsData'
import { ReportsSkeleton } from '@/components/skeletons/ReportsSkeleton'
import { readSkeletonCount } from '@/lib/skeletonCounts'

// Deferred so recharts leaves the Dashboard initial-load bundle (spec 022 pattern).
// The per-month money rows stay eager and paint immediately; the chart streams in.
const SavingsRateChart = dynamic(
  () => import('./charts/SavingsRateChart').then((m) => m.SavingsRateChart),
  { ssr: false, loading: () => null }
)

/** "May 2026" from a `'YYYY-MM'` key (timezone-stable — built from parts). */
function monthLong(yyyymm: string, locale: string): string {
  const [y, m] = yyyymm.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(
    new Date(y, m - 1, 1)
  )
}
function monthShort(yyyymm: string, locale: string): string {
  const [y, m] = yyyymm.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(y, m - 1, 1))
}

/** Percent with tabular figures; "—" when undefined; Unicode minus for negatives. */
function formatRate(rate: number | null): string {
  if (rate === null) return '—'
  const pct = Math.round(rate * 100)
  return `${pct < 0 ? '−' : ''}${Math.abs(pct)}%`
}

/**
 * Savings-rate over time (spec 027, US1). Per in-scope month: income, expense, and
 * the savings rate, above a calm bar time-series of the rate. Shortfalls read via
 * sign/position — never red. A zero-income month shows "—". Plainspoken
 * loading/empty/error states (no shimmer, no red); error offers Retry.
 */
export function SavingsRateView({
  status,
  rows,
  onRetry,
}: {
  status: ReportsStatus
  rows: SavingsRateRow[]
  onRetry: () => void
}) {
  const { formatMoney, locale, t } = useApp()

  if (status === 'loading') {
    return (
      <Card className="p-5">
        <SectionLabel>{t('Savings rate')}</SectionLabel>
        <ReportsSkeleton testId="skeleton-reports-savings" rows={readSkeletonCount('reportsSavings', 6)} />
      </Card>
    )
  }

  if (status === 'error') {
    return (
      <Card className="p-5">
        <SectionLabel>{t('Savings rate')}</SectionLabel>
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

  const hasActivity = rows.some((r) => r.incomeCents > 0 || r.expenseCents > 0)
  if (!hasActivity) {
    return (
      <Card className="p-5">
        <SectionLabel>{t('Savings rate')}</SectionLabel>
        <p className="py-5 text-[13px] text-text-3">
          {t('No income or spending in this period yet.')}
        </p>
      </Card>
    )
  }

  const chartData = rows
    .filter((r) => r.rate !== null)
    .map((r) => ({ label: monthShort(r.yyyymm, locale), rate: Math.round((r.rate as number) * 100) }))

  return (
    <Card className="p-5">
      <SectionLabel>{t('Savings rate')}</SectionLabel>

      {chartData.length > 0 && (
        <div className="mt-3 h-36 w-full">
          <SavingsRateChart data={chartData} />
        </div>
      )}

      <div className="mt-2 flex flex-col">
        {rows.map((r, i) => (
          <div key={r.yyyymm}>
            {i > 0 && <div className="h-px bg-hairline" />}
            <div className="flex items-center gap-3 py-2.5">
              <span className="text-[15px] font-normal text-text">{monthLong(r.yyyymm, locale)}</span>
              <span className="ml-auto text-[13px] font-normal tabular-nums text-positive">
                {formatMoney(r.incomeCents, { leadingPlus: true })}
              </span>
              <span className="text-[13px] font-normal tabular-nums text-text-2">
                {formatMoney(r.expenseCents)}
              </span>
              <span className="w-12 text-right text-[15px] font-normal tabular-nums text-text">
                {formatRate(r.rate)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
