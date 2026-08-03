'use client'

import { Target } from 'lucide-react'
import { useApp } from '@/lib/store'
import { Placeholder } from '../placeholders'

/**
 * Goals widget body. Spec 035 keeps the calm placeholder; Section 4 (spec 039)
 * replaces it with savings-goal progress rows via `goalProgress`/`goalPacing`.
 * Body stays PROPLESS (decision D4).
 */
export function GoalsBody() {
  const { t } = useApp()
  return <Placeholder icon={<Target size={15} />} note={t('Preview')} rows={2} />
}
