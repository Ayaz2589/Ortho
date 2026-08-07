'use client'

// Statement interstitial: what was found, what will be pre-skipped, and one
// Start review action — nothing saves here (spec 021, ported from
// iOS/Ortho-iOS/Features/Transactions/Scan/StatementInterstitialView.swift).
// Rendered by the eventual add-transaction host in place of the form body
// while the session is in the `interstitial` phase (wiring is a later task
// — this component is a thin, self-contained presentational view driven
// entirely by `ScanSessionState`).

import type { Dispatch } from 'react'
import { useApp } from '@/lib/store'
import {
  selectDuplicateCount,
  selectPaymentCount,
  selectRowCount,
  type ScanSessionAction,
  type ScanSessionState,
} from '@/lib/scan/scanSession'

/** A minimal on/off switch — this design system has no existing toggle
 *  primitive (only the checkmark-style `ChoiceRow`), so this is the
 *  smallest possible implementation of the iOS `Toggle` affordance, built
 *  from the same tokens (accent/chip-bg/hairline) every other control here
 *  uses. Kept local to this file rather than promoted to `components/ui.tsx`
 *  since only this row needs it. */
function SwitchControl({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  ariaLabel: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className="relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors"
      style={{ background: checked ? 'var(--accent)' : 'var(--hairline)' }}
    >
      <span
        className="absolute top-[2px] h-[22px] w-[22px] rounded-full bg-white shadow-sm transition-[left]"
        style={{ left: checked ? 20 : 2 }}
      />
    </button>
  )
}

/** The "Start review" / "Done" pill: light chip background + accent text,
 *  matching the existing capsule idiom — the web equivalent of Swift's
 *  `Capsule().fill(AppTheme.text.opacity(0.05))` buttons. */
export function ScanPillButton({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ortho-interactive rounded-full px-5 py-2.5 text-[15px] font-normal text-accent"
      style={{ background: 'var(--chip-bg)' }}
    >
      {children}
    </button>
  )
}

export function ScanInterstitial({
  state,
  dispatch,
  onCancel,
}: {
  state: ScanSessionState
  dispatch: Dispatch<ScanSessionAction>
  onCancel: () => void
}) {
  const { t } = useApp()
  const rowCount = selectRowCount(state)
  const duplicateCount = selectDuplicateCount(state)
  const paymentCount = selectPaymentCount(state)

  return (
    <div className="flex flex-col">
      <div className="relative flex items-center px-5 pb-2 pt-4">
        <button type="button" onClick={onCancel} className="text-[15px] font-normal text-accent">
          {t('Cancel')}
        </button>
        <div className="pointer-events-none absolute inset-x-0 text-center text-[16px] font-normal tracking-[-0.3px] text-text">
          {t('Review statement')}
        </div>
      </div>

      <div className="flex flex-col gap-5 pt-2">
        <div className="flex flex-col gap-2 px-6">
          <p className="text-[22px] font-normal text-text">{t('{0} rows found', rowCount)}</p>
          {duplicateCount > 0 && (
            <p className="text-[15px] text-text-2">{t('{0} look like duplicates', duplicateCount)}</p>
          )}
          {paymentCount > 0 && (
            <p className="text-[15px] text-text-2">{t('{0} card payments will be skipped', paymentCount)}</p>
          )}
        </div>

        {duplicateCount > 0 && (
          <div className="px-4">
            <div
              className="flex min-h-[52px] items-center gap-3 rounded-2xl bg-surface px-4"
              style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
            >
              <span className="flex-1 text-[17px] font-normal tracking-[-0.2px] text-text">
                {t('Skip duplicates')}
              </span>
              <SwitchControl
                checked={state.skipDuplicates}
                onChange={(value) => dispatch({ type: 'toggleSkipDuplicates', value })}
                ariaLabel={t('Skip duplicates')}
              />
            </div>
          </div>
        )}

        <p className="max-w-[360px] px-6 text-[13px] leading-relaxed text-text-3">
          {t('Each row opens prefilled for review. Nothing is added until you confirm it.')}
        </p>

        <div className="flex justify-center">
          <ScanPillButton onClick={() => dispatch({ type: 'review/start' })}>
            {t('Start review')}
          </ScanPillButton>
        </div>
      </div>
    </div>
  )
}
