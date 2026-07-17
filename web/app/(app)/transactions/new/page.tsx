'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/store'
import { useIsExpanded } from '@/lib/useMediaQuery'
import { parseTxNewParams, type TxNewParams } from '@/lib/formPageIntent'
import { TxFormPageClient } from '@/components/web/TxFormPageClient'

/**
 * Mobile add-transaction page (spec 025). Desktop keeps its in-place tray, so at
 * ≥1024px this redirects to the list. Copy/settle-up intent rides the query
 * string and is read from `window.location` after mount (plaid-oauth precedent),
 * then reconstructed from the store.
 */
export default function NewTransactionPage() {
  const router = useRouter()
  const isExpanded = useIsExpanded()
  const { transactions } = useApp()
  const [params, setParams] = useState<TxNewParams | undefined>(undefined)

  useEffect(() => {
    if (isExpanded) router.replace('/transactions')
  }, [isExpanded, router])

  useEffect(() => {
    setParams(parseTxNewParams(window.location.search))
  }, [])

  if (isExpanded || params === undefined) return null

  const copying = params.copyFrom ? transactions.find((t) => t.id === params.copyFrom) ?? null : null

  return (
    <TxFormPageClient
      copying={copying}
      initialTransfer={params.transfer}
      onDone={() => router.push('/transactions')}
    />
  )
}
