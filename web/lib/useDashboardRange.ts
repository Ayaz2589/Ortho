'use client'

import { useEffect, useState } from 'react'
import { DASHBOARD_RANGES, type DashboardRange } from '@/components/dashboard/range'

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
