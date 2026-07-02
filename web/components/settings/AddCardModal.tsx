'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/lib/store'
import { Modal, FormGroup, FieldRow, PrimaryButton } from '@/components/ui'
import { TextInput } from '@/components/inputs'

export function AddCardModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addCard, currentHousehold, t } = useApp()
  const [name, setName] = useState('')

  useEffect(() => {
    if (open) setName('')
  }, [open])

  // Adding without a resolved household would silently no-op server-side —
  // block it here like iOS's AddCardSheet does.
  const canAdd = name.trim() !== '' && !!currentHousehold

  const handleAdd = () => {
    if (!canAdd) return
    addCard(name.trim())
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('New card')}
      right={
        <button
          type="button"
          onClick={handleAdd}
          disabled={!canAdd}
          className="font-normal text-accent disabled:opacity-40"
        >
          {t('Add')}
        </button>
      }
    >
      <FormGroup>
        <FieldRow label={t('Name')}>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('e.g. Chase Freedom')}
            autoFocus
          />
        </FieldRow>
      </FormGroup>
      <p className="px-1 pt-3 text-[13px] leading-relaxed text-text-3">
        {t('This name will show up in the Paid with menu when you log a new expense.')}
      </p>
      <div className="mt-5">
        <PrimaryButton onClick={handleAdd} disabled={!canAdd}>
          {t('Add card')}
        </PrimaryButton>
      </div>
    </Modal>
  )
}
