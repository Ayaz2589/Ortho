'use client'

import { useMemo, useState } from 'react'
import { startOfMonth, type TxMonthGroup } from './format'

/**
 * Shared month-accordion state for the transactions list, used by both the
 * mobile page and the desktop composition (spec 023 FR-020 — was duplicated,
 * already drifting). Collapses every month by default except one: the current
 * month, or — if it has no transactions — the most recent month that does. Any
 * active filter (`filterCount > 0`) expands ALL months so matches aren't hidden
 * inside a collapsed section. `openMonths === null` means "untouched, follow the
 * default"; once the user toggles a month we track an explicit set so the default
 * stops overriding their choices.
 */
export function useMonthAccordion(months: TxMonthGroup[], filterCount: number) {
  const currentMonthKey = useMemo(() => startOfMonth(new Date()).getTime(), [])
  const defaultOpenKey = useMemo(() => {
    if (months.some((m) => m.month.getTime() === currentMonthKey)) return currentMonthKey
    return months[0]?.month.getTime() ?? null
  }, [months, currentMonthKey])

  const [openMonths, setOpenMonths] = useState<Set<number> | null>(null)
  const isMonthOpen = (key: number) =>
    filterCount > 0 || (openMonths === null ? key === defaultOpenKey : openMonths.has(key))
  const toggleMonth = (key: number) =>
    setOpenMonths((prev) => {
      const base = prev ?? (defaultOpenKey !== null ? new Set([defaultOpenKey]) : new Set<number>())
      const next = new Set(base)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return { isMonthOpen, toggleMonth }
}
