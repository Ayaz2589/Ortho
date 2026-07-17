'use client'

import { useEffect } from 'react'
import { useApp } from '@/lib/store'
import { parseIdParam } from '@/lib/formPageIntent'
import { useMobileFormPage } from '@/lib/useMobileFormPage'
import { TxFormPageClient } from '@/components/web/TxFormPageClient'

/**
 * Mobile edit-transaction page (spec 025). Resolves the target from the store by
 * `?id=`. Redirects to the list at desktop width (the tray stays there) or when
 * the id is missing / unresolvable (stale link, deleted while away) — mirroring
 * the overlay's auto-dismiss-on-delete.
 */
export default function EditTransactionPage() {
  const { isExpanded, search, goList, replaceList } = useMobileFormPage('/transactions')
  const { transactions, loading } = useApp()

  const id = search === undefined ? undefined : parseIdParam(search)
  const editing = id ? transactions.find((t) => t.id === id) ?? null : null

  useEffect(() => {
    if (isExpanded || search === undefined || loading) return
    if (!editing) replaceList()
  }, [isExpanded, search, loading, editing, replaceList])

  if (isExpanded || search === undefined || !editing) return null

  return <TxFormPageClient editing={editing} onDone={goList} />
}
