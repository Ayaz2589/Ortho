'use client'

import { useApp } from '@/lib/store'
import { parseTxNewParams } from '@/lib/formPageIntent'
import { useMobileFormPage } from '@/lib/useMobileFormPage'
import { TxFormPageClient } from '@/components/web/TxFormPageClient'

/**
 * Mobile add-transaction page (spec 025). Desktop keeps its in-place tray, so at
 * ≥1024px useMobileFormPage redirects to the list. Copy/settle-up intent rides
 * the query string and is reconstructed from the store.
 */
export default function NewTransactionPage() {
  const { isExpanded, search, goList } = useMobileFormPage('/transactions')
  const { transactions } = useApp()

  if (isExpanded || search === undefined) return null

  const params = parseTxNewParams(search)
  const copying = params.copyFrom ? transactions.find((t) => t.id === params.copyFrom) ?? null : null

  return (
    <TxFormPageClient copying={copying} initialTransfer={params.transfer} onDone={goList} />
  )
}
