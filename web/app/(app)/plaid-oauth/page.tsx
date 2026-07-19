'use client'

/**
 * Spec 024 — the bank-OAuth return route (web embedded mode only,
 * contracts/link-session-lifecycle.md). Some banks bounce Plaid Link through
 * their own site; Plaid sends the member back HERE, and Link must resume with
 * the SAME stored link token plus receivedRedirectUri (Plaid's documented SPA
 * pattern). Registered in the Plaid Dashboard as APP_BASE_URL + /plaid-oauth.
 *
 * Outcomes are never swallowed (review 024): success redirects to Linked
 * banks (the new bank is in the refreshed list); a FAILED exchange stays here
 * with one calm line and the way back — the member who just typed their bank
 * credentials must never land on an unchanged page with zero explanation.
 *
 * @deprecated (spec 028) — part of the CONTAINED Plaid path. The route stays in
 * place (moving it would change the Plaid-Dashboard-registered redirect URI);
 * SimpleFIN needs no OAuth return route (token-paste flow). Kept wired for rollback.
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

const EmbeddedPlaidLink = dynamic(() => import('@/components/settings/deprecated/EmbeddedPlaidLink'), {
  ssr: false,
})

export default function PlaidOauthReturnPage() {
  const { t, refreshLinkedBanks } = useApp()
  const router = useRouter()
  // undefined = the client-side localStorage read hasn't happened yet (the
  // static export prerenders this page at build time, where storage doesn't
  // exist); null = read, nothing pending.
  const [pending, setPending] = useState<PendingLinkSession | null | undefined>(undefined)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    setPending(readPendingLinkSession(new Date()))
  }, [])

  async function finish(publicToken: string) {
    if (!pending) return
    const res = await completeLinkSession(pending.sessionId, publicToken)
    // Either way the single-use token is spent — a retry starts a fresh flow.
    clearPendingLinkSession()
    if (res.ok) {
      void refreshLinkedBanks()
      router.replace('/settings/linked-banks')
    } else {
      setPending(null)
      setNotice(
        res.code === 'provider_unreachable'
          ? t('Couldn’t reach the bank-connection service. Try again in a bit.')
          : t('The connection could not be completed. Try again.')
      )
    }
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
        ) : pending === null ? (
          <>
            {!notice && (
              <p className="text-[15px] text-text-2">{t('No bank connection is in progress.')}</p>
            )}
            <Link
              href="/settings/linked-banks"
              className="inline-flex min-h-11 items-center text-[15px] text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {t('Back to Linked banks')}
            </Link>
          </>
        ) : null}
        <p role="status" aria-live="polite" className="min-h-4 text-[13px] leading-relaxed text-text-3">
          {notice}
        </p>
      </div>
    </ReadingColumn>
  )
}
