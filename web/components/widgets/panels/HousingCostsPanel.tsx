'use client'

import { useMemo } from 'react'
import { useApp } from '@/lib/store'
import { useDashboardScopeContext } from '@/lib/widgets/DashboardScopeContext'
import { usePanelCaption, usePanelRouteOut } from '@/components/widgets/WidgetPanel'
import { PanelEmpty, PanelSectionLabel, PanelRow } from '@/components/widgets/panels/kit'
import { monthlyPaymentCents } from '@/lib/finance/mortgage'
import { monthYearLong } from '@/lib/format'
import { netRentalCents, rentUnitsFrom } from '@/lib/finance/housing'
import { housingSummary } from '@/lib/finance/housing-summary'
import { currentMonthKey, incomeForMonth } from '@/lib/planning/planSummary'
import type { Property } from '@/lib/types'

/**
 * Housing-costs detail panel (spec 057, US8). Answers which property makes
 * up the card's single monthly total, and — the genuinely new idea — what
 * share of the household's income that total represents.
 *
 * Ignores BOTH scope axes for the housing figures themselves: a property is
 * a household asset, point-in-time, exactly like HomeEquityPanel and
 * HousingCostsBody. The income-share figure is inherently tied to a month,
 * so the caption states the period only — no subject is ever declared, since
 * the people axis is never honoured here (D5, C-1).
 */

interface PropertyRow {
  id: string
  label: string
  costCents: number
  multi: boolean
  occupiedUnits: number
  totalUnits: number
  netRentalCents: number
}

function propertyLabel(p: Property): string {
  return p.nickname || p.address
}

function buildRow(p: Property): PropertyRow {
  const m = p.mortgage
  const paymentCents = m
    ? monthlyPaymentCents(m.original_loan_cents, m.annual_interest_rate_percent, m.loan_term_years)
    : 0
  const leaseCents = p.lease ? p.lease.monthly_rent_cents : 0
  const units = p.units ?? []
  const multi = p.kind === 'multifamily'
  return {
    id: p.id,
    label: propertyLabel(p),
    costCents: paymentCents + leaseCents,
    multi,
    occupiedUnits: rentUnitsFrom(units).filter((u) => u.occupied).length,
    totalUnits: units.length,
    netRentalCents: multi ? netRentalCents(rentUnitsFrom(units), paymentCents) : 0,
  }
}

export function HousingCostsPanel() {
  const { properties, transactions, formatMoney, t, locale } = useApp()
  const { referenceDate } = useDashboardScopeContext()

  // The panel measures exactly ONE month (the month of referenceDate) — the
  // caption and the income sentence must name that month, never a relative
  // range label ("Housing is 24% of Last 6 months income." was a false money
  // statement — review 2026-08-24, B6). For a selected month the two coincide.
  const measuredMonthLabel = monthYearLong(referenceDate, locale)
  usePanelCaption({ period: measuredMonthLabel })
  usePanelRouteOut({ label: t('See all properties'), href: '/housing' })

  const rows = useMemo(() => properties.map(buildRow), [properties])

  const incomeSharePercent = useMemo(() => {
    const monthKey = currentMonthKey(referenceDate)
    const incomeCents = incomeForMonth(transactions, monthKey)
    if (incomeCents <= 0) return null
    const totalCostCents = housingSummary(properties).cost
    return Math.round((totalCostCents / incomeCents) * 100)
  }, [transactions, referenceDate, properties])

  if (rows.length === 0) {
    return <PanelEmpty>{t('No properties yet.')}</PanelEmpty>
  }

  return (
    <div className="flex flex-col gap-6 p-5">
      <div className="flex flex-col gap-3">
        <PanelSectionLabel>{t('Properties')}</PanelSectionLabel>
        {rows.map((row) => (
          <div key={row.id} className="flex flex-col gap-1">
            <PanelRow
              label={row.label}
              value={formatMoney(row.costCents)}
              labelClassName="text-text"
              valueClassName="tabular-nums text-text-2"
            />
            {row.multi ? (
              <div className="flex flex-col gap-0.5 pl-1">
                <span className="text-xs text-text-3">
                  {t('{0} of {1} units occupied', row.occupiedUnits, row.totalUnits)}
                </span>
                <PanelRow label={t('Net rental')} value={formatMoney(row.netRentalCents, { leadingPlus: true })} />
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {incomeSharePercent != null ? (
        <div className="flex flex-col gap-1">
          <PanelSectionLabel>{t('Share of income')}</PanelSectionLabel>
          <p className="text-sm text-text-2">
            {t('Housing is {0}% of {1} income.', incomeSharePercent, measuredMonthLabel)}
          </p>
        </div>
      ) : null}
    </div>
  )
}
