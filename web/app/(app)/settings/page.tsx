'use client'

import { useApp } from '@/lib/store'
import { PageHeader } from '@/components/ui'
import { ReadingColumn } from '@/components/layout'
import { SectionCard, LinkRow } from '@/components/settings/rows'

// Mobile-only list view — on desktop the layout redirects to /settings/household.
export default function SettingsPage() {
  const { t } = useApp()

  return (
    <ReadingColumn>
      <PageHeader title={t('Settings')} />
      <div className="flex flex-col gap-6">
        <SectionCard>
          <LinkRow href="/settings/household" label={t('Household')} />
          <LinkRow href="/settings/planning" label={t('Planning')} />
          <LinkRow href="/settings/cards" label={t('Cards')} />
          <LinkRow href="/settings/subscription" label={t('Subscription')} />
        </SectionCard>
        <SectionCard>
          <LinkRow href="/settings/currency" label={t('Currency')} />
          <LinkRow href="/settings/language" label={t('Language')} />
          <LinkRow href="/settings/appearance" label={t('Appearance')} />
        </SectionCard>
        <SectionCard>
          <LinkRow href="/settings/account" label={t('Account')} />
        </SectionCard>
      </div>
    </ReadingColumn>
  )
}
