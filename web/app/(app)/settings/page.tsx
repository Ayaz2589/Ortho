'use client'

import { useApp } from '@/lib/store'
import { PageHeader } from '@/components/ui'
import { ReadingColumn } from '@/components/layout'
import { SectionCard, LinkRow } from '@/components/settings/rows'

// Mobile-only list view — on desktop the layout redirects to /settings/household.
export default function SettingsPage() {
  const { t, currentHousehold, linkedInstitutions } = useApp()

  return (
    <ReadingColumn>
      <PageHeader title={t('Settings')} />
      <div className="flex flex-col gap-6">
        <SectionCard>
          <LinkRow href="/settings/household" label={t('Household')} />
          {/* Linked banks (spec 024) — household members only; a user with no
              household never sees the entry (spec edge case). */}
          {currentHousehold && (
            <LinkRow
              href="/settings/linked-banks"
              label={t('Linked banks')}
              peek={(() => {
                const n = linkedInstitutions.filter((i) => i.status === 'active').length
                return n ? t('{0} connected', n) : t('None connected')
              })()}
            />
          )}
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
