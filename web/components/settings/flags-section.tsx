'use client'

import { useEffect, useState } from 'react'
import { FlaskConical, KeyRound } from 'lucide-react'
import { useApp } from '@/lib/store'
import { SectionLabel } from '@/components/ui'
import { SectionCard } from '@/components/settings/rows'
import { ChoiceRow } from '@/components/settings/ChoiceRows'
import { isTestBuild } from '@/lib/test-build'
import { readFlags, writeFlags, effectiveUseTestData, type FlagState } from '@/lib/flags'

/**
 * The Settings → Developer feature-flag section (spec 015). Rendered ONLY on
 * test builds — in a production build `isTestBuild()` is a build-time `false`,
 * so this component returns before any flag machinery and dead-code-eliminates.
 *
 * Toggling a flag switches the app's whole data source (live ⇄ in-memory seed),
 * a decision made when the Supabase client is constructed at bootstrap, so we
 * persist the new state and reload to re-bootstrap cleanly (contract C-TD-5).
 */
export function FlagsSection() {
  const { t } = useApp()
  const [flags, setFlags] = useState<FlagState>({ useTestData: false, bypassAuth: false })

  // Read persisted flags after mount (localStorage is client-only), mirroring
  // how Appearance is hydrated on the Settings page.
  useEffect(() => {
    setFlags(readFlags())
  }, [])

  if (!isTestBuild()) return null

  const apply = (next: FlagState) => {
    writeFlags(next)
    // Re-bootstrap against the new data source (live vs seed) from a clean slate.
    if (typeof window !== 'undefined') window.location.reload()
  }

  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>{t('Developer')}</SectionLabel>
      <SectionCard>
        <ChoiceRow
          icon={<FlaskConical size={16} />}
          label={t('Use test data')}
          active={effectiveUseTestData(flags)}
          onClick={() => apply({ ...flags, useTestData: !flags.useTestData })}
        />
        <ChoiceRow
          icon={<KeyRound size={16} />}
          label={t('Bypass auth')}
          active={flags.bypassAuth}
          onClick={() => apply({ ...flags, bypassAuth: !flags.bypassAuth })}
        />
      </SectionCard>
      <p className="px-1 text-[13px] leading-relaxed text-text-3">
        {t('Only visible on test builds. Test data runs the app on a disposable in-memory dataset — nothing is saved to your real account.')}
      </p>
    </section>
  )
}
