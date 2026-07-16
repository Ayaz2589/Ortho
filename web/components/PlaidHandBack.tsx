'use client'

/**
 * spec 024 (US2/FR-004) — completes a pending HOSTED Plaid Link session on the
 * Capacitor iOS shell. Mounted once in the (app) shell; renders nothing.
 *
 * Three triggers, one idempotent server exchange
 * (contracts/link-session-lifecycle.md):
 *  - mount            — cold-start recovery (the browser return relaunched us)
 *  - appUrlOpen       — the ortho://plaid-done hand-back; also routes to
 *                       Settings › Linked banks so the member sees the result
 *  - appStateChange   — foreground poll fallback when the hand-back was lost
 *
 * `session_incomplete` means "still in the browser" — keep waiting silently.
 * `session_expired` / `session_not_found` — clear the record, calm reset.
 * Any other failure keeps the record so the next foreground retries.
 * Embedded records are the Linked banks page's job, never handled here.
 */
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { useApp } from '@/lib/store'
import { completeLinkSession } from '@/lib/aggregation'
import { clearPendingLinkSession, readPendingLinkSession } from '@/lib/plaidLinkSession'

export const PLAID_DONE_URL = 'ortho://plaid-done'

export function PlaidHandBack() {
  const { refreshLinkedBanks } = useApp()
  const router = useRouter()
  const inFlight = useRef(false)

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    const attempt = async () => {
      if (inFlight.current) return
      const pending = readPendingLinkSession(new Date())
      if (!pending || pending.mode !== 'hosted') return
      inFlight.current = true
      try {
        const res = await completeLinkSession(pending.sessionId)
        if (res.ok) {
          clearPendingLinkSession()
          void refreshLinkedBanks()
        } else if (res.code === 'session_expired' || res.code === 'session_not_found') {
          clearPendingLinkSession()
        }
        // session_incomplete (and transient failures): keep the record; the
        // next hand-back/foreground retries — the server is idempotent.
      } finally {
        inFlight.current = false
      }
    }

    void attempt()

    const handles: Array<Promise<{ remove: () => void }>> = [
      App.addListener('appUrlOpen', ({ url }: { url: string }) => {
        if (!url.startsWith(PLAID_DONE_URL)) return
        router.push('/settings/linked-banks')
        void attempt()
      }) as Promise<{ remove: () => void }>,
      App.addListener('appStateChange', ({ isActive }: { isActive: boolean }) => {
        if (!isActive) return
        void attempt()
      }) as Promise<{ remove: () => void }>,
    ]

    return () => {
      for (const h of handles) void h.then((handle) => handle.remove())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
