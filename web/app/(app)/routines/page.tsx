'use client'

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { useApp } from '@/lib/store'
import { PageHeader } from '@/components/ui'
import { ReadingColumn } from '@/components/layout'
import { RoutinesList } from '@/components/routines/RoutinesList'

export default function RoutinesPage() {
  const { t } = useApp()

  return (
    <ReadingColumn>
      <div className="pt-2 lg:hidden">
        <Link href="/settings" className="inline-flex items-center gap-1 text-[15px] text-accent">
          <ChevronLeft size={18} />
          {t('Settings')}
        </Link>
      </div>
      <PageHeader title={t('Routines')} />
      <RoutinesList />
      <p className="mt-2 px-1 text-[13px] leading-relaxed text-text-3">
        {t('Routines are patterns we notice in your spending — recurring charges and regular habits. Confirming one helps future matching transactions get categorized automatically.')}
      </p>
    </ReadingColumn>
  )
}
