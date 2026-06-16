'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useApp } from '@/lib/store'
import { PageHeader } from '@/components/ui'
import { ReadingColumn } from '@/components/layout'
import { SectionCard, UserRow, AddRow } from '@/components/settings/rows'
import { HouseholdDrawer, type HouseholdDrawerMode } from '@/components/settings/HouseholdDrawer'

export default function HouseholdPage() {
  const {
    currentHousehold,
    currentPersonId,
    householdMembers,
    formatMoney,
    monthlySpentBy,
  } = useApp()

  const [drawer, setDrawer] = useState<HouseholdDrawerMode>(null)

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
          onClick={() => setDrawer({ type: 'rename' })}
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
            isCurrentUser={u.id === currentPersonId}
            detail={`${formatMoney(monthlySpentBy(u.id))} this month`}
            onClick={() => setDrawer({ type: 'member', userId: u.id })}
          />
        ))}

        <AddRow label="Add person" onClick={() => setDrawer({ type: 'add' })} />
      </SectionCard>

      <p className="px-1 pt-3 text-[13px] leading-relaxed text-text-3">
        Everyone in your household can be an owner of a transaction. People you add need no Ortho
        account; you can split any transaction between them.
      </p>

      <HouseholdDrawer mode={drawer} onClose={() => setDrawer(null)} />
    </ReadingColumn>
  )
}
