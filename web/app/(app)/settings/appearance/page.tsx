'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Monitor, Sun, Moon } from 'lucide-react'
import { useApp } from '@/lib/store'
import { PageHeader } from '@/components/ui'
import { ReadingColumn } from '@/components/layout'
import { SectionCard } from '@/components/settings/rows'
import { ChoiceRow } from '@/components/settings/ChoiceRows'
import {
  type Appearance,
  applyAppearance,
  readAppearance,
  writeAppearance,
} from '@/components/settings/appearance'

export default function AppearancePage() {
  const { t } = useApp()
  const [appearance, setAppearance] = useState<Appearance>('system')

  useEffect(() => {
    const a = readAppearance()
    setAppearance(a)
    applyAppearance(a)
  }, [])

  const chooseAppearance = (mode: Appearance) => {
    setAppearance(mode)
    writeAppearance(mode)
  }

  return (
    <ReadingColumn>
      <div className="pt-2 lg:hidden">
        <Link href="/settings" className="inline-flex items-center gap-1 text-[15px] text-accent">
          <ChevronLeft size={18} />
          {t('Settings')}
        </Link>
      </div>
      <PageHeader title={t('Appearance')} />
      <SectionCard>
        <ChoiceRow
          icon={<Monitor size={16} />}
          label={t('System')}
          active={appearance === 'system'}
          onClick={() => chooseAppearance('system')}
        />
        <ChoiceRow
          icon={<Sun size={16} />}
          label={t('Light')}
          active={appearance === 'light'}
          onClick={() => chooseAppearance('light')}
        />
        <ChoiceRow
          icon={<Moon size={16} />}
          label={t('Dark')}
          active={appearance === 'dark'}
          onClick={() => chooseAppearance('dark')}
        />
      </SectionCard>
    </ReadingColumn>
  )
}
