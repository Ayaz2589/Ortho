'use client'

import { useState } from 'react'
import type { Transaction } from '@/lib/types'
import { WebModal } from './WebModal'
import { useTxForm, TxFormFields, TxCopyList, CopyFromRecentButton } from './TxForm'

/**
 * New / Edit transaction as a centered modal. Used on the mobile/medium
 * transactions surfaces (the desktop ledger uses the slide-out drawer form).
 * New mode offers "Copy from recent" as an in-modal sub-view.
 */
export function TxModalWeb({
  open,
  onClose,
  editing,
  copying,
}: {
  open: boolean
  onClose: () => void
  editing?: Transaction | null
  copying?: Transaction | null
}) {
  const form = useTxForm({ editing, copying })
  const [picking, setPicking] = useState(false)
  if (!open) return null
  const allowCopy = !editing

  return (
    <WebModal
      title={editing ? 'Edit transaction' : 'New transaction'}
      onClose={onClose}
      onSave={picking ? undefined : () => {
        if (form.submit()) onClose()
      }}
      canSave={form.canSave}
      saveLabel={editing ? 'Save' : 'Add'}
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
        </>
      )}
    </WebModal>
  )
}
