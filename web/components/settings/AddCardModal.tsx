'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/lib/store'
import { Modal, FormGroup, FieldRow, PrimaryButton } from '@/components/ui'
import { TextInput } from '@/components/inputs'

export function AddCardModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addCard } = useApp()
  const [name, setName] = useState('')

  useEffect(() => {
    if (open) setName('')
  }, [open])

  const canAdd = name.trim() !== ''

  const handleAdd = () => {
    if (!canAdd) return
    addCard(name.trim())
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New card"
      right={
        <button
          type="button"
          onClick={handleAdd}
          disabled={!canAdd}
          className="font-semibold text-accent disabled:opacity-40"
        >
          Add
        </button>
      }
    >
      <FormGroup>
        <FieldRow label="Name">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Chase Freedom"
            autoFocus
          />
        </FieldRow>
      </FormGroup>
      <p className="px-1 pt-3 text-[13px] leading-relaxed text-text-3">
        This name will show up in the Paid with menu when you log a new expense.
      </p>
      <div className="mt-5">
        <PrimaryButton onClick={handleAdd} disabled={!canAdd}>
          Add card
        </PrimaryButton>
      </div>
    </Modal>
  )
}
