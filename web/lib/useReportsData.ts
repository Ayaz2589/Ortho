'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchCategoryTotals, fetchMonthSummary } from '@/lib/api/aggregates'
import type { Interval } from '@/components/dashboard/range'
import { monthsInInterval } from '@/lib/reports/months'
import { buildSavingsSeries, type SavingsRateRow } from '@/lib/reports/savings'
import { rankCategories, type RankedCategory } from '@/lib/reports/categories'
import { writeSkeletonCount } from '@/lib/skeletonCounts'

export type ReportsStatus = 'loading' | 'ready' | 'error'

export interface ReportsData {
  status: ReportsStatus
  savings: SavingsRateRow[]
  categories: RankedCategory[]
  /** Re-issue the fetch (used by the error state's Retry). */
  retry: () => void
}

/**
 * On-demand reports data (spec 027). When Reports is open, fetches the household's
 * category totals for the whole window plus one month-summary per calendar month in
 * the window, in parallel, then derives the ranked categories and the savings-rate
 * series. Re-runs when the interval changes; `retry()` re-issues after a failure.
 *
 * This is the first product consumer of the aggregate RPC wrappers in
 * `lib/api/aggregates.ts` — the documented cut-over case (a new surface over a
 * user-chosen window the client does not already hold pre-summarized), not the
 * per-widget wiring spec 023 D15 declined. A rejected fetch resolves to `error`
 * (never throws), so an error here is contained and never breaks the Overview.
 */
export function useReportsData(householdId: string, interval: Interval): ReportsData {
  const [status, setStatus] = useState<ReportsStatus>('loading')
  const [savings, setSavings] = useState<SavingsRateRow[]>([])
  const [categories, setCategories] = useState<RankedCategory[]>([])
  const [nonce, setNonce] = useState(0)

  const startMs = interval.start.getTime()
  const endMs = interval.end.getTime()
  const windows = useMemo(() => monthsInInterval(interval), [startMs, endMs]) // eslint-disable-line react-hooks/exhaustive-deps

  const retry = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!householdId) return
    let cancelled = false
    setStatus('loading')
    ;(async () => {
      try {
        const [totals, summaries] = await Promise.all([
          fetchCategoryTotals(householdId, interval.start, interval.end),
          Promise.all(windows.map((w) => fetchMonthSummary(householdId, w.start, w.end))),
        ])
        if (cancelled) return
        const savingsSeries = buildSavingsSeries(windows, summaries)
        const ranked = rankCategories(totals)
        setSavings(savingsSeries)
        setCategories(ranked)
        setStatus('ready')
        // spec 032: remember the row counts so the NEXT Reports open renders a
        // correctly-sized skeleton. Best-effort — never throws. The category view
        // only ever DISPLAYS up to 6 ranked rows + one "Other" bucket
        // (CategoryDeepDiveView MAX_ROWS), so record the displayed cap — not the
        // full ranked length — or the skeleton would be far taller than the content.
        writeSkeletonCount('reportsSavings', savingsSeries.length)
        writeSkeletonCount('reportsCategories', Math.min(ranked.length, 7))
      } catch {
        if (cancelled) return
        setStatus('error')
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, startMs, endMs, windows, nonce])

  return { status, savings, categories, retry }
}
