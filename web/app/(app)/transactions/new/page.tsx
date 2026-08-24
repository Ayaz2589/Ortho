'use client'

import { useApp } from '@/lib/store'
import { parseTxNewParams } from '@/lib/formPageIntent'
import { useMobileFormPage } from '@/lib/useMobileFormPage'
import { TxFormPageClient } from '@/components/web/TxFormPageClient'

/**
 * Mobile add-transaction page (spec 025). Desktop keeps its in-place tray, so at
 * ≥1024px useMobileFormPage redirects to the list. Copy intent rides the query
 * string and is reconstructed from the store.
 */
export default function NewTransactionPage() {
  const { isExpanded, search, goList } = useMobileFormPage('/transactions')
  const { transactions, loading } = useApp()

  if (isExpanded || search === undefined) return null

  const params = parseTxNewParams(search)
  // A hard reload / deep link of a copy URL mounts before the ledger loads;
  // resolving against an empty store silently dropped the copy intent (the
  // form seeds state on first render only) — wait for the store like the
  // edit page does (review 2026-08-24).
  if (params.copyFrom && loading) return null
  const copying = params.copyFrom ? transactions.find((t) => t.id === params.copyFrom) ?? null : null

  return <TxFormPageClient copying={copying} onDone={goList} />
}
