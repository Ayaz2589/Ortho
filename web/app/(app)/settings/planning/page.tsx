'use client'

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { useApp } from '@/lib/store'
import { PageHeader } from '@/components/ui'
import { ReadingColumn } from '@/components/layout'
import { SectionCard, LinkRow } from '@/components/settings/rows'

export default function PlanningPage() {
  const { budgets, goals, t } = useApp()

  return (
    <ReadingColumn>
      <div className="pt-2 lg:hidden">
        <Link href="/settings" className="inline-flex items-center gap-1 text-[15px] text-accent">
          <ChevronLeft size={18} />
          {t('Settings')}
        </Link>
      </div>
      <PageHeader title={t('Planning')} />
      <SectionCard>
        <LinkRow
          href="/budgets"
          label={t('Budgets')}
          peek={budgets.length ? t('{0} set', budgets.length) : t('None set')}
        />
        <LinkRow
          href="/goals"
          label={t('Goals')}
          peek={goals.length ? t('{0} set', goals.length) : t('None set')}
        />
      </SectionCard>
    </ReadingColumn>
  )
}
