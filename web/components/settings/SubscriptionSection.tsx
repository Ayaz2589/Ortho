'use client'

/**
 * Settings › Subscription (spec 018, US7 + US3 manage + US5 grace notice +
 * the checkout return path). One row that always answers "what's my
 * subscription situation?", with the matching action. Never a takeover,
 * never red (FR-025/026); async outcomes are announced via a polite live
 * region (017 lesson).
 */
import { useEffect, useRef, useState } from 'react'
import { CreditCard } from 'lucide-react'
import { useApp } from '@/lib/store'
import { SectionLabel } from '@/components/ui'
import { SectionCard } from '@/components/settings/rows'
import { daysRemaining } from '@/lib/entitlements'
import {
  fetchPlans,
  formatPlanAmount,
  openPortal,
  startCheckout,
  type PlanKey,
  type PlansInfo,
} from '@/lib/billing'

export function SubscriptionSection() {
  const { entitlement, gateState, locale, t, refreshEntitlement } = useApp()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [plans, setPlans] = useState<PlansInfo | null>(null)
  const firstPlanRef = useRef<HTMLButtonElement | null>(null)

  // Activating Subscribe removes the focused button; move focus onto the first
  // plan row so keyboard/SR users aren't dropped to <body> (review 018 [25]).
  useEffect(() => {
    if (choosing && plans) firstPlanRef.current?.focus()
  }, [choosing, plans])

  // Checkout hands users back to /settings?checkout=… (contract §2). Read it
  // once, refresh the entitlement, and say something calm — no confetti.
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('checkout')
    if (param === 'success' || param === 'cancelled') {
      // One-shot: clear the param so a later remount can't re-announce a stale
      // "payment received" (review 018 [7]).
      window.history.replaceState({}, '', window.location.pathname)
    }
    if (param === 'success') {
      setNotice(t('Payment received — your subscription updates in a moment.'))
      void refreshEntitlement()
    } else if (param === 'cancelled') {
      setNotice(t('Checkout cancelled.'))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!entitlement || !gateState) return null

  const fmtDate = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso)) : ''

  async function manage() {
    setBusy(true)
    setNotice(null)
    const res = await openPortal()
    setBusy(false)
    if (res.ok) window.location.assign(res.value.url)
    else setNotice(t('Could not open billing. Try again.'))
  }

  async function beginChoosing() {
    setChoosing(true)
    setNotice(null)
    const res = await fetchPlans()
    if (res.ok) setPlans(res.value)
    else {
      setChoosing(false)
      setNotice(t('Plans are unavailable right now.'))
    }
  }

  async function choose(plan: PlanKey) {
    setBusy(true)
    setNotice(null)
    const res = await startCheckout(plan)
    setBusy(false)
    if (res.ok) window.location.assign(res.value.url)
    else setNotice(t('Could not open checkout. Try again.'))
  }

  const status = (() => {
    if (entitlement.status === 'admin') {
      return { line: t('This account doesn’t need a subscription.'), action: null as 'subscribe' | 'manage' | null }
    }
    switch (gateState) {
      case 'trialing': {
        const days = daysRemaining(entitlement.access_expires_at, new Date().toISOString())
        return {
          // Flat key pair instead of a plural rule — the web catalogs have no
          // plural mechanism, and iOS mirrors the same two keys (review 018 [20]).
          line: days === 1 ? t('Free month — 1 day left') : t('Free month — {0} days left', days),
          action: 'subscribe' as const,
        }
      }
      case 'grace':
        return {
          line: t('There’s a billing issue. Your access continues while it gets sorted out.'),
          action: 'manage' as const,
        }
      case 'active':
        return entitlement.status === 'canceled'
          ? { line: t('Subscription ends {0}', fmtDate(entitlement.access_expires_at)), action: 'manage' as const }
          : {
              line:
                (entitlement.plan === 'yearly' ? t('Yearly plan') : t('Monthly plan')) +
                ' — ' +
                t('renews {0}', fmtDate(entitlement.access_expires_at)),
              action: 'manage' as const,
            }
      default:
        return { line: t('No active subscription.'), action: 'subscribe' as const }
    }
  })()

  return (
    <section className="flex flex-col gap-2" aria-labelledby="subscription-label">
      <SectionLabel>
        <span id="subscription-label">{t('Subscription')}</span>
      </SectionLabel>
      <SectionCard>
        <div className="flex min-h-[60px] items-center gap-3 px-4 py-3">
          <span className="text-text-3">
            <CreditCard size={16} />
          </span>
          {/* Static-on-mount content: no aria-live (an attribute on content that
              mounts WITH the region announces nothing — review 018 [23]); it is
              read in normal document order. */}
          <span className="min-w-0 text-[15px] text-text">{status.line}</span>
          <span className="ml-auto shrink-0">
            {status.action === 'manage' && (
              <button
                type="button"
                onClick={() => void manage()}
                disabled={busy}
                className="min-h-11 px-2 text-[15px] font-normal text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
              >
                {t('Manage')}
              </button>
            )}
            {status.action === 'subscribe' && !choosing && (
              <button
                type="button"
                onClick={() => void beginChoosing()}
                disabled={busy}
                className="min-h-11 px-2 text-[15px] font-normal text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
              >
                {t('Subscribe')}
              </button>
            )}
          </span>
        </div>
        {choosing && plans && (
          <div className="flex flex-col border-t border-hairline">
            {(['monthly', 'yearly'] as const).map((key) => (
              <button
                key={key}
                ref={key === 'monthly' ? firstPlanRef : undefined}
                type="button"
                onClick={() => void choose(key)}
                disabled={busy}
                className="flex min-h-11 items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
              >
                <span className="text-[15px] text-text">{key === 'monthly' ? t('Monthly') : t('Yearly')}</span>
                <span className="text-[15px] tabular-nums text-text-2">
                  {formatPlanAmount(plans[key].amountCents)}{' '}
                  {plans[key].interval === 'year' ? t('a year') : t('a month')}
                </span>
              </button>
            ))}
          </div>
        )}
      </SectionCard>
      <p role="status" aria-live="polite" className="min-h-4 px-1 text-[13px] leading-relaxed text-text-3">
        {notice}
      </p>
    </section>
  )
}
