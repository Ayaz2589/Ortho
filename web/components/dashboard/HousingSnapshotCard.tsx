'use client'

import { House, Building2, KeyRound, type LucideIcon } from 'lucide-react'
import { useApp } from '@/lib/store'
import { Card, SectionLabel } from '@/components/ui'
import { monthlyPaymentCents, currentEquityCents } from '@/lib/finance/mortgage'
import type { Property } from '@/lib/types'

function mortgagePayment(p: Property): number {
  const m = p.mortgage
  if (!m) return 0
  return monthlyPaymentCents(
    m.original_loan_cents,
    m.annual_interest_rate_percent,
    m.loan_term_years
  )
}

function equity(p: Property): number {
  const m = p.mortgage
  if (!m) return 0
  return currentEquityCents(
    m.purchase_price_cents,
    m.original_loan_cents,
    m.annual_interest_rate_percent,
    m.loan_term_years,
    m.closing_date
  )
}

function monthlyCost(p: Property): number {
  return mortgagePayment(p) + (p.lease?.monthly_rent_cents ?? 0)
}

function kindIcon(kind: Property['kind']): LucideIcon {
  switch (kind) {
    case 'primary_home':
      return House
    case 'multifamily':
      return Building2
    case 'rental':
      return KeyRound
  }
}

function propertyTitle(p: Property): string {
  return p.nickname ?? p.address
}

export function HousingSnapshotCard() {
  const { properties, formatMoney } = useApp()

  const totalMonthlyCost = properties.reduce((s, p) => s + monthlyCost(p), 0)
  const totalEquity = properties.reduce((s, p) => s + equity(p), 0)

  const multifamilies = properties.filter((p) => p.kind === 'multifamily')
  const netRentalIncome =
    multifamilies.length === 0
      ? null
      : multifamilies.reduce((acc, p) => {
          const income = (p.units ?? []).reduce(
            (s, u) => s + u.monthly_rent_cents,
            0
          )
          return acc + (income - mortgagePayment(p))
        }, 0)

  const count = properties.length
  const countLabel =
    count === 0 ? '' : `${count} ${count === 1 ? 'property' : 'properties'}`

  return (
    <Card className="p-5">
      <SectionLabel right={countLabel}>Housing</SectionLabel>

      {count === 0 ? (
        <p className="py-2 text-[13px] text-text-3">
          No properties yet. Add one from the Housing tab.
        </p>
      ) : count === 1 ? (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex gap-6">
            <StatColumn label="Monthly cost" value={formatMoney(totalMonthlyCost)} />
            <StatColumn
              label="Equity built"
              value={formatMoney(totalEquity)}
              tint="var(--positive)"
            />
          </div>
          {netRentalIncome != null && (
            <div className="mt-0.5 flex items-center justify-between">
              <span className="text-[13px] text-text-2">Net rental income</span>
              <span
                className="text-[13px] font-normal tabular-nums"
                style={{
                  // Loss/cost is never red (constitution); incoming stays sage-positive.
                  color: netRentalIncome >= 0 ? 'var(--positive)' : 'var(--text)',
                }}
              >
                {signed(netRentalIncome, formatMoney)}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-2 flex flex-col">
          {properties.map((p, idx) => {
            const Icon = kindIcon(p.kind)
            return (
              <div key={p.id}>
                {idx > 0 && <div className="h-px bg-hairline" />}
                <div className="flex items-center gap-3.5 py-2.5">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px]"
                    style={{ background: 'rgba(0,0,0,0.05)' }}
                  >
                    <Icon size={16} className="text-text-2" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-normal text-text">
                      {propertyTitle(p)}
                    </p>
                    <p className="truncate text-xs text-text-3">{subtitle(p, formatMoney)}</p>
                  </div>
                  <span className="text-[15px] font-normal tabular-nums text-text">
                    {formatMoney(headlineCost(p))}
                  </span>
                </div>
              </div>
            )
          })}
          <div className="mt-1 h-px bg-hairline" />
          <div className="mt-2.5 flex items-center gap-2">
            <span className="text-[13px] text-text-2">Total</span>
            <span className="ml-auto text-[13px] font-normal tabular-nums text-text">
              {formatMoney(totalMonthlyCost)} / mo
            </span>
            {totalEquity > 0 && (
              <>
                <span className="text-[13px] text-text-3">·</span>
                <span
                  className="text-[13px] font-normal tabular-nums"
                  style={{ color: 'var(--positive)' }}
                >
                  {formatMoney(totalEquity)} equity
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

function headlineCost(p: Property): number {
  if (p.mortgage) return mortgagePayment(p)
  if (p.lease) return p.lease.monthly_rent_cents
  return 0
}

function subtitle(p: Property, formatMoney: (c: number) => string): string {
  switch (p.kind) {
    case 'primary_home':
      return `Primary home · ${formatMoney(equity(p))} equity`
    case 'multifamily': {
      const n = (p.units ?? []).length
      return `Multifamily · ${n} unit${n === 1 ? '' : 's'} · ${formatMoney(equity(p))} equity`
    }
    case 'rental':
      return 'Rental'
  }
}

function signed(cents: number, formatMoney: (c: number) => string): string {
  const body = formatMoney(Math.abs(cents))
  if (cents > 0) return `+${body}`
  if (cents < 0) return `−${body}`
  return body
}

function StatColumn({
  label,
  value,
  tint,
}: {
  label: string
  value: string
  tint?: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-text-2">{label}</span>
      <span
        className="text-[22px] font-normal tracking-[-0.4px] tabular-nums"
        style={{ color: tint ?? 'var(--text)' }}
      >
        {value}
      </span>
    </div>
  )
}
