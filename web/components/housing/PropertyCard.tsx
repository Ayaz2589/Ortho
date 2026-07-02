'use client'

import { ChevronRight } from 'lucide-react'
import { useApp } from '@/lib/store'
import { monthlyPaymentCents } from '@/lib/finance/mortgage'
import type { Property } from '@/lib/types'
import { kindMeta, propertyTitle } from './kinds'

/** Compact row shown on the Housing list in multi-property mode. */
export function PropertyCard({
  property,
  onClick,
  selected = false,
}: {
  property: Property
  onClick: () => void
  selected?: boolean
}) {
  const { formatMoney, t } = useApp()
  const meta = kindMeta(property.kind)
  const Icon = meta.icon

  const subtitle =
    property.kind === 'primary_home'
      ? t('Primary home')
      : property.kind === 'multifamily'
        ? t('Multifamily · {0} units', (property.units ?? []).length)
        : t('Rental')

  const isMortgaged = property.kind === 'primary_home' || property.kind === 'multifamily'
  const amount = isMortgaged
    ? property.mortgage
      ? monthlyPaymentCents(
          property.mortgage.original_loan_cents,
          property.mortgage.annual_interest_rate_percent,
          property.mortgage.loan_term_years
        )
      : 0
    : (property.lease?.monthly_rent_cents ?? 0)
  const caption = isMortgaged ? t('Monthly payment') : t('Monthly rent')

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? 'true' : undefined}
      className="ortho-interactive flex w-full items-center gap-3.5 rounded-2xl bg-surface px-4 py-3.5 text-left"
      style={{
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
        ...(selected ? { background: 'color-mix(in srgb, var(--accent) 12%, transparent)' } : {}),
      }}
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-text-2"
        style={{ background: 'rgba(0,0,0,0.05)' }}
      >
        <Icon size={19} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[17px] font-normal text-text">
          {propertyTitle(property)}
        </span>
        <span className="truncate text-[13px] text-text-2">{subtitle}</span>
      </span>
      <span className="ml-auto flex shrink-0 flex-col items-end gap-0.5">
        <span className="text-[17px] font-normal tabular-nums text-text">
          {formatMoney(amount)}
        </span>
        <span className="text-[12px] text-text-3">{caption}</span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-text-3" />
    </button>
  )
}
