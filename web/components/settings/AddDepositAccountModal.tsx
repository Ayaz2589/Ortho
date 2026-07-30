'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/lib/store'
import { Modal, FormGroup, FieldRow, PrimaryButton } from '@/components/ui'
import { TextInput } from '@/components/inputs'

export function AddDepositAccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addDepositAccount, currentHousehold, t } = useApp()
  const [name, setName] = useState('')

  useEffect(() => {
    if (open) setName('')
  }, [open])

  const canAdd = name.trim() !== '' && !!currentHousehold

  const handleAdd = () => {
    if (!canAdd) return
    addDepositAccount(name.trim())
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('New account')}
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
            placeholder={t('e.g. Chase Checking')}
            autoFocus
          />
        </FieldRow>
      </FormGroup>
      <p className="px-1 pt-3 text-[13px] leading-relaxed text-text-3">
        {t('Accounts appear in the Deposit to menu when you log income. Existing transactions keep their original account name.')}
      </p>
      <div className="mt-5">
        <PrimaryButton onClick={handleAdd} disabled={!canAdd}>
          {t('Add account')}
        </PrimaryButton>
      </div>
    </Modal>
  )
}
