'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { useApp } from '@/lib/store'
import { Modal, FormGroup, FieldRow, SectionLabel, PrimaryButton } from '@/components/ui'
import { TextInput } from '@/components/inputs'
import { PALETTE, deriveInitial, paletteFor } from '@/lib/categories'

export function AddUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addLocalUser } = useApp()
  const [name, setName] = useState('')
  const [colorKey, setColorKey] = useState(PALETTE[0].key)

  useEffect(() => {
    if (open) {
      setName('')
      setColorKey(PALETTE[0].key)
    }
  }, [open])

  const initial = deriveInitial(name)
  const canAdd = name.trim() !== ''
  const swatch = paletteFor(colorKey)

  const handleAdd = () => {
    if (!canAdd) return
    addLocalUser({ name: name.trim(), initial, color_key: colorKey })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New local user"
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
      <div className="mb-5 flex justify-center">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full font-semibold"
          style={{
            background: swatch.bg,
            color: swatch.fg,
            fontSize: initial.length > 1 ? 18 : 26,
          }}
        >
          {initial}
        </div>
      </div>

      <SectionLabel>Name</SectionLabel>
      <div className="mt-2">
        <FormGroup>
          <FieldRow label="Name">
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex"
              autoFocus
            />
          </FieldRow>
        </FormGroup>
      </div>

      <div className="mt-5">
        <SectionLabel>Color</SectionLabel>
      </div>
      <div
        className="mt-2 grid grid-cols-6 gap-3 rounded-2xl bg-surface p-4"
        style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
      >
        {PALETTE.map((opt) => {
          const active = opt.key === colorKey
          return (
            <button
              key={opt.key}
              type="button"
              aria-label={opt.key}
              onClick={() => setColorKey(opt.key)}
              className="flex aspect-square items-center justify-center rounded-full"
              style={{
                background: opt.bg,
                color: opt.fg,
                outline: active ? '2px solid var(--text)' : 'none',
                outlineOffset: 2,
              }}
            >
              {active && <Check size={14} strokeWidth={3} />}
            </button>
          )
        })}
      </div>

      <p className="px-1 pt-3 text-[13px] leading-relaxed text-text-3">
        Initial is set automatically from the name. Local users stay on this device — use them to
        split personal expenses with people who don&apos;t have Ortho.
      </p>

      <div className="mt-4">
        <PrimaryButton onClick={handleAdd} disabled={!canAdd}>
          Add user
        </PrimaryButton>
      </div>
    </Modal>
  )
}
