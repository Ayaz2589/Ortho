'use client'

import Link from 'next/link'
import { LayoutGrid } from 'lucide-react'
import { useApp } from '@/lib/store'

/**
 * Shown on the Dashboard when a member has turned every widget off (spec 034,
 * FR-009). Calm and non-alarmist — no red, no shimmer — it simply explains the
 * board is empty and links to Settings → Widgets to turn some back on.
 */
export function WidgetEmptyState() {
  const { t } = useApp()
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <span
        className="flex h-12 w-12 items-center justify-center rounded-2xl text-text-3"
        style={{ background: 'var(--chip-bg)' }}
      >
        <LayoutGrid size={22} strokeWidth={1.75} />
      </span>
      <p className="text-[15px] text-text-2">{t('Your dashboard is empty')}</p>
      <Link href="/settings/widgets" className="text-[15px] font-normal text-accent">
        {t('Choose widgets')}
      </Link>
    </div>
  )
}
