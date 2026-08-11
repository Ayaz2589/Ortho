'use client'

import { useApp } from '@/lib/store'
import { SectionCard } from '@/components/settings/rows'
import { RoutineCard } from './RoutineCard'

/** The Routines view body (spec 044 US1/US2): every non-dismissed recognized routine, active ones
 *  first, lapsed ones after. A dismissed routine never renders (FR-005). Empty/insufficient-history
 *  household gets a calm message, never an alarming empty state (Constitution II/IV). */
export function RoutinesList() {
  const { routines, t } = useApp()
  const visible = routines
    .filter((r) => r.status !== 'dismissed')
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'recurring_charge' ? -1 : 1
      if ((a.status === 'lapsed') !== (b.status === 'lapsed')) return a.status === 'lapsed' ? 1 : -1
      return b.confidence - a.confidence
    })

  if (visible.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-[13px] text-text-3">
        {t('Not enough history yet — keep logging transactions and routines will show up here.')}
      </p>
    )
  }

  return (
    <SectionCard>
      {visible.map((routine) => (
        <RoutineCard key={routine.routineKey} routine={routine} />
      ))}
    </SectionCard>
  )
}
