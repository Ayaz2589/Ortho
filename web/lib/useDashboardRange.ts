'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '@/lib/store'
import { monthBounds } from '@/lib/transactionFilters'
import { monthYearLong } from '@/lib/format'
import {
  DASHBOARD_RANGES,
  availableMonths,
  availableRanges,
  longLabel,
  monthReferenceDate,
  monthInsightReference,
  rangeInterval,
  type DashboardRange,
  type Interval,
} from '@/components/dashboard/range'

const KEY = 'dashboardRange'

/** Read the persisted dashboard range, or null if none/invalid. */
export function readStoredRange(): DashboardRange | null {
  if (typeof localStorage === 'undefined') return null
  const v = localStorage.getItem(KEY)
  return v && (DASHBOARD_RANGES as string[]).includes(v) ? (v as DashboardRange) : null
}

/**
 * Dashboard range state that remembers the user's last choice across launches
 * (localStorage `dashboardRange`). Starts at the default and adopts the stored
 * value after mount — so server and first client render agree (no hydration
 * mismatch). Shared by the mobile and desktop dashboards, which keeps them in
 * sync across the responsive breakpoint.
 */
export function useDashboardRange(): [DashboardRange, (r: DashboardRange) => void] {
  const [range, setRangeState] = useState<DashboardRange>('thisMonth')

  useEffect(() => {
    const stored = readStoredRange()
    if (stored) setRangeState(stored)
  }, [])

  const setRange = (r: DashboardRange) => {
    setRangeState(r)
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, r)
  }

  return [range, setRange]
}

/** A `'YYYY-MM'` selected month → the dashboard `Interval`, via the shared,
 *  golden-vectored `monthBounds` (UTC, half-open). */
export function monthBoundsInterval(yyyymm: string): Interval {
  const b = monthBounds(yyyymm)
  return { start: new Date(b.dateFrom), end: new Date(b.dateTo) }
}

/** Human label for a `'YYYY-MM'`, e.g. "June 2026" (timezone-stable). */
export function monthLabel(yyyymm: string, locale = 'en-US'): string {
  return monthYearLong(monthReferenceDate(yyyymm), locale)
}

export interface DashboardScope {
  now: Date
  /** Active relative range (clamped to what the data spans). */
  range: DashboardRange
  /** Relative ranges the data spans, for the segmented picker. */
  rangeOptions: DashboardRange[]
  /** Choose a relative range. Clears any selected month (mutual exclusivity). */
  setRange: (r: DashboardRange) => void
  /** The selected specific month (`'YYYY-MM'`), or null when on the relative range. */
  selectedMonth: string | null
  /** Distinct months the data spans, newest-first. */
  availableMonths: string[]
  /** Select a specific month (transient — not persisted). */
  setMonth: (m: string) => void
  /** Return to the relative range. */
  clearMonth: () => void
  /** The active window: the selected month, else the relative range. */
  interval: Interval
  /** Reference date for the budget/insight engines (mid selected month, else now). */
  referenceDate: Date
  /** "June 2026" when a month is selected, else the range's long label. */
  periodLabel: string
  /** True when a specific month is selected. */
  isSpecificMonth: boolean
}

/**
 * Single source of the dashboard's time scope, shared by the mobile and desktop
 * layouts so they cannot drift. The relative `range` persists exactly as before;
 * a chosen `selectedMonth` is a TRANSIENT override (not persisted) that resolves
 * to the shared, vectored `monthBounds` window and feeds the same cards. The two
 * are mutually exclusive: choosing a range clears the month, choosing a month
 * overrides the range.
 */
export function useDashboardScope(): DashboardScope {
  const { transactions, locale } = useApp()
  // `now` is state, not a mount-time memo: a session left open across midnight
  // (normal for an installed app) would otherwise keep yesterday's "This month"
  // window and a stale "Day X of Y" until a full re-mount (review 2026-08-24).
  // Refreshed below when the app returns to the foreground on a NEW local
  // calendar day — same-day returns keep the reference stable so nothing
  // downstream recomputes.
  const [now, setNow] = useState(() => new Date())
  const [range, setRangeState] = useState<DashboardRange>('thisMonth')
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)

  // Adopt the persisted range after mount (avoids a hydration mismatch).
  useEffect(() => {
    const stored = readStoredRange()
    if (stored) setRangeState(stored)
  }, [])

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'hidden') return
      const d = new Date()
      setNow((prev) =>
        prev.getFullYear() === d.getFullYear() && prev.getMonth() === d.getMonth() && prev.getDate() === d.getDate()
          ? prev
          : d
      )
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  const ranges = useMemo(() => availableRanges(transactions, now), [transactions, now])
  const months = useMemo(() => availableMonths(transactions), [transactions])
  const activeRange: DashboardRange = ranges.includes(range) ? range : ranges[0] ?? 'thisMonth'
  const rangeOptions = useMemo(() => DASHBOARD_RANGES.filter((r) => ranges.includes(r)), [ranges])

  // A selected month that the data no longer spans falls back to the relative range.
  const effectiveMonth = selectedMonth && months.includes(selectedMonth) ? selectedMonth : null

  const setRange = useCallback((r: DashboardRange) => {
    setSelectedMonth(null)
    setRangeState(r)
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, r)
  }, [])
  const setMonth = useCallback((m: string) => setSelectedMonth(m), [])
  const clearMonth = useCallback(() => setSelectedMonth(null), [])

  const interval = useMemo<Interval>(
    () => (effectiveMonth ? monthBoundsInterval(effectiveMonth) : rangeInterval(activeRange, now)),
    [effectiveMonth, activeRange, now]
  )
  const referenceDate = useMemo<Date>(
    () => (effectiveMonth ? monthInsightReference(effectiveMonth, now) : now),
    [effectiveMonth, now]
  )
  const periodLabel = effectiveMonth ? monthLabel(effectiveMonth, locale) : longLabel(activeRange)

  return {
    now,
    range: activeRange,
    rangeOptions,
    setRange,
    selectedMonth: effectiveMonth,
    availableMonths: months,
    setMonth,
    clearMonth,
    interval,
    referenceDate,
    periodLabel,
    isSpecificMonth: effectiveMonth != null,
  }
}
