'use client'

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { useApp } from '@/lib/store'
import { PageHeader } from '@/components/ui'
import { ReadingColumn } from '@/components/layout'
import { LocationConsentSection } from '@/components/settings/LocationConsentSection'

export default function LocationSettingsPage() {
  const { t } = useApp()

  return (
    <ReadingColumn>
      <div className="pt-2 lg:hidden">
        <Link href="/settings" className="inline-flex items-center gap-1 text-[15px] text-accent">
          <ChevronLeft size={18} />
          {t('Settings')}
        </Link>
      </div>
      <PageHeader title={t('Location')} />
      <LocationConsentSection />
    </ReadingColumn>
  )
}
