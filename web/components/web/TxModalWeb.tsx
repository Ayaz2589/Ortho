'use client'

import { useState } from 'react'
import type { Transaction } from '@/lib/types'
import { WebModal } from './WebModal'
import {
  useTxForm,
  TxFormFields,
  TxCopyList,
  CopyFromRecentButton,
  SaveAndAddAnotherButton,
  type TransferPrefill,
} from './TxForm'

/**
 * New / Edit transaction as a centered modal. Used on the mobile/medium
 * transactions surfaces (the desktop ledger uses the slide-out drawer form).
 * New mode offers "Copy from recent" as an in-modal sub-view. When opened with
 * `initialTransfer` it starts in "Settle up" (reimbursement) mode, pre-filled.
 */
export function TxModalWeb({
  open,
  onClose,
  editing,
  copying,
  initialTransfer,
}: {
  open: boolean
  onClose: () => void
  editing?: Transaction | null
  copying?: Transaction | null
  initialTransfer?: TransferPrefill | null
}) {
  const form = useTxForm({ editing, copying, initialTransfer })
  const [picking, setPicking] = useState(false)
  if (!open) return null
  const allowCopy = !editing && !initialTransfer
  const title = editing
    ? editing.kind === 'transfer'
      ? 'Edit reimbursement'
      : 'Edit transaction'
    : initialTransfer
      ? 'Settle up'
      : 'New transaction'

  return (
    <WebModal
      title={title}
      onClose={onClose}
      onSave={picking ? undefined : () => {
        if (form.submit()) onClose()
      }}
      canSave={form.canSave}
      saveLabel={editing ? 'Save' : initialTransfer ? 'Record' : 'Add'}
      hideHeader={picking}
    >
      {picking ? (
        <TxCopyList
          onPick={(tx) => {
            form.loadFrom(tx)
            setPicking(false)
          }}
          onBack={() => setPicking(false)}
        />
      ) : (
        <>
          {allowCopy && <CopyFromRecentButton onClick={() => setPicking(true)} />}
          <TxFormFields form={form} />
          {!editing && <SaveAndAddAnotherButton form={form} />}
        </>
      )}
    </WebModal>
  )
}
