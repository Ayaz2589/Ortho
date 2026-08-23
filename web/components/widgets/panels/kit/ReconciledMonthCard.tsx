'use client'

import type { ReactNode } from 'react'
import { useApp } from '@/lib/store'

/** Percent with a Unicode minus for shortfalls, never colour; "—" when the
 *  rate is undefined (no income that month). */
function formatRate(rate: number | null): string {
  if (rate === null) return '—'
  const pct = Math.round(rate * 100)
  return `${pct < 0 ? '−' : ''}${Math.abs(pct)}%`
}

/**
 * One month reconciled to its rate and the income/expense/saved terms behind
 * it, tagged with why it's here — best, leanest, most recent, selected, or
 * previous (spec 057 US5 redesign, D10 append). A negative rate uses `--text`,
 * never a warning colour (FR-021) — that is the only variation from the
 * positive case.
 */
export function ReconciledMonthCard({
  tag,
  label,
  rate,
  incomeCents,
  expenseCents,
  savedCents,
}: {
  tag: ReactNode
  label: ReactNode
  rate: number | null
  incomeCents: number
  expenseCents: number
  savedCents: number
}) {
  const { formatMoney, t } = useApp()
  const negative = rate !== null && rate < 0

  return (
    <div className="rounded-xl border-[0.5px] border-hairline bg-surface p-3">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.6px] text-text-3">{tag}</div>
          <div className="mt-0.5 text-[15px] font-semibold text-text" style={{ letterSpacing: '-0.2px' }}>
            {label}
          </div>
        </div>
        <div
          className="text-[22px] font-semibold tabular-nums"
          style={{ letterSpacing: '-0.5px', color: negative ? 'var(--text)' : 'var(--positive)' }}
        >
          {formatRate(rate)}
        </div>
      </div>
      <div className="mt-2.5 flex gap-[18px] border-t-[0.5px] border-hairline pt-2.5">
        <ReconColumn label={t('Income')} value={formatMoney(incomeCents)} />
        <ReconColumn label={t('Expenses')} value={formatMoney(expenseCents)} />
        <ReconColumn label={t('Amount saved')} value={formatMoney(savedCents)} />
      </div>
    </div>
  )
}

function ReconColumn({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-[3px]">
      <span className="text-[11px] text-text-3">{label}</span>
      <span className="text-[13.5px] font-semibold tabular-nums text-text" style={{ letterSpacing: '-0.2px' }}>
        {value}
      </span>
    </div>
  )
}
