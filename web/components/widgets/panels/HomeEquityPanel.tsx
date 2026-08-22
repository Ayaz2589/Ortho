'use client'

import { useMemo } from 'react'
import { useApp } from '@/lib/store'
import type { Property } from '@/lib/types'
import { housingSummary } from '@/lib/finance/housing-summary'
import {
  currentEquityCents,
  maturityDate,
  yearsRemaining,
  upcomingAmortization,
  type AmortizationEntry,
} from '@/lib/finance/mortgage'
import { monthYearLong } from '@/lib/format'
import { usePanelDetail } from '@/components/widgets/WidgetPanel'

/**
 * Home-equity detail panel (spec 057, US2 — the first reference panel).
 * Answers: "when will this be paid off, and how much of next month's payment
 * becomes equity rather than interest?" — the payoff date, the years
 * remaining, and the upcoming amortization schedule are all already computed
 * by `lib/finance/mortgage.ts` and unreachable from any UI today (SC-008).
 *
 * Ignores BOTH scope axes (D5): a property is a household asset, and a
 * mortgage schedule is not windowed to a month or a person — consistent with
 * `HomeEquityBody`, which reads neither context. No caption is declared.
 */

const SCHEDULE_MONTHS = 12

interface MortgageRow {
  propertyId: string
  label: string
  equityCents: number
  originalLoanCents: number
  annualRatePercent: number
  closingDate: string
  termYears: number
}

function mortgageLabel(property: Property): string {
  return property.nickname || property.address
}

export function HomeEquityPanel() {
  const { properties, formatMoney, t } = useApp()
  const { push } = usePanelDetail()

  const rows = useMemo<MortgageRow[]>(() => {
    return properties
      .filter((p): p is Property & { mortgage: NonNullable<Property['mortgage']> } => Boolean(p.mortgage))
      .map((p) => ({
        propertyId: p.id,
        label: mortgageLabel(p),
        equityCents: currentEquityCents(
          p.mortgage.purchase_price_cents,
          p.mortgage.original_loan_cents,
          p.mortgage.annual_interest_rate_percent,
          p.mortgage.loan_term_years,
          p.mortgage.closing_date
        ),
        originalLoanCents: p.mortgage.original_loan_cents,
        annualRatePercent: p.mortgage.annual_interest_rate_percent,
        closingDate: p.mortgage.closing_date,
        termYears: p.mortgage.loan_term_years,
      }))
  }, [properties])

  if (rows.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center text-[13px] text-text-3">
        {t('No mortgages yet.')}
      </div>
    )
  }

  if (rows.length === 1) {
    return <MortgageDetail row={rows[0]} />
  }

  const totalEquity = housingSummary(properties).equity

  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex flex-col gap-0.5">
        <span className="text-[24px] font-light leading-none tabular-nums" style={{ color: 'var(--positive)' }}>
          {formatMoney(totalEquity)}
        </span>
        <span className="text-xs text-text-2">{t('principal paid down, across all mortgages')}</span>
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.propertyId}>
            <button
              type="button"
              onClick={() => push(row.label, <MortgageDetail row={row} />)}
              className="flex w-full items-center justify-between rounded-xl p-3 text-left"
              style={{ background: 'var(--surface)' }}
            >
              <span className="text-sm text-text">{row.label}</span>
              <span className="text-sm tabular-nums text-text-2">{formatMoney(row.equityCents)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function MortgageDetail({ row }: { row: MortgageRow }) {
  const { formatMoney, t, locale } = useApp()

  const payoffLabel = monthYearLong(maturityDate(row.closingDate, row.termYears), locale)
  const years = yearsRemaining(row.closingDate, row.termYears)
  const schedule: AmortizationEntry[] = upcomingAmortization(
    SCHEDULE_MONTHS,
    row.originalLoanCents,
    row.annualRatePercent,
    row.termYears,
    row.closingDate
  )

  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex flex-col gap-0.5">
        <span className="text-[24px] font-light leading-none tabular-nums" style={{ color: 'var(--positive)' }}>
          {formatMoney(row.equityCents)}
        </span>
        <span className="text-xs text-text-2">{t('principal paid down')}</span>
      </div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-text">{payoffLabel}</span>
        <span className="tabular-nums text-text-2">{t('{0} years remaining', years)}</span>
      </div>
      <div className="flex flex-col gap-2.5">
        <span className="text-xs uppercase tracking-[0.4px] text-text-2">{t('Upcoming payments')}</span>
        {schedule.map((entry, idx) => (
          <div key={idx} className="flex items-baseline justify-between text-sm">
            <span className="text-text-2">{monthYearLong(entry.month, locale)}</span>
            <span className="tabular-nums text-text">
              {t('{0} principal', formatMoney(entry.principalCents))}
            </span>
            <span className="tabular-nums text-text-3">
              {t('{0} interest', formatMoney(entry.interestCents))}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
