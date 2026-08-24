'use client'

import { useMemo } from 'react'
import { useApp } from '@/lib/store'
import type { Property } from '@/lib/types'
import { housingSummary } from '@/lib/finance/housing-summary'
import {
  currentPrincipalBalanceCents,
  maturityDate,
  yearsRemaining,
  upcomingAmortization,
  PAID_OFF_THRESHOLD_CENTS,
  type AmortizationEntry,
} from '@/lib/finance/mortgage'
import { monthYearLong } from '@/lib/format'
import { usePanelDetail } from '@/components/widgets/WidgetPanel'
import { PanelEmpty, PanelSectionLabel, PanelRow } from '@/components/widgets/panels/kit'

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
  /** Loan-basis balance, paid-off-clamped — the schedule truncates against it. */
  balanceCents: number
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
      .map((p) => {
        // Loan basis with the paid-off clamp — the SAME figure housingSummary
        // computes for the card this panel opens from. The old purchase-price
        // basis silently included the down payment under a "principal paid
        // down" label and made multi-mortgage rows disagree with their own
        // total (review 2026-08-24, B4).
        const rawBalance = currentPrincipalBalanceCents(
          p.mortgage.original_loan_cents,
          p.mortgage.annual_interest_rate_percent,
          p.mortgage.loan_term_years,
          p.mortgage.closing_date
        )
        const balanceCents = rawBalance <= PAID_OFF_THRESHOLD_CENTS ? 0 : rawBalance
        return {
          propertyId: p.id,
          label: mortgageLabel(p),
          equityCents: p.mortgage.original_loan_cents - balanceCents,
          balanceCents,
          originalLoanCents: p.mortgage.original_loan_cents,
          annualRatePercent: p.mortgage.annual_interest_rate_percent,
          closingDate: p.mortgage.closing_date,
          termYears: p.mortgage.loan_term_years,
        }
      })
  }, [properties])

  if (rows.length === 0) {
    return <PanelEmpty>{t('No mortgages yet.')}</PanelEmpty>
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
              className="w-full rounded-xl p-3 text-left"
              style={{ background: 'var(--surface)' }}
            >
              <PanelRow
                label={row.label}
                value={formatMoney(row.equityCents)}
                labelClassName="text-text"
                valueClassName="tabular-nums text-text-2"
              />
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
  const fullSchedule: AmortizationEntry[] = upcomingAmortization(
    SCHEDULE_MONTHS,
    row.originalLoanCents,
    row.annualRatePercent,
    row.termYears,
    row.closingDate
  )
  // upcomingAmortization deliberately mirrors Swift with no early break — past
  // payoff every entry is a phantom full payment. Truncate at payoff and clamp
  // the final principal to what actually remains (review 2026-08-24).
  const schedule: AmortizationEntry[] = []
  let remaining = row.balanceCents
  for (const entry of fullSchedule) {
    if (remaining <= 0) break
    const principalCents = Math.min(entry.principalCents, remaining)
    schedule.push({ ...entry, principalCents })
    remaining -= principalCents
  }

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
        <PanelSectionLabel>{t('Upcoming payments')}</PanelSectionLabel>
        {schedule.length === 0 ? (
          <span className="text-sm text-text-2">{t('Paid off')}</span>
        ) : null}
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
