'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/store'
import { useIsExpanded } from '@/lib/useMediaQuery'
import { parseIdParam } from '@/lib/formPageIntent'
import { PropertyFormPageClient } from '@/components/housing/PropertyFormPageClient'

/**
 * Mobile edit-property page (spec 025). Resolves the target property from the
 * store by `?id=`. Redirects to the list at desktop width (the Drawer stays
 * there) or when the id is missing / unresolvable (stale link, deleted while away).
 */
export default function EditPropertyPage() {
  const router = useRouter()
  const isExpanded = useIsExpanded()
  const { properties, loading } = useApp()
  const [id, setId] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    if (isExpanded) router.replace('/housing')
  }, [isExpanded, router])

  useEffect(() => {
    setId(parseIdParam(window.location.search))
  }, [])

  const editing = id ? properties.find((p) => p.id === id) ?? null : null

  useEffect(() => {
    if (isExpanded || id === undefined || loading) return
    if (!editing) router.replace('/housing')
  }, [isExpanded, id, loading, editing, router])

  if (isExpanded || id === undefined || !editing) return null

  return (
    <PropertyFormPageClient
      kind={editing.kind}
      editing={editing}
      onDone={() => router.push('/housing')}
    />
  )
}
