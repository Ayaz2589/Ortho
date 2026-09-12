'use client'

import type { ReactNode } from 'react'

/**
 * A single label/value line within a panel — a transaction composing a
 * budget's spend, a mortgage in a list, a merchant total. Which side reads as
 * prominent differs by panel (a mortgage's name is the headline, a
 * transaction's amount is), so both sides take a className override rather
 * than the kit guessing an emphasis. Extracted from HomeEquityPanel and
 * BudgetsPanel (spec 057, D10).
 *
 * Spec 058: the row is a flex line and flex items default to `min-width: auto`,
 * so neither side would shrink below its content — a long merchant name widened
 * the panel and made it pan sideways on a phone. The label now truncates and the
 * value holds its width. Containment is applied by the row itself, never folded
 * into the overridable defaults, so a caller passing its own emphasis classes
 * cannot silently drop it.
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
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className={`min-w-0 truncate ${labelClassName}`}>{label}</span>
      <span className={`shrink-0 ${valueClassName}`}>{value}</span>
    </div>
  )
}
