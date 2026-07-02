'use client'

import { useEffect, useState } from 'react'
import { Check, MinusCircle } from 'lucide-react'
import { useApp } from '@/lib/store'
import { FormGroup, FieldRow, SectionLabel } from '@/components/ui'
import { TextInput } from '@/components/inputs'
import { PALETTE, deriveInitial, paletteFor } from '@/lib/categories'
import { Drawer, DrawerHeader } from '@/components/web/Drawer'

export type HouseholdDrawerMode =
  | { type: 'rename' }
  | { type: 'add' }
  | { type: 'member'; userId: string }
  | null

const accentBtn = 'text-[15px] text-accent disabled:opacity-40'

export function HouseholdDrawer({
  mode,
  onClose,
}: {
  mode: HouseholdDrawerMode
  onClose: () => void
}) {
  const {
    currentHousehold,
    currentPersonId,
    householdMembers,
    formatMoney,
    monthlySpentBy,
    updateHouseholdName,
    addPerson,
    renamePerson,
    setPersonColor,
    removePerson,
    t,
  } = useApp()

  // Rename-household state
  const [renameName, setRenameName] = useState('')
  // Add-person state
  const [addName, setAddName] = useState('')
  const [addColor, setAddColor] = useState(PALETTE[0].key)
  // Member-detail state
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState(PALETTE[0].key)

  useEffect(() => {
    if (!mode) return
    setConfirmRemove(false)
    if (mode.type === 'rename') setRenameName(currentHousehold?.name ?? '')
    if (mode.type === 'add') {
      setAddName('')
      setAddColor(PALETTE[0].key)
    }
    if (mode.type === 'member') {
      const m = householdMembers.find((u) => u.id === mode.userId)
      setEditName(m?.name ?? '')
      setEditColor(m?.color_key ?? PALETTE[0].key)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  const saveName = () => {
    const trimmed = renameName.trim()
    if (trimmed !== '') updateHouseholdName(trimmed)
    onClose()
  }

  const addInitial = deriveInitial(addName)
  const canAdd = addName.trim() !== ''
  const swatch = paletteFor(addColor)
  const handleAdd = () => {
    if (!canAdd) return
    addPerson(addName.trim(), addColor)
    onClose()
  }

  const title =
    mode?.type === 'rename' ? t('Rename household') : mode?.type === 'add' ? t('Add person') : t('Person')

  return (
    <Drawer open={mode !== null} onClose={onClose} label={title}>
      {mode?.type === 'rename' && (
        <>
          <DrawerHeader
            title={t('Rename household')}
            onClose={onClose}
            right={
              <button type="button" onClick={saveName} disabled={renameName.trim() === ''} className={accentBtn}>
                {t('Save')}
              </button>
            }
          />
          <div style={{ overflow: 'auto', padding: '20px' }}>
            <FormGroup>
              <FieldRow label={t('Name')}>
                <TextInput
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value)}
                  placeholder={t('Household name')}
                  autoFocus
                />
              </FieldRow>
            </FormGroup>
          </div>
        </>
      )}

      {mode?.type === 'add' && (
        <>
          <DrawerHeader
            title={t('Add person')}
            onClose={onClose}
            right={
              <button type="button" onClick={handleAdd} disabled={!canAdd} className={accentBtn}>
                {t('Add')}
              </button>
            }
          />
          <div style={{ overflow: 'auto', padding: '20px' }}>
            <div className="mb-5 flex justify-center">
              <div
                className="flex h-16 w-16 items-center justify-center rounded-full font-light"
                style={{ background: swatch.bg, color: swatch.fg, fontSize: addInitial.length > 1 ? 18 : 26 }}
              >
                {addInitial}
              </div>
            </div>
            <SectionLabel>{t('Name')}</SectionLabel>
            <div className="mt-2">
              <FormGroup>
                <FieldRow label={t('Name')}>
                  <TextInput value={addName} onChange={(e) => setAddName(e.target.value)} placeholder={t('e.g. Alex')} autoFocus />
                </FieldRow>
              </FormGroup>
            </div>
            <div className="mt-5">
              <SectionLabel>{t('Color')}</SectionLabel>
            </div>
            <div className="mt-2 grid grid-cols-6 gap-3 rounded-2xl bg-surface p-4" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
              {PALETTE.map((opt) => {
                const active = opt.key === addColor
                return (
                  <button
                    key={opt.key}
                    type="button"
                    aria-label={opt.key}
                    onClick={() => setAddColor(opt.key)}
                    className="flex aspect-square items-center justify-center rounded-full"
                    style={{ background: opt.bg, color: opt.fg, outline: active ? '2px solid var(--text)' : 'none', outlineOffset: 2 }}
                  >
                    {active && <Check size={14} strokeWidth={3} />}
                  </button>
                )
              })}
            </div>
            <p className="px-1 pt-3 text-[13px] leading-relaxed text-text-3">
              {t('Initial is set automatically from the name. People you add can own and split transactions — no account needed.')}
            </p>
          </div>
        </>
      )}

      {mode?.type === 'member' && (() => {
        const user = householdMembers.find((u) => u.id === mode.userId)
        if (!user) return null
        const isCurrentPerson = user.id === currentPersonId
        // Keep at least one person; the account holder can't be removed.
        const removable = !isCurrentPerson && householdMembers.length > 1
        const spent = t('{0} this month', formatMoney(monthlySpentBy(user.id)))
        const detail = isCurrentPerson ? t('(you) · {0}', spent) : spent
        const saveRename = () => {
          const trimmed = editName.trim()
          if (trimmed !== '' && trimmed !== user.name) renamePerson(user.id, trimmed)
          if (editColor !== user.color_key) setPersonColor(user.id, editColor)
          onClose()
        }
        const swatch = paletteFor(editColor)
        const doRemove = () => {
          removePerson(user.id)
          onClose()
        }
        return (
          <>
            <DrawerHeader
              title={t('Person')}
              onClose={onClose}
              right={
                <button type="button" onClick={saveRename} disabled={editName.trim() === ''} className={accentBtn}>
                  {t('Save')}
                </button>
              }
            />
            <div style={{ overflow: 'auto', padding: '20px 20px 24px' }}>
              <div className="flex justify-center pb-4">
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-full font-light"
                  style={{ background: swatch.bg, color: swatch.fg, fontSize: (user.initial?.length ?? 1) > 1 ? 18 : 26 }}
                >
                  {user.initial}
                </div>
              </div>
              <FormGroup>
                <FieldRow label={t('Name')}>
                  <TextInput value={editName} onChange={(e) => setEditName(e.target.value)} placeholder={t('Name')} />
                </FieldRow>
              </FormGroup>
              <p className="px-1 pt-2 text-center text-[13px] text-text-2">{detail}</p>

              <div className="mt-5">
                <SectionLabel>{t('Color')}</SectionLabel>
              </div>
              <div className="mt-2 grid grid-cols-6 gap-3 rounded-2xl bg-surface p-4" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                {PALETTE.map((opt) => {
                  const active = opt.key === editColor
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      aria-label={opt.key}
                      onClick={() => setEditColor(opt.key)}
                      className="flex aspect-square items-center justify-center rounded-full"
                      style={{ background: opt.bg, color: opt.fg, outline: active ? '2px solid var(--text)' : 'none', outlineOffset: 2 }}
                    >
                      {active && <Check size={14} strokeWidth={3} />}
                    </button>
                  )
                })}
              </div>

              {removable &&
                (confirmRemove ? (
                  <div className="mt-6 flex flex-col gap-2 rounded-2xl bg-surface p-4" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                    <p className="text-[14px] text-text-2">
                      {t('Remove this person? Past transactions keep their name.')}
                    </p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setConfirmRemove(false)} className="flex-1 rounded-full py-2.5 text-[15px] text-text-2" style={{ background: 'var(--chip-bg)' }}>
                        {t('Cancel')}
                      </button>
                      <button type="button" onClick={doRemove} className="flex-1 rounded-full py-2.5 text-[15px] text-white" style={{ background: 'var(--destructive)' }}>
                        {t('Remove')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(true)}
                    className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-surface py-3.5 text-[17px] text-destructive"
                    style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
                  >
                    <MinusCircle size={16} />
                    {t('Remove person')}
                  </button>
                ))}
            </div>
          </>
        )
      })()}
    </Drawer>
  )
}
