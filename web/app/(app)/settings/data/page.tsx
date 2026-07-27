'use client'

// spec 032 — Settings → Data: download your household data as a PDF, or restore
// from one. Mobile shows a back link (desktop uses the secondary nav).

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { useApp } from '@/lib/store'
import { PageHeader } from '@/components/ui'
import { ReadingColumn } from '@/components/layout'
import { DataExportPanel } from '@/components/settings/DataExportPanel'
import { DataImportPanel } from '@/components/settings/DataImportPanel'

export default function DataPage() {
  const { t } = useApp()
  return (
    <ReadingColumn>
      <div className="pt-2 lg:hidden">
        <Link href="/settings" className="inline-flex items-center gap-1 text-[15px] text-accent">
          <ChevronLeft size={18} />
          {t('Settings')}
        </Link>
      </div>
      <PageHeader title={t('Data')} />
      <div className="flex flex-col gap-8">
        <DataExportPanel />
        <DataImportPanel />
      </div>
    </ReadingColumn>
  )
}
