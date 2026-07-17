'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/store'
import { useIsExpanded } from '@/lib/useMediaQuery'
import { parseIdParam } from '@/lib/formPageIntent'
import { TxFormPageClient } from '@/components/web/TxFormPageClient'

/**
 * Mobile edit-transaction page (spec 025). Resolves the target transaction from
 * the store by `?id=`. Redirects to the list when viewed at desktop width (the
 * tray stays there) or when the id is missing / unresolvable (stale link, deleted
 * while away) — mirroring the overlay's auto-dismiss-on-delete.
 */
export default function EditTransactionPage() {
  const router = useRouter()
  const isExpanded = useIsExpanded()
  const { transactions, loading } = useApp()
  const [id, setId] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    if (isExpanded) router.replace('/transactions')
  }, [isExpanded, router])

  useEffect(() => {
    setId(parseIdParam(window.location.search))
  }, [])

  const editing = id ? transactions.find((t) => t.id === id) ?? null : null

  useEffect(() => {
    if (isExpanded || id === undefined || loading) return
    if (!editing) router.replace('/transactions')
  }, [isExpanded, id, loading, editing, router])

  if (isExpanded || id === undefined || !editing) return null

  return <TxFormPageClient editing={editing} onDone={() => router.push('/transactions')} />
}
