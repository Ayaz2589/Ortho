'use client'

import dynamic from 'next/dynamic'
import { House } from 'lucide-react'
import { useApp } from '@/lib/store'
import { mediumDate, monthYear, parseLocalDate } from '@/lib/format'
import {
  monthlyPaymentCents,
  currentPrincipalBalanceCents,
  currentEquityCents,
  equityFraction,
  maturityDate,
  yearsRemaining,
  upcomingAmortization,
  PAID_OFF_THRESHOLD_CENTS,
} from '@/lib/finance/mortgage'
import type { MortgageInfo } from '@/lib/types'

// Deferred so recharts leaves the Housing initial-load bundle (spec 022, US1). The
// amortization figures/legend stay eager; the bar chart streams in. The wrapping
// `h-[140px]` div reserves its height → no layout shift.
const AmortizationChart = dynamic(
  () => import('./charts/AmortizationChart').then((m) => m.AmortizationChart),
  { ssr: false, loading: () => null }
)

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
      {children}
    </div>
  )
}

function Label({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px] font-normal uppercase tracking-[0.6px] text-text-2">
        {children}
      </span>
      {right ? <span className="text-xs text-text-3">{right}</span> : null}
    </div>
  )
}

export function MortgagePaymentHero({ mortgage }: { mortgage: MortgageInfo }) {
  const { formatMoney, t } = useApp()
  const payment = monthlyPaymentCents(
    mortgage.original_loan_cents,
    mortgage.annual_interest_rate_percent,
    mortgage.loan_term_years
  )
  return (
    <Section>
      <div className="flex flex-col gap-1.5 p-5">
        <Label right={<House size={16} className="text-text-2" />}>{t('Monthly payment')}</Label>
        <div className="text-[36px] font-light tracking-[-0.6px] tabular-nums text-text">
          {formatMoney(payment)}
        </div>
        {mortgage.auto_pay_source ? (
          <p className="text-[13px] text-text-2">
            {t('Auto-pays on the 1st · {0}', mortgage.auto_pay_source)}
          </p>
        ) : null}
      </div>
    </Section>
  )
}

function DetailRow({
  label,
  sublabel,
  value,
}: {
  label: string
  sublabel: string
  value: string
}) {
  return (
    <div className="flex items-baseline justify-between px-4 py-3.5">
      <div className="flex flex-col gap-0.5">
        <span className="text-[15px] font-normal text-text">{label}</span>
        <span className="text-[12px] text-text-3">{sublabel}</span>
      </div>
      <span className="text-[17px] font-normal tabular-nums text-text">{value}</span>
    </div>
  )
}

export function MortgageDetails({ mortgage }: { mortgage: MortgageInfo }) {
  const { formatMoney, locale, t } = useApp()
  const balance = currentPrincipalBalanceCents(
    mortgage.original_loan_cents,
    mortgage.annual_interest_rate_percent,
    mortgage.loan_term_years,
    mortgage.closing_date
  )
  const maturity = maturityDate(mortgage.closing_date, mortgage.loan_term_years)
  const years = yearsRemaining(mortgage.closing_date, mortgage.loan_term_years)
  return (
    <Section>
      <div className="divide-y divide-hairline">
        <DetailRow
          label={t('Principal balance')}
          sublabel={t('Original loan · {0}', formatMoney(mortgage.original_loan_cents))}
          value={formatMoney(balance)}
        />
        <DetailRow
          label={t('Interest rate')}
          sublabel={t('Fixed · {0}-year', mortgage.loan_term_years)}
          value={`${mortgage.annual_interest_rate_percent.toFixed(2)}%`}
        />
        <DetailRow
          label={t('Maturity')}
          sublabel={t('{0} years remaining', years)}
          value={mediumDate(maturity, locale)}
        />
      </div>
    </Section>
  )
}

export function EquityProgress({ mortgage }: { mortgage: MortgageInfo }) {
  const { formatMoney, locale, t } = useApp()
  const rawBalance = currentPrincipalBalanceCents(
    mortgage.original_loan_cents,
    mortgage.annual_interest_rate_percent,
    mortgage.loan_term_years,
    mortgage.closing_date
  )
  // Clamp near-zero balance to 0 so floating-point rounding after the final
  // payment doesn't show a spurious sub-$5 debt.
  const balance = rawBalance <= PAID_OFF_THRESHOLD_CENTS ? 0 : rawBalance
  const principalPaidDown = mortgage.original_loan_cents - balance
  const fraction = balance === 0 ? 1 : equityFraction(
    mortgage.purchase_price_cents,
    mortgage.original_loan_cents,
    mortgage.annual_interest_rate_percent,
    mortgage.loan_term_years,
    mortgage.closing_date
  )
  return (
    <Section>
      <div className="flex flex-col gap-2.5 p-5">
        <Label>{t('Principal paid down')}</Label>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[28px] font-light tracking-[-0.4px] tabular-nums text-text">
            {formatMoney(principalPaidDown)}
          </span>
          <span className="shrink-0 text-[12px] text-text-3">
            {t('of {0} · {1}', formatMoney(mortgage.original_loan_cents), `${(fraction * 100).toFixed(1)}%`)}
          </span>
        </div>
        <div className="mt-0.5 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--chip-bg)' }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${fraction * 100}%`, background: 'var(--positive)' }}
          />
        </div>
        <p className="text-[13px] text-text-2">
          {t('Since closing · {0}', monthYear(parseLocalDate(mortgage.closing_date), locale))}
        </p>
      </div>
    </Section>
  )
}

export function Amortization({ mortgage }: { mortgage: MortgageInfo }) {
  const { locale, t } = useApp()
  const schedule = upcomingAmortization(
    12,
    mortgage.original_loan_cents,
    mortgage.annual_interest_rate_percent,
    mortgage.loan_term_years,
    mortgage.closing_date
  )
  const narrow = new Intl.DateTimeFormat(locale, { month: 'narrow' })
  const data = schedule.map((e) => ({
    label: narrow.format(e.month),
    principal: e.principalCents / 100,
    interest: e.interestCents / 100,
  }))

  return (
    <Section>
      <div className="flex flex-col gap-3 p-5">
        <Label right={t('Next 12 months')}>{t('Amortization')}</Label>
        <div className="h-[140px] w-full">
          <AmortizationChart data={data} />
        </div>
        <div className="flex items-center gap-4">
          <LegendDot color="var(--positive)" label={t('Principal')} />
          <LegendDot color="rgba(26,24,21,0.18)" label={t('Interest')} />
        </div>
      </div>
    </Section>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      <span className="text-[12px] text-text-2">{label}</span>
    </div>
  )
}

export { Section as HousingSection, Label as HousingLabel }
