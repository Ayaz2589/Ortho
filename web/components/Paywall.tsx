'use client'

/**
 * The blocking gate for lapsed users (spec 018, FR-006/007). Rendered by the
 * Shell INSTEAD of children when gateState === 'lapsed' — no route bypasses it.
 * Calm by constitution: one headline, two plan rows, check-again, quiet sign
 * out. Prices come exclusively from the operator's Stripe configuration via
 * billing-plans (FR-011); failures render as short, non-alarmist copy in a
 * polite live region (017 lesson: the gate owns its own error surface).
 */
import { useEffect, useState } from 'react'
import { useApp } from '@/lib/store'
import { fetchPlans, formatPlanAmount, startCheckout, type PlanKey, type PlansInfo } from '@/lib/billing'
import { ReadingColumn } from '@/components/layout'
import { Card } from '@/components/ui'

export function Paywall() {
  const { t, refreshEntitlement, signOut } = useApp()
  const [plans, setPlans] = useState<PlansInfo | null>(null)
  const [plansFailed, setPlansFailed] = useState(false)
  const [busy, setBusy] = useState<'plans' | PlanKey | 'check' | null>('plans')
  const [notice, setNotice] = useState<string | null>(null)

  async function loadPlans() {
    setBusy('plans')
    setPlansFailed(false)
    const res = await fetchPlans()
    if (res.ok) setPlans(res.value)
    else setPlansFailed(true)
    setBusy(null)
  }

  useEffect(() => {
    // A lapsed payer returning from Stripe lands HERE, not on Settings (the
    // Shell still gates) — so the paywall itself must consume the checkout
    // return param, refresh, and say something calm (review 018 [5]). The
    // param is cleared so the announcement is one-shot ([7]).
    const param = new URLSearchParams(window.location.search).get('checkout')
    if (param === 'success') {
      window.history.replaceState({}, '', window.location.pathname)
      setNotice(t('Payment received — your subscription updates in a moment.'))
      void refreshEntitlement()
    } else if (param === 'cancelled') {
      window.history.replaceState({}, '', window.location.pathname)
      setNotice(t('Checkout cancelled.'))
    }
    void loadPlans()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function choose(plan: PlanKey) {
    setBusy(plan)
    setNotice(null)
    const res = await startCheckout(plan)
    if (res.ok) {
      window.location.assign(res.value.url)
      return
    }
    setBusy(null)
    setNotice(t('Could not open checkout. Try again.'))
  }

  async function checkAgain() {
    setBusy('check')
    setNotice(null)
    const checked = await refreshEntitlement()
    setBusy(null)
    // If the row flipped, the Shell unmounts us; if we are still here, say so
    // calmly — and never claim "no subscription" when we couldn't even check
    // (review 018 [6]).
    setNotice(
      checked
        ? t('No subscription found yet. It can take a minute after paying.')
        : t('Could not check just now. Try again.')
    )
  }

  const planRow = (key: PlanKey, label: string) => {
    const info = plans?.[key]
    if (!info) return null
    return (
      <button
        type="button"
        onClick={() => choose(key)}
        disabled={busy !== null}
        className="flex min-h-11 w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
      >
        <span className="text-sm text-text">{label}</span>
        <span className="text-sm tabular-nums text-text-2">
          {formatPlanAmount(info.amountCents)}{' '}
          {info.interval === 'year' ? t('a year') : t('a month')}
        </span>
      </button>
    )
  }

  return (
    <ReadingColumn className="py-16">
      <section aria-labelledby="paywall-title">
      <h1 id="paywall-title" className="text-lg text-text">{t('Your free month has ended')}</h1>
      <p className="mt-2 text-sm leading-relaxed text-text-2">
        {t('Keep using Ortho with a subscription. Everything you added is safe and waiting.')}
      </p>

      <div className="mt-8">
        {plans && (
          <Card className="divide-y divide-hairline p-0">
            {planRow('monthly', t('Monthly'))}
            {planRow('yearly', t('Yearly'))}
          </Card>
        )}
        {!plans && !plansFailed && (
          <p className="text-sm text-text-3">{t('Loading plans…')}</p>
        )}
        {plansFailed && (
          // role="status": the failure must be announced, not just visible
          // (review 018 [22]).
          <div role="status" aria-live="polite" className="flex items-center gap-3">
            <span className="text-sm text-text-2">{t('Plans are unavailable right now.')}</span>
            <button
              type="button"
              onClick={loadPlans}
              className="min-h-11 shrink-0 px-2 text-sm text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {t('Try again')}
            </button>
          </div>
        )}
      </div>

      {/* Status updates (checkout failure, check-again outcome) are announced. */}
      <p role="status" aria-live="polite" className="mt-6 min-h-5 text-sm text-text-2">
        {notice}
      </p>

      <div className="mt-8 flex items-center justify-between border-t border-hairline pt-4">
        <button
          type="button"
          onClick={checkAgain}
          disabled={busy !== null}
          className="min-h-11 px-2 text-sm text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
        >
          {busy === 'check' ? t('Checking…') : t('I subscribed — check again')}
        </button>
        <button
          type="button"
          onClick={() => void signOut()}
          className="min-h-11 px-2 text-sm text-text-3 transition-colors hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {t('Sign out')}
        </button>
      </div>
      </section>
    </ReadingColumn>
  )
}
