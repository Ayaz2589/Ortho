'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useApp } from '@/lib/store'
import { PageHeader } from '@/components/ui'
import { ReadingColumn } from '@/components/layout'
import { SectionCard, UserRow, AddRow, LinkRow } from '@/components/settings/rows'
import { HouseholdDrawer, type HouseholdDrawerMode } from '@/components/settings/HouseholdDrawer'
import { WidgetToggleRow } from '@/components/widgets/WidgetToggleRow'
import { readSharedByDefault, writeSharedByDefault } from '@/components/settings/sharedByDefault'
import { Users } from 'lucide-react'

export default function HouseholdPage() {
  const {
    currentHousehold,
    currentPersonId,
    householdMembers,
    linkedInstitutions,
    formatMoney,
    monthlySpentBy,
    t,
  } = useApp()

  const [drawer, setDrawer] = useState<HouseholdDrawerMode>(null)
  // spec 050 — read AFTER mount: localStorage is unavailable during the static export's
  // prerender, and reading it in the initial state would hydrate-mismatch.
  const [shared, setShared] = useState(true)
  useEffect(() => setShared(readSharedByDefault()), [])
  const isShared = householdMembers.length > 1

  return (
    <ReadingColumn>
      <div className="pt-2 lg:hidden">
        <Link href="/settings" className="inline-flex items-center gap-1 text-[15px] text-accent">
          <ChevronLeft size={18} />
          {t('Settings')}
        </Link>
      </div>
      <PageHeader title={t('Household')} />

      <SectionCard>
        <button
          type="button"
          onClick={() => setDrawer({ type: 'rename' })}
          className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left"
        >
          <span className="text-[17px] font-normal text-text">{t('Name')}</span>
          <span className="ml-auto flex items-center gap-1.5">
            <span className="text-[17px] font-normal text-text-2">
              {currentHousehold?.name ?? t('Untitled')}
            </span>
            <ChevronRight size={16} className="text-text-3" />
          </span>
        </button>

        {householdMembers.map((u) => (
          <UserRow
            key={u.id}
            user={u}
            isCurrentUser={u.id === currentPersonId}
            detail={t('{0} this month', formatMoney(monthlySpentBy(u.id)))}
            onClick={() => setDrawer({ type: 'member', userId: u.id })}
          />
        ))}

        <AddRow label={t('Add person')} onClick={() => setDrawer({ type: 'add' })} />
      </SectionCard>

      <p className="px-1 pt-3 text-[13px] leading-relaxed text-text-3">
        {t('Everyone in your household can be an owner of a transaction. People you add need no Ortho account; you can split any transaction between them.')}
      </p>

      {/* spec 050 — only meaningful once there is someone to share WITH. */}
      {isShared && (
        <SectionCard>
          <WidgetToggleRow
            icon={<Users size={18} />}
            label={t('Shared by default')}
            description={t('New transactions start owned by everyone in your household.')}
            checked={shared}
            onToggle={() => {
              const next = !shared
              setShared(next)
              writeSharedByDefault(next)
            }}
          />
        </SectionCard>
      )}

      {/* Linked banks (spec 024) — household members only. Kept reachable on
          desktop, where the section nav has no dedicated Linked banks entry. */}
      {currentHousehold && (
        <SectionCard>
          <LinkRow
            href="/settings/linked-banks"
            label={t('Linked banks')}
            peek={(() => {
              const n = linkedInstitutions.filter((i) => i.status === 'active').length
              return n ? t('{0} connected', n) : t('None connected')
            })()}
          />
        </SectionCard>
      )}

      <HouseholdDrawer mode={drawer} onClose={() => setDrawer(null)} />
    </ReadingColumn>
  )
}
