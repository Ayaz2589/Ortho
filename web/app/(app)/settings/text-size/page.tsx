'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Type } from 'lucide-react'
import { useApp } from '@/lib/store'
import { PageHeader } from '@/components/ui'
import { ReadingColumn } from '@/components/layout'
import { SectionCard } from '@/components/settings/rows'
import { ChoiceRow } from '@/components/settings/ChoiceRows'
import {
  type TextSize,
  TEXT_SIZES,
  DEFAULT_TEXT_SIZE,
  applyTextSize,
  readTextSize,
  writeTextSize,
} from '@/components/settings/textSize'

// Plainspoken label per size (spec 040). Kept here (not in the module) so the
// module stays presentation-free; the strings are `t()`-keyed for translation.
const LABELS: Record<TextSize, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  xlarge: 'X-Large',
}

// A calm magnitude cue: the same text icon rendered a little larger per step.
const ICON_SIZE: Record<TextSize, number> = { small: 15, medium: 17, large: 19, xlarge: 21 }

export default function TextSizePage() {
  const { t } = useApp()
  const [size, setSize] = useState<TextSize>(DEFAULT_TEXT_SIZE)

  useEffect(() => {
    const s = readTextSize()
    setSize(s)
    applyTextSize(s)
  }, [])

  const chooseSize = (next: TextSize) => {
    setSize(next)
    writeTextSize(next)
  }

  return (
    <ReadingColumn>
      <div className="pt-2 lg:hidden">
        <Link href="/settings" className="inline-flex items-center gap-1 text-[15px] text-accent">
          <ChevronLeft size={18} />
          {t('Settings')}
        </Link>
      </div>
      <PageHeader title={t('Text size')} />
      <p className="px-1 pb-1 text-[15px] text-text-2">
        {t('Choose how large text appears throughout the app.')}
      </p>
      <SectionCard>
        {TEXT_SIZES.map((s) => (
          <ChoiceRow
            key={s}
            icon={<Type size={ICON_SIZE[s]} />}
            label={t(LABELS[s])}
            active={size === s}
            onClick={() => chooseSize(s)}
          />
        ))}
      </SectionCard>
    </ReadingColumn>
  )
}
