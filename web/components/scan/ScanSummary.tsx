'use client'

// Wizard summary: what happened, one Done action (spec 021, ported from
// iOS/Ortho-iOS/Features/Transactions/Scan/ScanSummaryView.swift). Reached
// from the last reviewed row or Stop — rows already added stay, they were
// real optimistic adds. A thin presentational view driven entirely by
// `ScanSessionState` (wiring into the add-transaction host is a later task).

import { CheckCircle } from 'lucide-react'
import { useApp } from '@/lib/store'
import {
  selectAddedCount,
  selectLeftOutDuplicateCount,
  selectSkippedCount,
  type ScanSessionState,
} from '@/lib/scan/scanSession'
import { ScanPillButton } from './ScanInterstitial'

export function ScanSummary({ state, onDone }: { state: ScanSessionState; onDone: () => void }) {
  const { t } = useApp()
  const addedCount = selectAddedCount(state)
  const skippedCount = selectSkippedCount(state)
  const leftOutDuplicateCount = selectLeftOutDuplicateCount(state)
  const nothingHappened = addedCount === 0 && skippedCount === 0 && leftOutDuplicateCount === 0

  return (
    <div className="flex min-h-[420px] flex-col items-center justify-between py-10">
      <div />

      <div className="flex flex-col items-center gap-3">
        <CheckCircle size={40} className="text-text-3" strokeWidth={1.5} />

        <div className="flex flex-col items-center gap-1.5">
          {/* Zero-count segments are omitted entirely. */}
          {addedCount > 0 && <p className="text-[22px] font-normal text-text">{t('{0} added', addedCount)}</p>}
          {skippedCount > 0 && (
            <p className="text-[15px] text-text-2">{t('{0} skipped', skippedCount)}</p>
          )}
          {leftOutDuplicateCount > 0 && (
            <p className="text-[15px] text-text-2">{t('{0} duplicates left out', leftOutDuplicateCount)}</p>
          )}
          {nothingHappened && <p className="text-[15px] text-text-2">{t('Nothing was added')}</p>}
        </div>
      </div>

      <ScanPillButton onClick={onDone}>{t('Done')}</ScanPillButton>
    </div>
  )
}
