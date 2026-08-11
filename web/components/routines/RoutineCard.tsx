'use client'

import { useState } from 'react'
import { useApp } from '@/lib/store'
import type { RoutineWithState } from '@/lib/finance/routines'

/** One recognized routine: cadence + typical amount, confirm/dismiss/rename actions. Real
 *  `<button>`s throughout (Constitution V). Calm — no red, no urgency (Constitution II/IV). */
export function RoutineCard({ routine }: { routine: RoutineWithState }) {
  const { formatMoney, confirmRoutine, dismissRoutine, renameRoutine, merchantGeocodes, t } = useApp()
  const [renaming, setRenaming] = useState(false)
  const [draftLabel, setDraftLabel] = useState(routine.label ?? routine.merchantLabel)

  const title = routine.label ?? routine.merchantLabel
  const cadence =
    routine.kind === 'recurring_charge'
      ? t('Monthly, about {0}', formatMoney(routine.typicalAmountCents))
      : t('A regular habit, around {0}', formatMoney(routine.typicalAmountCents))
  const lapsed = routine.status === 'lapsed'
  // US4 FR-012: an optional, purely decorative place label — never affects detection/display of
  // the routine itself when absent (geocoding off, or the merchant not yet resolved).
  const geocode = (merchantGeocodes ?? []).find(
    (g) => g.merchant_key === routine.merchantKey && g.resolved_at != null
  )

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {renaming ? (
            <input
              autoFocus
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              onBlur={() => {
                setRenaming(false)
                const trimmed = draftLabel.trim()
                if (trimmed && trimmed !== title) renameRoutine(routine.routineKey, trimmed)
              }}
              className="w-full rounded-lg border border-hairline bg-surface px-2 py-1 text-[17px] text-text"
              aria-label={t('Rename routine')}
            />
          ) : (
            <span className="truncate text-[17px] font-normal text-text">{title}</span>
          )}
          <span className="truncate text-[13px] text-text-3">
            {cadence}
            {lapsed && ` · ${t('No longer active')}`}
            {geocode?.label && ` · ${geocode.label}`}
          </span>
        </div>
        {routine.status !== 'dismissed' && !renaming && (
          <div className="flex shrink-0 items-center gap-3">
            {routine.status === 'recognized' && (
              <button
                type="button"
                onClick={() => confirmRoutine(routine.routineKey)}
                className="text-[13px] font-normal text-accent"
              >
                {t('Confirm')}
              </button>
            )}
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="text-[13px] font-normal text-text-2"
            >
              {t('Rename')}
            </button>
            <button
              type="button"
              onClick={() => dismissRoutine(routine.routineKey)}
              className="text-[13px] font-normal text-text-2"
            >
              {t('Dismiss')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
