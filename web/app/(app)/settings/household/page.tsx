'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useApp } from '@/lib/store'
import { PageHeader } from '@/components/ui'
import { ReadingColumn } from '@/components/layout'
import { SectionCard, UserRow, AddRow, LinkRow } from '@/components/settings/rows'
import { HouseholdDrawer, type HouseholdDrawerMode } from '@/components/settings/HouseholdDrawer'
import { useSettleThreshold } from '@/lib/useSettleThreshold'

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
  const [settleThresholdCents, setSettleThresholdCents] = useSettleThreshold(currentHousehold?.id ?? '')

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

      {/* Settle-up reminder threshold (spec 031) */}
      {currentHousehold && (
        <SectionCard>
          <div className="flex min-h-[60px] items-center gap-3 px-4 py-3">
            <span className="text-[17px] font-normal text-text">{t('Settle-up reminder')}</span>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-[17px] font-normal text-text-3">$</span>
              <input
                type="number"
                inputMode="decimal"
                aria-label={t('Settle-up reminder amount')}
                value={settleThresholdCents / 100}
                onChange={(e) => {
                  const dollars = Number(e.target.value)
                  if (!isNaN(dollars) && dollars >= 0) setSettleThresholdCents(Math.round(dollars * 100))
                }}
                style={{ width: 70, textAlign: 'right', fontSize: 17, background: 'transparent', border: 0, outline: 'none', color: 'var(--text-2)' }}
              />
            </div>
          </div>
          <p className="px-4 pb-3 text-[13px] leading-relaxed text-text-3">
            {t('Show a reminder when a balance exceeds this amount')}
          </p>
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
