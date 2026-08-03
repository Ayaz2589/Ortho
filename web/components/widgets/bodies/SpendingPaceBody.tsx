'use client'

import { Gauge } from 'lucide-react'
import { useApp } from '@/lib/store'
import { Placeholder } from '../placeholders'

/**
 * Spending-pace widget body. Spec 035 keeps the calm placeholder; Section 2 (spec
 * 037) replaces it with the trailing-30-day trend (the one widget with a recharts
 * leaf). Body stays PROPLESS (decision D4).
 */
export function SpendingPaceBody() {
  const { t } = useApp()
  return <Placeholder icon={<Gauge size={15} />} note={t('Preview')} rows={3} />
}
