'use client'

/**
 * Spec 017 US4 — the discreet manual-refresh affordance. One quiet icon
 * button: no banner, no shimmer; completion is announced politely for screen
 * readers. Lives in the desktop Sidebar footer and the compact Transactions
 * header (the web mirror of iOS pull-to-refresh on the ledger).
 */
import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useApp } from '@/lib/store'

export function RefreshControl({ size = 18 }: { size?: number }) {
  const { refresh, refreshing, membershipStatus, t } = useApp()
  const [announce, setAnnounce] = useState(false)

  if (membershipStatus !== 'member') return null

  const handle = async () => {
    setAnnounce(false)
    const ok = await refresh()
    if (ok) setAnnounce(true)
  }

  return (
    <span className="inline-flex items-center">
      <button
        type="button"
        aria-label={t('Refresh')}
        title={t('Refresh')}
        disabled={refreshing}
        onClick={() => void handle()}
        className="flex h-10 w-10 items-center justify-center rounded-full text-text-3 transition-colors hover:text-text disabled:opacity-40"
      >
        <RefreshCw size={size} className={refreshing ? 'motion-safe:animate-spin' : undefined} />
      </button>
      <span aria-live="polite" className="sr-only">
        {announce ? t('Updated') : ''}
      </span>
    </span>
  )
}
