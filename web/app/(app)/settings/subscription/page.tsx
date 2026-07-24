'use client'

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { useApp } from '@/lib/store'
import { ReadingColumn } from '@/components/layout'
import { SubscriptionSection } from '@/components/settings/SubscriptionSection'

export default function SubscriptionPage() {
  const { t } = useApp()

  return (
    <ReadingColumn>
      <div className="pt-2 lg:hidden">
        <Link href="/settings" className="inline-flex items-center gap-1 text-[15px] text-accent">
          <ChevronLeft size={18} />
          {t('Settings')}
        </Link>
      </div>
      <SubscriptionSection />
    </ReadingColumn>
  )
}
