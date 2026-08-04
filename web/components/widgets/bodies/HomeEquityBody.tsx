'use client'

import { useMemo } from 'react'
import { useApp } from '@/lib/store'
import { housingSummary } from '@/lib/finance/housing-summary'

/**
 * Home-equity widget body (spec 036 US2). Total principal paid down across all
 * mortgages (from the pure `housingSummary()` roll-up) with a progress bar toward the
 * total original loan. The denominator is summed locally from
 * `properties[].mortgage.original_loan_cents` — a raw, un-capped read, not duplicated
 * math. Note `equity` from the summary IS subject to the paid-off capping
 * (`PAID_OFF_THRESHOLD_CENTS`), so a fully-paid mortgage reaches the full original loan
 * and reads 100%. Reads PROPLESS from `useApp()`; equity is a positive, motivating
 * number shown in sage, never red.
 */
export function HomeEquityBody() {
  const { properties, formatMoney, t } = useApp()

  const { equity, loanOriginal, fraction } = useMemo(() => {
    const s = housingSummary(properties)
    const loanOriginal = properties.reduce(
      (sum, p) => sum + (p.mortgage?.original_loan_cents ?? 0),
      0
    )
    const fraction = loanOriginal > 0 ? Math.min(1, Math.max(0, s.equity / loanOriginal)) : 0
    return { equity: s.equity, loanOriginal, fraction }
  }, [properties])

  if (loanOriginal === 0) {
    return (
      <div className="flex h-full flex-col">
        <p className="flex flex-1 items-center text-[13px] text-text-3">
          {t('No mortgages yet.')}
        </p>
      </div>
    )
  }

  // Round for the caption, but never claim "100%" until the loan is truly paid off —
  // otherwise 99.6% would read as done.
  const pct = fraction >= 1 ? 100 : Math.min(99, Math.round(fraction * 100))

  return (
    <div className="flex h-full flex-col">
      <span
        className="text-[28px] font-light leading-none tabular-nums"
        style={{ color: 'var(--positive)' }}
      >
        {formatMoney(equity)}
      </span>
      <span className="mt-1 text-xs text-text-2">{t('principal paid down')}</span>
      <div className="mt-auto flex flex-col gap-1.5">
        <div
          className="h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: 'var(--chip-bg)' }}
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${fraction * 100}%`, background: 'var(--positive)' }}
          />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-2">{t('{0}% paid off', pct)}</span>
          <span className="tabular-nums text-text-3">{t('of {0}', formatMoney(loanOriginal))}</span>
        </div>
      </div>
    </div>
  )
}
