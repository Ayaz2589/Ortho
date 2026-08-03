'use client'

import { Store } from 'lucide-react'
import { useApp } from '@/lib/store'
import { Placeholder } from '../placeholders'

/**
 * Top-merchants widget body. Spec 035 keeps the calm placeholder; Section 5 (spec
 * 040) replaces it with the top-5 merchants by spend over the active window. Body
 * stays PROPLESS (decision D4).
 */
export function TopMerchantsBody() {
  const { t } = useApp()
  return <Placeholder icon={<Store size={15} />} note={t('Preview')} rows={2} />
}
