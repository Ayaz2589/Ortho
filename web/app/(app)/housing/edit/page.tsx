'use client'

import { useEffect } from 'react'
import { useApp } from '@/lib/store'
import { parseIdParam } from '@/lib/formPageIntent'
import { useMobileFormPage } from '@/lib/useMobileFormPage'
import { PropertyFormPageClient } from '@/components/housing/PropertyFormPageClient'

/**
 * Mobile edit-property page (spec 025). Resolves the target from the store by
 * `?id=`. Redirects to the list at desktop width (the Drawer stays there) or when
 * the id is missing / unresolvable (stale link, deleted while away).
 */
export default function EditPropertyPage() {
  const { isExpanded, search, goList, replaceList } = useMobileFormPage('/housing')
  const { properties, loading } = useApp()

  const id = search === undefined ? undefined : parseIdParam(search)
  const editing = id ? properties.find((p) => p.id === id) ?? null : null

  useEffect(() => {
    if (isExpanded || search === undefined || loading) return
    if (!editing) replaceList()
  }, [isExpanded, search, loading, editing, replaceList])

  if (isExpanded || search === undefined || !editing) return null

  return (
    <PropertyFormPageClient kind={editing.kind} editing={editing} onDone={goList} />
  )
}
