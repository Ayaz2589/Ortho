'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, LogOut } from 'lucide-react'
import { useApp } from '@/lib/store'
import { PageHeader } from '@/components/ui'
import { ReadingColumn } from '@/components/layout'
import { SectionCard, ActionRow } from '@/components/settings/rows'
import { FlagsSection } from '@/components/settings/flags-section'

export default function AccountPage() {
  const { currentUserEmail, signOut, t } = useApp()
  const [signingOut, setSigningOut] = useState(false)

  return (
    <ReadingColumn>
      <div className="pt-2 lg:hidden">
        <Link href="/settings" className="inline-flex items-center gap-1 text-[15px] text-accent">
          <ChevronLeft size={18} />
          {t('Settings')}
        </Link>
      </div>
      <PageHeader title={t('Account')} />
      <SectionCard>
        {signingOut ? (
          <div className="flex min-h-[60px] items-center gap-3 px-4 py-3">
            <span className="text-[15px] text-text-2">{t('Sign out of Ortho?')}</span>
            <span className="ml-auto flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSigningOut(false)}
                className="text-[15px] font-normal text-text-2"
              >
                {t('Cancel')}
              </button>
              <button
                type="button"
                onClick={() => void signOut()}
                className="text-[15px] font-normal text-destructive"
              >
                {t('Sign out')}
              </button>
            </span>
          </div>
        ) : (
          <ActionRow
            icon={<LogOut size={16} />}
            label={t('Sign out')}
            sub={currentUserEmail ?? undefined}
            destructive
            onClick={() => setSigningOut(true)}
          />
        )}
      </SectionCard>

      {/* Developer / feature flags — self-gated to test builds only. */}
      <FlagsSection />
    </ReadingColumn>
  )
}
