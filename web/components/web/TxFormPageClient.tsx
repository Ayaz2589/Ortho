'use client'

import { useState } from 'react'
import { useApp } from '@/lib/store'
import type { Transaction } from '@/lib/types'
import { FormPage } from './FormPage'
import { FormPageHeader } from './FormPageHeader'
import { useTxForm, TxFormBody, TxCopyList, type TransferPrefill } from './TxForm'

/**
 * New / Edit transaction as a full mobile PAGE (spec 025). Same form engine as
 * the desktop drawer (TxFormContent) — `useTxForm` + `TxFormBody` — only the
 * chrome differs: a sticky FormPageHeader (Cancel · title · Save) in normal page
 * flow instead of a portalled modal. This page REPLACES the old mobile centered
 * modal. "Copy from recent" stays an in-page sub-view; "Save and add another"
 * resets in place (inside TxFormBody). `onDone` is the page's navigation back to
 * the list (called on Save and Cancel).
 */
export function TxFormPageClient({
  editing,
  copying,
  initialTransfer,
  onDone,
}: {
  editing?: Transaction | null
  copying?: Transaction | null
  initialTransfer?: TransferPrefill | null
  onDone: () => void
}) {
  const { t } = useApp()
  const form = useTxForm({ editing, copying, initialTransfer })
  const [picking, setPicking] = useState(false)
  const allowCopy = !editing && !initialTransfer
  const title = editing
    ? editing.kind === 'transfer'
      ? t('Edit reimbursement')
      : t('Edit transaction')
    : initialTransfer
      ? t('Settle up')
      : t('New transaction')
  const saveLabel = editing ? t('Save') : initialTransfer ? t('Record') : t('Add')

  return (
    <FormPage>
      {!picking && (
        <FormPageHeader
          title={title}
          cancelLabel={t('Cancel')}
          saveLabel={saveLabel}
          canSave={form.canSave}
          onCancel={onDone}
          onSave={() => {
            if (form.submit()) onDone()
          }}
        />
      )}
      <div className="flex-1 px-4 pb-10 pt-2">
        {picking ? (
          <TxCopyList
            onPick={(tx) => {
              form.loadFrom(tx)
              setPicking(false)
            }}
            onBack={() => setPicking(false)}
          />
        ) : (
          <TxFormBody
            form={form}
            allowCopy={allowCopy}
            showAddAnother={!editing}
            onPick={() => setPicking(true)}
          />
        )}
      </div>
    </FormPage>
  )
}
