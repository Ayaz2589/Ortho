'use client'

// Spec 024 — Settings › Linked banks sub-page (same frame as settings/household).
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { useApp } from '@/lib/store'
import { PageHeader } from '@/components/ui'
import { ReadingColumn } from '@/components/layout'
import { LinkedBanks } from '@/components/settings/LinkedBanks'

export default function LinkedBanksPage() {
  const { t } = useApp()
  return (
    <ReadingColumn>
      <div className="pt-2">
        <Link
          href="/settings"
          className="inline-flex min-h-11 items-center gap-1 text-[15px] text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <ChevronLeft size={18} />
          {t('Settings')}
        </Link>
      </div>
      <PageHeader title={t('Linked banks')} />
      <LinkedBanks />
    </ReadingColumn>
  )
}
