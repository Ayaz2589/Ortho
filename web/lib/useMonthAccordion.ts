'use client'

import { useMemo, useState } from 'react'
import { startOfMonth, type TxMonthGroup } from './format'

/** Number of line items (transactions) across a month bucket. */
function monthItemCount(m: TxMonthGroup): number {
  return m.days.reduce((n, d) => n + d.items.length, 0)
}

/**
 * Shared month-accordion state for the transactions list, used by both the
 * mobile page and the desktop composition (spec 023 FR-020 — was duplicated,
 * already drifting). Collapses every month by default except the primary one:
 * the current month, or — if it has no transactions — the most recent month
 * that does. The month directly before the primary one is ALSO left open unless
 * the primary month has filled out (>= 10 line items) — a sparse current month
 * on its own reads as an empty page, so we keep the prior month visible until
 * there's enough here to stand alone. Any active filter (`filterCount > 0`)
 * expands ALL months so matches aren't hidden inside a collapsed section.
 * `openMonths === null` means "untouched, follow the default"; once the user
 * toggles a month we track an explicit set so the default stops overriding
 * their choices.
 */
const COLLAPSE_PREV_THRESHOLD = 10

export function useMonthAccordion(months: TxMonthGroup[], filterCount: number) {
  const currentMonthKey = useMemo(() => startOfMonth(new Date()).getTime(), [])
  const defaultOpenKeys = useMemo(() => {
    if (months.length === 0) return new Set<number>()
    const currentIdx = months.findIndex((m) => m.month.getTime() === currentMonthKey)
    const primaryIdx = currentIdx >= 0 ? currentIdx : 0
    const keys = new Set<number>([months[primaryIdx].month.getTime()])
    // Keep the previous month expanded while the primary month is still sparse.
    const prev = months[primaryIdx + 1]
    if (prev && monthItemCount(months[primaryIdx]) < COLLAPSE_PREV_THRESHOLD) {
      keys.add(prev.month.getTime())
    }
    return keys
  }, [months, currentMonthKey])

  const [openMonths, setOpenMonths] = useState<Set<number> | null>(null)
  const isMonthOpen = (key: number) =>
    filterCount > 0 || (openMonths === null ? defaultOpenKeys.has(key) : openMonths.has(key))
  const toggleMonth = (key: number) =>
    setOpenMonths((prev) => {
      const base = prev ?? new Set(defaultOpenKeys)
      const next = new Set(base)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return { isMonthOpen, toggleMonth }
}
