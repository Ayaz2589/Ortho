'use client'

import { useApp } from '@/lib/store'
import { monthlyPaymentCents } from '@/lib/finance/mortgage'
import { netRentalCents, occupiedRentCents, rentUnitsFrom, isUnitOccupied } from '@/lib/finance/housing'
import type { Property, Unit } from '@/lib/types'
import { HousingSection, HousingLabel } from './MortgageCards'

function isVacant(u: Unit): boolean {
  // The explicit spec-020 flag first — the same resolution the money math
  // (rentUnitsFrom) uses, so label and Net balance can never contradict each
  // other on one screen (review 2026-08-24, B7). iOS drives its chip from
  // `occupied` too. Tenant-name inference remains only the legacy fallback.
  return !(u.occupied ?? isUnitOccupied(u.tenant_name))
}

export function UnitsCard({ property }: { property: Property }) {
  const { formatMoney, t } = useApp()
  const units = property.units ?? []
  return (
    <HousingSection>
      <div className="flex items-center justify-between px-4 pb-2.5 pt-4">
        <HousingLabel>{t('Units & tenants')}</HousingLabel>
        <span className="text-[12px] text-text-3">
          {units.length === 1 ? t('1 unit') : t('{0} units', units.length)}
        </span>
      </div>
      {units.length === 0 ? (
        <p className="px-4 pb-4 text-[13px] text-text-3">
          {t('No units yet — edit this property to add them.')}
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
                    {vacant ? t('Vacant') : unit.tenant_name ?? '—'}
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
  const { formatMoney, t } = useApp()
  const rentUnits = rentUnitsFrom(property.units ?? [])
  const income = occupiedRentCents(rentUnits)
  const mortgageCents = property.mortgage
    ? monthlyPaymentCents(
        property.mortgage.original_loan_cents,
        property.mortgage.annual_interest_rate_percent,
        property.mortgage.loan_term_years
      )
    : 0
  const net = netRentalCents(rentUnits, mortgageCents)

  const signed =
    net > 0
      ? `+${formatMoney(net)}`
      : net < 0
        ? `−${formatMoney(-net)}`
        : formatMoney(net)

  return (
    <HousingSection>
      <div className="flex flex-col gap-2.5 p-5">
        <HousingLabel>{t('Net balance')}</HousingLabel>
        <span
          className="text-[28px] font-light tracking-[-0.4px] tabular-nums"
          style={{ color: net >= 0 ? 'var(--positive)' : 'var(--text)' }}
        >
          {signed}
        </span>
        <div className="mt-1 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-text-2">{t('Rental income')}</span>
            <span className="text-[13px] font-normal tabular-nums text-text">
              {formatMoney(income)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-text-2">{t('Mortgage payment')}</span>
            <span className="text-[13px] font-normal tabular-nums text-text">
              −{formatMoney(mortgageCents)}
            </span>
          </div>
        </div>
      </div>
    </HousingSection>
  )
}
