'use client'

import { useEffect, useState } from 'react'
import { Check, MinusCircle } from 'lucide-react'
import { useApp } from '@/lib/store'
import { Avatar, FormGroup, FieldRow, SectionLabel } from '@/components/ui'
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
    currentUserId,
    householdMembers,
    localUsers,
    formatMoney,
    monthlySpentBy,
    updateHouseholdName,
    removeMember,
    removeLocalUser,
    addLocalUser,
  } = useApp()

  // Rename state
  const [renameName, setRenameName] = useState('')
  // Add-user state
  const [addName, setAddName] = useState('')
  const [addColor, setAddColor] = useState(PALETTE[0].key)
  // Member-detail state
  const [confirmRemove, setConfirmRemove] = useState(false)

  useEffect(() => {
    if (!mode) return
    setConfirmRemove(false)
    if (mode.type === 'rename') setRenameName(currentHousehold?.name ?? '')
    if (mode.type === 'add') {
      setAddName('')
      setAddColor(PALETTE[0].key)
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
    addLocalUser({ name: addName.trim(), initial: addInitial, color_key: addColor })
    onClose()
  }

  const title =
    mode?.type === 'rename' ? 'Rename household' : mode?.type === 'add' ? 'New local user' : 'Member'

  return (
    <Drawer open={mode !== null} onClose={onClose} label={title}>
      {mode?.type === 'rename' && (
        <>
          <DrawerHeader
            title="Rename household"
            onClose={onClose}
            right={
              <button type="button" onClick={saveName} disabled={renameName.trim() === ''} className={accentBtn}>
                Save
              </button>
            }
          />
          <div style={{ overflow: 'auto', padding: '20px' }}>
            <FormGroup>
              <FieldRow label="Name">
                <TextInput
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value)}
                  placeholder="Household name"
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
            title="New local user"
            onClose={onClose}
            right={
              <button type="button" onClick={handleAdd} disabled={!canAdd} className={accentBtn}>
                Add
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
            <SectionLabel>Name</SectionLabel>
            <div className="mt-2">
              <FormGroup>
                <FieldRow label="Name">
                  <TextInput value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="e.g. Alex" autoFocus />
                </FieldRow>
              </FormGroup>
            </div>
            <div className="mt-5">
              <SectionLabel>Color</SectionLabel>
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
              Initial is set automatically from the name. Local users stay on this device — use them to
              split personal expenses with people who don&apos;t have Ortho.
            </p>
          </div>
        </>
      )}

      {mode?.type === 'member' && (() => {
        const member = householdMembers.find((u) => u.id === mode.userId)
        const local = localUsers.find((u) => u.id === mode.userId)
        const user = member ?? local
        if (!user) return null
        const isCurrentUser = user.id === currentUserId
        const removable = member
          ? !isCurrentUser && householdMembers.length > 1
          : !!local
        const detail = local
          ? 'Local user'
          : isCurrentUser
            ? `(you) · ${formatMoney(monthlySpentBy(user.id))} this month`
            : `${formatMoney(monthlySpentBy(user.id))} this month`
        const doRemove = () => {
          if (member) removeMember(user.id)
          else if (local) removeLocalUser(user.id)
          onClose()
        }
        return (
          <>
            <DrawerHeader title="Member" onClose={onClose} />
            <div style={{ overflow: 'auto', padding: '20px 20px 24px', textAlign: 'center' }}>
              <div className="flex justify-center pb-3">
                <Avatar user={user} size={64} />
              </div>
              <div className="text-[20px] text-text">{user.name}</div>
              <div className="pt-1 text-[14px] text-text-2">{detail}</div>

              {removable &&
                (confirmRemove ? (
                  <div className="mt-6 flex flex-col gap-2 rounded-2xl bg-surface p-4" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                    <p className="text-[14px] text-text-2">
                      {member ? 'Remove this member from the household?' : 'Remove this local user?'}
                    </p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setConfirmRemove(false)} className="flex-1 rounded-full py-2.5 text-[15px] text-text-2" style={{ background: 'var(--chip-bg)' }}>
                        Cancel
                      </button>
                      <button type="button" onClick={doRemove} className="flex-1 rounded-full py-2.5 text-[15px] text-white" style={{ background: 'var(--destructive)' }}>
                        Remove
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
                    {member ? 'Remove member' : 'Remove user'}
                  </button>
                ))}
            </div>
          </>
        )
      })()}
    </Drawer>
  )
}
