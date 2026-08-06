'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { useApp } from '@/lib/store'
import { PageHeader, PrimaryButton } from '@/components/ui'
import { ReadingColumn } from '@/components/layout'
import { FinancialProfileForm } from '@/components/financial-health/FinancialProfileForm'
import { useFinancialProfileForm } from '@/components/financial-health/useFinancialProfileForm'

/**
 * Settings → Financial profile (spec 041, US3). The same questionnaire as a single
 * scrollable form (not a stepper). Saving re-scores and records a fresh baseline
 * snapshot, then returns to Settings.
 */
export default function FinancialProfileSettingsPage() {
  const { t } = useApp()
  const router = useRouter()
  const form = useFinancialProfileForm()
  const [done, setDone] = useState(false)

  const save = async () => {
    await form.submit()
    setDone(true)
    router.push('/settings')
  }

  return (
    <ReadingColumn>
      <div className="pt-2 lg:hidden">
        <Link href="/settings" className="inline-flex items-center gap-1 text-[15px] text-accent">
          <ChevronLeft size={18} />
          {t('Settings')}
        </Link>
      </div>
      <PageHeader title={t('Financial profile')} subtitle={t('Update this whenever your situation changes.')} />
      <FinancialProfileForm draft={form.draft} patch={form.patch} />
      <div className="mt-8">
        <PrimaryButton onClick={() => void save()} disabled={form.saving || !form.incomeValid}>
          {done ? t('Saved') : t('Save profile')}
        </PrimaryButton>
      </div>
    </ReadingColumn>
  )
}
