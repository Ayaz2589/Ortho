'use client'

import { useEffect, useMemo } from 'react'
import { Geolocation } from '@capacitor/geolocation'
import { useApp } from '@/lib/store'
import { SectionCard } from '@/components/settings/rows'
import { maybeCaptureVisit } from '@/lib/location/captureVisit'
import { clusterVisits, clusterRoutineKey } from '@/lib/location/visitClusters'
import { RoutineCard } from './RoutineCard'
import { LocationCandidateCard } from './LocationCandidateCard'

/** The Routines view body (spec 044 US1/US2): every non-dismissed recognized routine, active ones
 *  first, lapsed ones after. A dismissed routine never renders (FR-005). Empty/insufficient-history
 *  household gets a calm message, never an alarming empty state (Constitution II/IV).
 *
 *  US4: mounting this view is the "natural app-foreground moment" that triggers an opportunistic
 *  visit capture when the user has opted into 'foreground_capture' (research.md §1) — throttled,
 *  silent on denial, never blocking the routines list itself. Repeating-place visit clusters
 *  surface as dismissible candidate cards (AC3), reusing recognized_routine_states' confirm/dismiss
 *  persistence via a `loc:` routine-key prefix — no new table. */
export function RoutinesList() {
  const {
    routines,
    currentPersonId,
    locationConsent,
    routineVisits,
    loadRoutineVisits,
    recordRoutineVisit,
    recognizedRoutineStates,
    dismissRoutine,
    t,
  } = useApp()

  useEffect(() => {
    if (locationConsent?.level !== 'foreground_capture') return
    let cancelled = false
    ;(async () => {
      // Use the RETURNED rows — `routineVisits` here is the closure over the
      // mount render's (empty) state, which defeated the persisted 30-minute
      // throttle on every session's first mount (review 2026-08-24).
      const freshVisits = await loadRoutineVisits()
      if (cancelled) return
      const lastCaptureAt = freshVisits.reduce<Date | null>((latest, v) => {
        const at = new Date(v.captured_at)
        return !latest || at > latest ? at : latest
      }, null)
      await maybeCaptureVisit({
        level: 'foreground_capture',
        lastCaptureAt,
        now: new Date(),
        onCapture: recordRoutineVisit,
        geolocation: Geolocation,
      })
    })()
    return () => {
      cancelled = true
    }
    // Intentionally runs once per mount + consent-level change, not on every routineVisits update
    // (which the capture call itself causes) — including it would create a capture/reload loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationConsent?.level])

  const visible = routines
    .filter((r) => r.status !== 'dismissed')
    // FR-016: a routine derived from ONE member's personal-scope transactions
    // is private to that member — a UI-layer filter by design (RLS is
    // household-wide; data-model.md). Never implemented until now
    // (review 2026-08-24). Household routines (personId null) show for all.
    .filter((r) => r.personId == null || r.personId === currentPersonId)
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'recurring_charge' ? -1 : 1
      if ((a.status === 'lapsed') !== (b.status === 'lapsed')) return a.status === 'lapsed' ? 1 : -1
      return b.confidence - a.confidence
    })

  const candidateClusters = useMemo(() => {
    if (locationConsent?.level !== 'foreground_capture') return []
    const dismissedKeys = new Set(
      recognizedRoutineStates.filter((s) => s.status === 'dismissed').map((s) => s.routine_key)
    )
    return clusterVisits(routineVisits).filter((c) => !dismissedKeys.has(clusterRoutineKey(c.clusterId)))
  }, [locationConsent?.level, routineVisits, recognizedRoutineStates])

  if (visible.length === 0 && candidateClusters.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-[13px] text-text-3">
        {t('Not enough history yet — keep logging transactions and routines will show up here.')}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {candidateClusters.length > 0 && (
        <SectionCard>
          {candidateClusters.map((cluster) => (
            <LocationCandidateCard
              key={cluster.clusterId}
              cluster={cluster}
              onDismiss={() => dismissRoutine(clusterRoutineKey(cluster.clusterId))}
            />
          ))}
        </SectionCard>
      )}
      {visible.length > 0 && (
        <SectionCard>
          {visible.map((routine) => (
            <RoutineCard key={routine.routineKey} routine={routine} />
          ))}
        </SectionCard>
      )}
    </div>
  )
}
