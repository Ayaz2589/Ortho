'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useApp } from '@/lib/store'
import { monthLabel } from '@/lib/useDashboardRange'
import { currentMonthKey, stepMonthKey } from '@/lib/planning/planSummary'

/**
 * Planning month stepper (spec 038 — US1). A prev/next month control plus a "This
 * month" reset. It scopes the hub to the current or a PAST month only — the app has
 * no recurring/scheduled income, so a future month has no income data and a
 * "Left to plan" figure there would just be a negative artifact (fabricating an
 * income forecast is the deferred, out-of-scope work). "Next" is therefore disabled
 * at the current month.
 */
export function PlanningMonthBar({
  monthKey,
  now,
  onChange,
}: {
  monthKey: string
  now: Date
  onChange: (monthKey: string) => void
}) {
  const { locale, t } = useApp()
  const isCurrent = monthKey === currentMonthKey(now)

  return (
    <div className="mb-6 flex items-center gap-1">
      <button
        type="button"
        aria-label={t('Previous month')}
        onClick={() => onChange(stepMonthKey(monthKey, 'prev'))}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-text-2 transition-colors hover:bg-[var(--chip-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <ChevronLeft size={18} />
      </button>

      <span className="min-w-[132px] px-2 text-center text-sm font-normal tabular-nums text-text">
        {monthLabel(monthKey, locale)}
      </span>

      <button
        type="button"
        aria-label={t('Next month')}
        disabled={isCurrent}
        onClick={() => onChange(stepMonthKey(monthKey, 'next'))}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-text-2 transition-colors hover:bg-[var(--chip-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:pointer-events-none disabled:text-text-3 disabled:opacity-40"
      >
        <ChevronRight size={18} />
      </button>

      {!isCurrent && (
        <button
          type="button"
          onClick={() => onChange(currentMonthKey(now))}
          className="ml-1 rounded-lg px-2 py-2 text-[13px] font-normal text-text-3 transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {t('This month')}
        </button>
      )}
    </div>
  )
}
