'use client'

import { ListOrdered } from 'lucide-react'
import { useApp } from '@/lib/store'
import { Placeholder } from '../placeholders'

/**
 * Activity widget body. Spec 035 keeps the calm placeholder; Section 6 (spec 041)
 * replaces it with the most-recent transactions feed. Body stays PROPLESS
 * (decision D4).
 */
export function ActivityBody() {
  const { t } = useApp()
  return <Placeholder icon={<ListOrdered size={15} />} note={t('Preview')} rows={3} />
}
