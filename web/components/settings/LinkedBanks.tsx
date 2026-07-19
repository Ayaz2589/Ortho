'use client'

/**
 * Settings › Linked banks (spec 024). Disclosure-first, opt-in bank linking:
 * the household's standing connections with their accounts, a Connect flow
 * (embedded Plaid Link on web; Hosted Link in the external browser on the
 * Capacitor iOS shell — added with US2), and calm single-line outcomes
 * (FR-013 — never red, never raw provider text). Dark until the operator
 * configures the provider (FR-012).
 */
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Capacitor } from '@capacitor/core'
import { Landmark } from 'lucide-react'
import { useApp } from '@/lib/store'
import { SectionLabel } from '@/components/ui'
import { SectionCard } from '@/components/settings/rows'
import {
  checkLinkingAvailable,
  completeLinkSession,
  createLinkSession,
  disconnectInstitution,
} from '@/lib/aggregation'
import {
  clearPendingLinkSession,
  savePendingLinkSession,
} from '@/lib/plaidLinkSession'
import { mediumDate } from '@/lib/format'
import type { LinkedAccount } from '@/lib/types'

// @deprecated (spec 028) Plaid runner — contained under ./deprecated/, kept wired.
const EmbeddedPlaidLink = dynamic(() => import('./deprecated/EmbeddedPlaidLink'), { ssr: false })

type Availability = 'checking' | 'available' | 'unconfigured' | 'no-household'
type ActiveSession = { sessionId: string; linkToken: string }

export function LinkedBanks() {
  const { linkedInstitutions, linkedAccounts, refreshLinkedBanks, users, locale, t } = useApp()
  const [availability, setAvailability] = useState<Availability>('checking')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [session, setSession] = useState<ActiveSession | null>(null)
  /** Institution id awaiting the inline disconnect confirmation (US3). */
  const [confirming, setConfirming] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void checkLinkingAvailable().then((res) => {
      if (cancelled) return
      // The settings entry row hides for household-less users, but this page
      // is deep-linkable — never render a button that can only fail (review 024).
      if (!res.ok && res.code === 'not_configured') setAvailability('unconfigured')
      else if (!res.ok && res.code === 'not_household_member') setAvailability('no-household')
      else setAvailability('available')
    })
    return () => {
      cancelled = true
    }
  }, [])

  const noticeFor = (code: string): string => {
    switch (code) {
      case 'not_configured':
        return t('Bank linking isn’t available yet.')
      case 'provider_unreachable':
        return t('Couldn’t reach the bank-connection service. Try again in a bit.')
      case 'session_expired':
        return t('That connection attempt expired. Start again.')
      case 'not_household_member':
        return t('You need to be in a household to link a bank.')
      default:
        return t('The connection could not be completed. Try again.')
    }
  }

  async function connect() {
    setBusy(true)
    setNotice(null)
    // Plaid deprecates Link inside webviews: the Capacitor iOS shell uses
    // Hosted Link in the EXTERNAL browser (a non-app-origin top-level
    // navigation, which Capacitor opens out-of-process); the web page runs
    // embedded Link. Same session plumbing either way (research.md D2/D3).
    const mode = Capacitor.isNativePlatform() ? 'hosted' : 'embedded'
    // Plaid Link renders in the app's language when it can (allowlist enforced
    // server-side); locale is BCP-47, Plaid wants the bare language tag.
    const res = await createLinkSession(mode, locale.split('-')[0])
    setBusy(false)
    if (!res.ok) {
      if (res.code === 'not_configured') setAvailability('unconfigured')
      else setNotice(noticeFor(res.code))
      return
    }
    savePendingLinkSession({
      sessionId: res.value.sessionId,
      linkToken: res.value.linkToken,
      mode,
      expiresAt: res.value.expiresAt,
    })
    if (mode === 'hosted') {
      if (!res.value.hostedLinkUrl) {
        clearPendingLinkSession()
        setNotice(noticeFor('provider_error'))
        return
      }
      // PlaidHandBack (mounted in the app shell) finishes the session when
      // the member returns via ortho://plaid-done or a foreground.
      window.location.assign(res.value.hostedLinkUrl)
      return
    }
    setSession({ sessionId: res.value.sessionId, linkToken: res.value.linkToken })
  }

  async function finish(sessionId: string, publicToken: string) {
    setSession(null)
    setBusy(true)
    const res = await completeLinkSession(sessionId, publicToken)
    setBusy(false)
    clearPendingLinkSession()
    if (res.ok) {
      setNotice(t('Bank connected.'))
      void refreshLinkedBanks()
    } else {
      setNotice(noticeFor(res.code))
    }
  }

  function abandon() {
    // The member closed Link: calm reset, no error tone (US1-3 / US2-4).
    setSession(null)
    clearPendingLinkSession()
  }

  async function disconnect(institutionId: string) {
    setConfirming(null)
    setBusy(true)
    setNotice(null)
    const res = await disconnectInstitution(institutionId)
    setBusy(false)
    if (res.ok) {
      setNotice(t('Bank disconnected.'))
      void refreshLinkedBanks()
    } else if (res.code === 'provider_unreachable') {
      // Nothing changed server-side (FR-009) — same calm line, retryable.
      setNotice(noticeFor('provider_unreachable'))
    } else {
      setNotice(t('Disconnecting didn’t go through. Try again.'))
    }
  }

  const active = linkedInstitutions.filter((i) => i.status === 'active')
  const accountsFor = (institutionId: string): LinkedAccount[] =>
    linkedAccounts.filter((a) => a.institution_id === institutionId)

  /** US4 attribution: any member sees who connected a bank and when.
   *  mediumDate reuses format.ts's cached per-(locale,options) formatter —
   *  never construct Intl.DateTimeFormat in a render path (spec 023 P2). */
  const connectedLine = (createdBy: string, createdAt: string): string => {
    const name = users.find((u) => u.id === createdBy)?.name ?? ''
    return t('Connected by {0} · {1}', name, mediumDate(new Date(createdAt), locale))
  }

  return (
    <section className="flex flex-col gap-2" aria-labelledby="linked-banks-label">
      <SectionLabel>
        <span id="linked-banks-label">{t('Linked banks')}</span>
      </SectionLabel>

      <SectionCard>
        {/* Disclosure before anything else (FR-002): what leaves the device,
            what never does, and that linking is optional. */}
        <p className="px-4 pb-1 pt-3 text-[13px] leading-relaxed text-text-3">
          {t(
            'Bank sign-in happens with Plaid, a bank-connection service. Ortho never sees your bank username or password — it only receives account names, types, and last-4 digits. You can disconnect at any time, and adding transactions yourself or importing statements always stays available.'
          )}
        </p>

        {availability === 'unconfigured' ? (
          <p className="px-4 pb-3 pt-1 text-[15px] text-text-2">
            {t('Bank linking isn’t available yet.')}
          </p>
        ) : availability === 'no-household' ? (
          <p className="px-4 pb-3 pt-1 text-[15px] text-text-2">
            {t('You need to be in a household to link a bank.')}
          </p>
        ) : (
          <div className="flex min-h-[52px] items-center px-4 py-2">
            <span className="text-text-3">
              <Landmark size={16} />
            </span>
            <button
              type="button"
              onClick={() => void connect()}
              disabled={busy || availability === 'checking'}
              className="ml-3 min-h-11 text-[15px] font-normal text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
            >
              {t('Connect a bank')}
            </button>
          </div>
        )}
      </SectionCard>

      {active.length > 0 && (
        <SectionCard>
          {active.map((inst) => (
            <div key={inst.id} className="flex flex-col px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="min-w-0 text-[15px] text-text">
                  {inst.institution_name || t('Linked bank')}
                </span>
                <span className="ml-auto shrink-0">
                  {confirming === inst.id ? (
                    // role=group + label so the confirm prompt is announced, and
                    // autoFocus on the confirm action so activating "Disconnect"
                    // (which unmounts the trigger) moves focus here instead of
                    // dropping it to <body> and silently for assistive tech.
                    <span
                      className="flex items-center gap-2"
                      role="group"
                      aria-label={t('Disconnect this bank?')}
                    >
                      <span className="text-[13px] text-text-2">{t('Disconnect this bank?')}</span>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        className="min-h-11 px-2 text-[15px] font-normal text-text-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        {t('Cancel')}
                      </button>
                      <button
                        type="button"
                        autoFocus
                        onClick={() => void disconnect(inst.id)}
                        disabled={busy}
                        className="min-h-11 px-2 text-[15px] font-normal text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
                      >
                        {t('Disconnect')}
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(inst.id)}
                      disabled={busy}
                      className="min-h-11 px-2 text-[15px] font-normal text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
                    >
                      {t('Disconnect')}
                    </button>
                  )}
                </span>
              </div>
              <ul className="mt-1 flex flex-col gap-0.5">
                {accountsFor(inst.id).map((acct) => (
                  <li key={acct.id} className="flex items-baseline gap-2 text-[13px] text-text-2">
                    <span>{acct.name}</span>
                    <span className="text-text-3">
                      {acct.mask ? `•••• ${acct.mask}` : ''}
                      {acct.mask && (acct.account_subtype || acct.account_type) ? ' · ' : ''}
                      {acct.account_subtype ?? acct.account_type}
                    </span>
                  </li>
                ))}
              </ul>
              <span className="mt-1 text-[12px] text-text-3">
                {connectedLine(inst.created_by, inst.created_at)}
              </span>
            </div>
          ))}
        </SectionCard>
      )}

      {session && (
        <EmbeddedPlaidLink
          token={session.linkToken}
          onSuccess={(publicToken) => void finish(session.sessionId, publicToken)}
          onExit={abandon}
        />
      )}

      <p role="status" aria-live="polite" className="min-h-4 px-1 text-[13px] leading-relaxed text-text-3">
        {notice}
      </p>
    </section>
  )
}
