'use client'

import { Wallet } from 'lucide-react'
import { useApp } from '@/lib/store'
import { Placeholder } from '../placeholders'

/**
 * Net-summary widget body. Spec 035 keeps the calm placeholder; Section 1 (spec
 * 036) replaces it with income-vs-expense figures read from `useApp()` +
 * `useDashboardScopeContext()`. Body stays PROPLESS (decision D4).
 */
export function NetSummaryBody() {
  const { t } = useApp()
  return <Placeholder icon={<Wallet size={15} />} note={t('Preview')} rows={4} />
}
