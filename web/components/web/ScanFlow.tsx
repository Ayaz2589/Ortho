'use client'

// Scan flow host (spec 021, T053): renders the right chrome for the current
// ScanSessionState.phase, driven by useScanFlow(). Shared by BOTH the mobile
// Transactions page (app/(app)/transactions/page.tsx) and the desktop ledger
// (components/web/TransactionsDesktop.tsx) — each drives it via its own
// useScanFlow() and wires every candidate through the same prefill hook
// (TxForm.loadFromScanCandidate), so scanned rows come out identical across
// platforms.

import { useEffect, type Dispatch } from 'react'
import { useApp } from '@/lib/store'
import { WebModal } from './WebModal'
import { useTxForm, TxFormFields } from './TxForm'
import { ScanInterstitial } from '@/components/scan/ScanInterstitial'
import { ScanSummary } from '@/components/scan/ScanSummary'
import {
  selectCurrentCandidate,
  type ScanSessionAction,
  type ScanSessionState,
} from '@/lib/scan/scanSession'
import type { ParsedCandidate } from '@/lib/scan/scanModels'

export function ScanFlow({
  state,
  dispatch,
  onClose,
}: {
  state: ScanSessionState
  dispatch: Dispatch<ScanSessionAction>
  onClose: () => void
}) {
  const { t } = useApp()

  switch (state.phase) {
    case 'idle':
      return null

    case 'parsing':
      return (
        <WebModal title={t('Scan')} onClose={onClose} hideHeader>
          <div className="flex min-h-[420px] items-center justify-center text-[15px] text-text-3">
            {t('Reading document…')}
          </div>
        </WebModal>
      )

    case 'failed': {
      const unsupportedOnWeb = state.failureReason === 'unsupportedOnWeb'
      return (
        <WebModal title={t('Scan')} onClose={onClose} hideHeader>
          <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-[17px] font-normal text-text">
              {unsupportedOnWeb ? t('Photo scanning is on iOS only') : t("Couldn't read this")}
            </p>
            <p className="max-w-[280px] text-[14px] text-text-2">
              {unsupportedOnWeb
                ? t('On the web, import a PDF statement or enter it manually.')
                : t('Try a clearer photo, or enter it manually.')}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="ortho-interactive rounded-full px-5 py-2.5 text-[15px] font-normal text-accent"
              style={{ background: 'var(--chip-bg)' }}
            >
              {t('Close')}
            </button>
          </div>
        </WebModal>
      )
    }

    case 'interstitial':
      return (
        <WebModal title={t('Review statement')} onClose={onClose} hideHeader>
          <ScanInterstitial state={state} dispatch={dispatch} onCancel={onClose} />
        </WebModal>
      )

    case 'summary':
      return (
        <WebModal title={t('Summary')} onClose={onClose} hideHeader>
          <ScanSummary state={state} onDone={onClose} />
        </WebModal>
      )

    case 'receiptPrefilled':
      return state.receiptCandidate ? (
        <ScanCandidateForm
          candidate={state.receiptCandidate}
          title={t('New transaction')}
          saveLabel={t('Add')}
          onAccept={onClose}
          onCancel={onClose}
        />
      ) : null

    case 'reviewing': {
      const current = selectCurrentCandidate(state)
      if (!current) return null
      return (
        <ScanCandidateForm
          key={current.id}
          candidate={current}
          title={t('Review row')}
          saveLabel={t('Add')}
          onAccept={() => dispatch({ type: 'review/accept' })}
          onCancel={() => dispatch({ type: 'review/skip' })}
          onStop={() => dispatch({ type: 'review/stop' })}
        />
      )
    }

    default:
      return null
  }
}

/** One transaction, prefilled from a scanned candidate — the same form every
 *  other add/edit flow uses, via `loadFromScanCandidate` (contract:
 *  data-model.md's ScanSession, "the caller performs the actual optimistic
 *  add per row"). Cancel means "skip this row" while reviewing a statement,
 *  or "discard" for a single receipt. */
function ScanCandidateForm({
  candidate,
  title,
  saveLabel,
  onAccept,
  onCancel,
  onStop,
}: {
  candidate: ParsedCandidate
  title: string
  saveLabel: string
  onAccept: () => void
  onCancel: () => void
  onStop?: () => void
}) {
  const { t } = useApp()
  const form = useTxForm({})

  useEffect(() => {
    form.loadFromScanCandidate(candidate)
    // Only re-prefill when the candidate itself changes, not on every form
    // keystroke — loadFromScanCandidate is an imperative one-time seed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate.id])

  return (
    <WebModal
      title={title}
      onClose={onCancel}
      onSave={() => {
        if (form.submit()) onAccept()
      }}
      canSave={form.canSave}
      saveLabel={saveLabel}
    >
      {onStop && (
        <div className="flex justify-end px-5 pt-3">
          <button type="button" onClick={onStop} className="text-[13px] font-normal text-text-3">
            {t('Stop reviewing')}
          </button>
        </div>
      )}
      <TxFormFields form={form} />
    </WebModal>
  )
}
