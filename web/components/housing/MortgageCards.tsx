'use client'

import { House } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  ResponsiveContainer,
} from 'recharts'
import { useApp } from '@/lib/store'
import { mediumDate, monthYear } from '@/lib/format'
import {
  monthlyPaymentCents,
  currentPrincipalBalanceCents,
  currentEquityCents,
  equityFraction,
  maturityDate,
  yearsRemaining,
  upcomingAmortization,
} from '@/lib/finance/mortgage'
import type { MortgageInfo } from '@/lib/types'

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
      <span className="text-[13px] font-semibold uppercase tracking-[0.6px] text-text-2">
        {children}
      </span>
      {right ? <span className="text-xs text-text-3">{right}</span> : null}
    </div>
  )
}

export function MortgagePaymentHero({ mortgage }: { mortgage: MortgageInfo }) {
  const { formatMoney } = useApp()
  const payment = monthlyPaymentCents(
    mortgage.original_loan_cents,
    mortgage.annual_interest_rate_percent,
    mortgage.loan_term_years
  )
  return (
    <Section>
      <div className="flex flex-col gap-1.5 p-5">
        <Label right={<House size={16} className="text-text-2" />}>Monthly payment</Label>
        <div className="text-[36px] font-bold tracking-[-0.6px] tabular-nums text-text">
          {formatMoney(payment)}
        </div>
        {mortgage.auto_pay_source ? (
          <p className="text-[13px] text-text-2">
            Auto-pays on the 1st · {mortgage.auto_pay_source}
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
        <span className="text-[15px] font-medium text-text">{label}</span>
        <span className="text-[12px] text-text-3">{sublabel}</span>
      </div>
      <span className="text-[17px] font-semibold tabular-nums text-text">{value}</span>
    </div>
  )
}

export function MortgageDetails({ mortgage }: { mortgage: MortgageInfo }) {
  const { formatMoney, locale } = useApp()
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
          label="Principal balance"
          sublabel={`Original loan · ${formatMoney(mortgage.original_loan_cents)}`}
          value={formatMoney(balance)}
        />
        <DetailRow
          label="Interest rate"
          sublabel={`Fixed · ${mortgage.loan_term_years}-year`}
          value={`${mortgage.annual_interest_rate_percent.toFixed(2)}%`}
        />
        <DetailRow
          label="Maturity"
          sublabel={`${years} years remaining`}
          value={mediumDate(maturity, locale)}
        />
      </div>
    </Section>
  )
}

export function EquityProgress({ mortgage }: { mortgage: MortgageInfo }) {
  const { formatMoney, locale } = useApp()
  const equity = currentEquityCents(
    mortgage.purchase_price_cents,
    mortgage.original_loan_cents,
    mortgage.annual_interest_rate_percent,
    mortgage.loan_term_years,
    mortgage.closing_date
  )
  const fraction = equityFraction(
    mortgage.purchase_price_cents,
    mortgage.original_loan_cents,
    mortgage.annual_interest_rate_percent,
    mortgage.loan_term_years,
    mortgage.closing_date
  )
  return (
    <Section>
      <div className="flex flex-col gap-2.5 p-5">
        <Label>Equity</Label>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[28px] font-bold tracking-[-0.4px] tabular-nums text-text">
            {formatMoney(equity)}
          </span>
          <span className="shrink-0 text-[12px] text-text-3">
            of {formatMoney(mortgage.purchase_price_cents)} · {(fraction * 100).toFixed(1)}%
          </span>
        </div>
        <div className="mt-0.5 h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(0,0,0,0.05)' }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${fraction * 100}%`, background: 'var(--positive)' }}
          />
        </div>
        <p className="text-[13px] text-text-2">
          Built since closing · {monthYear(new Date(mortgage.closing_date), locale)}
        </p>
      </div>
    </Section>
  )
}

export function Amortization({ mortgage }: { mortgage: MortgageInfo }) {
  const { locale } = useApp()
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
        <Label right="Next 12 months">Amortization</Label>
        <div className="h-[140px] w-full">
          <ResponsiveContainer width="100%" height={140} minWidth={0}>
            <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="20%">
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: 'var(--text-3)' }}
                interval={0}
              />
              <Bar dataKey="principal" stackId="a" fill="var(--positive)" />
              <Bar dataKey="interest" stackId="a" fill="rgba(26,24,21,0.18)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-4">
          <LegendDot color="var(--positive)" label="Principal" />
          <LegendDot color="rgba(26,24,21,0.18)" label="Interest" />
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
