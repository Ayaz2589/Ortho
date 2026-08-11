'use client'

import { useApp } from '@/lib/store'
import type { VisitCluster } from '@/lib/location/visitClusters'

/** A location-derived candidate routine (US4 AC3) — a repeating place, surfaced BEFORE any
 *  matching transaction exists. Always a dismissible suggestion; NEVER auto-creates or modifies a
 *  transaction (FR-014) — dismiss is the only action here. */
export function LocationCandidateCard({ cluster, onDismiss }: { cluster: VisitCluster; onDismiss: () => void }) {
  const { t } = useApp()
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[17px] font-normal text-text">
          {t('A place you visit often')}
        </span>
        <span className="truncate text-[13px] text-text-3">
          {t('Noticed {0} times — might be worth logging as a routine.', cluster.visitCount)}
        </span>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-[13px] font-normal text-text-2"
      >
        {t('Dismiss')}
      </button>
    </div>
  )
}
