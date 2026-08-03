'use client'

import Link from 'next/link'
import { ChevronLeft, LayoutGrid } from 'lucide-react'
import { useApp } from '@/lib/store'
import { PageHeader } from '@/components/ui'
import { ReadingColumn } from '@/components/layout'
import { SectionCard } from '@/components/settings/rows'
import { WidgetToggleRow } from '@/components/widgets/WidgetToggleRow'
import { WIDGETS } from '@/lib/widgets/registry'
import { useWidgetPrefs } from '@/lib/widgets/useWidgetPrefs'
import { isWidgetEnabled } from '@/lib/widgets/preferences'

/**
 * Settings → Widgets (spec 034, FR-006). Lists every widget in the registry with
 * its name, description, and an on/off switch. Toggling persists per browser and
 * drives the Dashboard board. The list is a pure map over `WIDGETS`, so a newly
 * declared widget appears here automatically (FR-008).
 */
export default function WidgetsSettingsPage() {
  const { t } = useApp()
  const { prefs, setEnabled } = useWidgetPrefs()

  return (
    <ReadingColumn>
      <div className="pt-2 lg:hidden">
        <Link href="/settings" className="inline-flex items-center gap-1 text-[15px] text-accent">
          <ChevronLeft size={18} />
          {t('Settings')}
        </Link>
      </div>
      <PageHeader title={t('Widgets')} />
      <p className="mb-4 text-[13px] text-text-3">
        {t('Choose which widgets appear on your dashboard.')}
      </p>
      <SectionCard>
        {WIDGETS.map((def) => {
          const checked = isWidgetEnabled(def, prefs)
          return (
            <WidgetToggleRow
              key={def.id}
              icon={<LayoutGrid size={16} />}
              label={t(def.title)}
              description={t(def.description)}
              checked={checked}
              onToggle={() => setEnabled(def.id, !checked)}
            />
          )
        })}
      </SectionCard>
    </ReadingColumn>
  )
}
