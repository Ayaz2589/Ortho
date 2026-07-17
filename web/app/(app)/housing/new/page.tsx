'use client'

import { parseKindParam } from '@/lib/formPageIntent'
import { useMobileFormPage } from '@/lib/useMobileFormPage'
import { PropertyFormPageClient } from '@/components/housing/PropertyFormPageClient'

/**
 * Mobile add-property page (spec 025). Desktop keeps its in-place Drawer, so at
 * ≥1024px useMobileFormPage redirects to the list. An optional `?kind=` skips the
 * in-page kind picker; otherwise the picker is the first step.
 */
export default function NewPropertyPage() {
  const { isExpanded, search, goList } = useMobileFormPage('/housing')

  if (isExpanded || search === undefined) return null

  return <PropertyFormPageClient kind={parseKindParam(search)} onDone={goList} />
}
