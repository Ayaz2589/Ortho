'use client'

/**
 * Spec 024 — the bank-OAuth return route (web embedded mode only,
 * contracts/link-session-lifecycle.md). Some banks bounce Plaid Link through
 * their own site; Plaid sends the member back HERE, and Link must resume with
 * the SAME stored link token plus receivedRedirectUri (Plaid's documented SPA
 * pattern). Registered in the Plaid Dashboard as APP_BASE_URL + /plaid-oauth.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/store'
import { ReadingColumn } from '@/components/layout'
import { completeLinkSession } from '@/lib/aggregation'
import {
  clearPendingLinkSession,
  readPendingLinkSession,
  type PendingLinkSession,
} from '@/lib/plaidLinkSession'

const EmbeddedPlaidLink = dynamic(() => import('@/components/settings/EmbeddedPlaidLink'), {
  ssr: false,
})

export default function PlaidOauthReturnPage() {
  const { t, refreshLinkedBanks } = useApp()
  const router = useRouter()
  // 'none' until the client-side read proves otherwise: the static export
  // prerenders this page at build time, where localStorage doesn't exist.
  const [pending, setPending] = useState<PendingLinkSession | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    setPending(readPendingLinkSession(new Date()))
    setChecked(true)
  }, [])

  async function finish(publicToken: string) {
    if (!pending) return
    const res = await completeLinkSession(pending.sessionId, publicToken)
    clearPendingLinkSession()
    if (res.ok) void refreshLinkedBanks()
    router.replace('/settings/linked-banks')
  }

  function abandon() {
    clearPendingLinkSession()
    router.replace('/settings/linked-banks')
  }

  return (
    <ReadingColumn>
      <div className="flex flex-col gap-3 pt-8">
        {pending ? (
          <>
            <p className="text-[15px] text-text-2">{t('Finishing your bank connection…')}</p>
            <EmbeddedPlaidLink
              token={pending.linkToken}
              receivedRedirectUri={typeof window !== 'undefined' ? window.location.href : ''}
              onSuccess={(publicToken) => void finish(publicToken)}
              onExit={abandon}
            />
          </>
        ) : checked ? (
          <>
            <p className="text-[15px] text-text-2">{t('No bank connection is in progress.')}</p>
            <Link href="/settings/linked-banks" className="text-[15px] text-accent">
              {t('Back to Linked banks')}
            </Link>
          </>
        ) : null}
      </div>
    </ReadingColumn>
  )
}
