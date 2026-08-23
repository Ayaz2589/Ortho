'use client'

import type { ReactNode } from 'react'

/**
 * A single label/value line within a panel — a transaction composing a
 * budget's spend, a mortgage in a list, a merchant total. Which side reads as
 * prominent differs by panel (a mortgage's name is the headline, a
 * transaction's amount is), so both sides take a className override rather
 * than the kit guessing an emphasis. Extracted from HomeEquityPanel and
 * BudgetsPanel (spec 057, D10).
 */
export function PanelRow({
  label,
  value,
  labelClassName = 'text-text-2',
  valueClassName = 'tabular-nums text-text',
}: {
  label: ReactNode
  value: ReactNode
  labelClassName?: string
  valueClassName?: string
}) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className={labelClassName}>{label}</span>
      <span className={valueClassName}>{value}</span>
    </div>
  )
}
