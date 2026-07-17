'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useIsExpanded } from '@/lib/useMediaQuery'
import { parseKindParam } from '@/lib/formPageIntent'
import { PropertyFormPageClient } from '@/components/housing/PropertyFormPageClient'
import type { PropertyKind } from '@/lib/types'

/**
 * Mobile add-property page (spec 025). Desktop keeps its in-place Drawer, so at
 * ≥1024px this redirects to the list. An optional `?kind=` skips the in-page
 * kind picker; otherwise the picker is the first step.
 */
export default function NewPropertyPage() {
  const router = useRouter()
  const isExpanded = useIsExpanded()
  // undefined = the URL hasn't been read yet (static export prerenders at build
  // time where window is absent); null = read, no preset kind.
  const [kind, setKind] = useState<PropertyKind | null | undefined>(undefined)

  useEffect(() => {
    if (isExpanded) router.replace('/housing')
  }, [isExpanded, router])

  useEffect(() => {
    setKind(parseKindParam(window.location.search))
  }, [])

  if (isExpanded || kind === undefined) return null

  return <PropertyFormPageClient kind={kind} onDone={() => router.push('/housing')} />
}
