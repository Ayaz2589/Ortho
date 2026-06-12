'use client'

import { useApp } from '@/lib/store'
import { monthlyPaymentCents } from '@/lib/finance/mortgage'
import type { Property, Unit } from '@/lib/types'
import { HousingSection, HousingLabel } from './MortgageCards'

function isVacant(u: Unit): boolean {
  return (u.tenant_name ?? '').trim() === ''
}

function occupiedMonthlyRentCents(units: Unit[]): number {
  return units.filter((u) => !isVacant(u)).reduce((sum, u) => sum + u.monthly_rent_cents, 0)
}

export function UnitsCard({ property }: { property: Property }) {
  const { formatMoney } = useApp()
  const units = property.units ?? []
  return (
    <HousingSection>
      <div className="flex items-center justify-between px-4 pb-2.5 pt-4">
        <HousingLabel>Units &amp; tenants</HousingLabel>
        <span className="text-[12px] text-text-3">
          {units.length} unit{units.length === 1 ? '' : 's'}
        </span>
      </div>
      {units.length === 0 ? (
        <p className="px-4 pb-4 text-[13px] text-text-3">
          No units yet — edit this property to add them.
        </p>
      ) : (
        <div className="divide-y divide-hairline pb-1">
          {units.map((unit) => {
            const vacant = isVacant(unit)
            return (
              <div key={unit.id} className="flex min-h-[56px] items-center gap-3 px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[15px] font-normal text-text">{unit.name}</span>
                  <span
                    className={
                      'text-[12px] ' + (vacant ? 'text-destructive' : 'text-text-3')
                    }
                  >
                    {vacant ? 'Vacant' : unit.tenant_name}
                  </span>
                </div>
                <span className="ml-auto text-[17px] font-normal tabular-nums text-text">
                  {formatMoney(unit.monthly_rent_cents)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </HousingSection>
  )
}

export function NetBalanceCard({ property }: { property: Property }) {
  const { formatMoney } = useApp()
  const income = occupiedMonthlyRentCents(property.units ?? [])
  const mortgageCents = property.mortgage
    ? monthlyPaymentCents(
        property.mortgage.original_loan_cents,
        property.mortgage.annual_interest_rate_percent,
        property.mortgage.loan_term_years
      )
    : 0
  const net = income - mortgageCents

  const signed =
    net > 0
      ? `+${formatMoney(net)}`
      : net < 0
        ? `−${formatMoney(-net)}`
        : formatMoney(net)

  return (
    <HousingSection>
      <div className="flex flex-col gap-2.5 p-5">
        <HousingLabel>Net balance</HousingLabel>
        <span
          className="text-[28px] font-light tracking-[-0.4px] tabular-nums"
          style={{ color: net >= 0 ? 'var(--positive)' : 'var(--destructive)' }}
        >
          {signed}
        </span>
        <div className="mt-1 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-text-2">Rental income</span>
            <span className="text-[13px] font-normal tabular-nums text-text">
              {formatMoney(income)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-text-2">Mortgage payment</span>
            <span className="text-[13px] font-normal tabular-nums text-text">
              −{formatMoney(mortgageCents)}
            </span>
          </div>
        </div>
      </div>
    </HousingSection>
  )
}
