'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useApp } from '@/lib/store'
import { PageHeader, Modal, FormGroup, FieldRow, PrimaryButton } from '@/components/ui'
import { ReadingColumn } from '@/components/layout'
import { TextInput } from '@/components/inputs'
import { SectionCard, UserRow, AddRow } from '@/components/settings/rows'
import { AddUserModal } from '@/components/settings/AddUserModal'

export default function HouseholdPage() {
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
  } = useApp()

  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState('')
  const [addingUser, setAddingUser] = useState(false)

  useEffect(() => {
    if (renaming) setName(currentHousehold?.name ?? '')
  }, [renaming, currentHousehold])

  const saveName = () => {
    const trimmed = name.trim()
    if (trimmed !== '') updateHouseholdName(trimmed)
    setRenaming(false)
  }

  const canRemoveMember = (id: string) => id !== currentUserId && householdMembers.length > 1

  return (
    <ReadingColumn>
      <div className="pt-2">
        <Link href="/settings" className="inline-flex items-center gap-1 text-[15px] text-accent">
          <ChevronLeft size={18} />
          Settings
        </Link>
      </div>
      <PageHeader title="Household" />

      <SectionCard>
        <button
          type="button"
          onClick={() => setRenaming(true)}
          className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left"
        >
          <span className="text-[17px] font-normal text-text">Name</span>
          <span className="ml-auto flex items-center gap-1.5">
            <span className="text-[17px] font-normal text-text-2">
              {currentHousehold?.name ?? 'Untitled'}
            </span>
            <ChevronRight size={16} className="text-text-3" />
          </span>
        </button>

        {householdMembers.map((u) => (
          <UserRow
            key={u.id}
            user={u}
            isCurrentUser={u.id === currentUserId}
            detail={`${formatMoney(monthlySpentBy(u.id))} this month`}
            onRemove={canRemoveMember(u.id) ? () => removeMember(u.id) : undefined}
          />
        ))}

        {localUsers.map((u) => (
          <UserRow key={u.id} user={u} detail="Local" onRemove={() => removeLocalUser(u.id)} />
        ))}

        <AddRow label="Add user" onClick={() => setAddingUser(true)} />
      </SectionCard>

      <p className="px-1 pt-3 text-[13px] leading-relaxed text-text-3">
        Members can see all Shared transactions in this household. Personal transactions are visible
        only to you. Local users stay on this device.
      </p>

      <Modal
        open={renaming}
        onClose={() => setRenaming(false)}
        title="Rename household"
        right={
          <button
            type="button"
            onClick={saveName}
            disabled={name.trim() === ''}
            className="font-normal text-accent disabled:opacity-40"
          >
            Save
          </button>
        }
      >
        <FormGroup>
          <FieldRow label="Name">
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Household name"
              autoFocus
            />
          </FieldRow>
        </FormGroup>
        <div className="mt-5">
          <PrimaryButton onClick={saveName} disabled={name.trim() === ''}>
            Save
          </PrimaryButton>
        </div>
      </Modal>

      <AddUserModal open={addingUser} onClose={() => setAddingUser(false)} />
    </ReadingColumn>
  )
}
