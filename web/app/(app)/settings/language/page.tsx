'use client'

import Link from 'next/link'
import { ChevronLeft, Languages } from 'lucide-react'
import { useApp } from '@/lib/store'
import { PageHeader } from '@/components/ui'
import { ReadingColumn } from '@/components/layout'
import { SectionCard } from '@/components/settings/rows'
import { ChoiceRow } from '@/components/settings/ChoiceRows'
import { LANGUAGES } from '@/lib/language'

export default function LanguagePage() {
  const { language, chooseLanguage, t } = useApp()

  return (
    <ReadingColumn>
      <div className="pt-2 lg:hidden">
        <Link href="/settings" className="inline-flex items-center gap-1 text-[15px] text-accent">
          <ChevronLeft size={18} />
          {t('Settings')}
        </Link>
      </div>
      <PageHeader title={t('Language')} />
      <SectionCard>
        {LANGUAGES.map((lang) => (
          <ChoiceRow
            key={lang}
            icon={<Languages size={16} />}
            label={lang}
            active={lang === language}
            onClick={() => chooseLanguage(lang)}
          />
        ))}
      </SectionCard>
    </ReadingColumn>
  )
}
