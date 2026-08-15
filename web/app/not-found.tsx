'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Capacitor } from '@capacitor/core'
import { detectLandingSlug, localeForSlug } from '@/lib/onboarding/locales'
import { landingCatalog } from '@/lib/i18n/landing'

/**
 * spec 045 US1 — the codebase's first not-found route, with two strictly separate
 * jobs.
 *
 * 1. A stale or mistyped landing link (`/landing/fr`, a retired campaign code) is
 *    recovered to the visitor's detected locale. This is the ONLY place that can
 *    happen: with output: 'export' and dynamicParams: false, an unlisted slug never
 *    reaches the app's routing at all — the static host serves this 404 document
 *    (research.md §5).
 *
 * 2. Every other path renders an ordinary not-found page.
 *
 * The scoping in (2) is the point. A blanket redirect-to-marketing would throw a
 * signed-in user out of the app the moment they mistyped an in-app URL — pinned by
 * the negative cases in test/onboarding/not-found.test.tsx.
 *
 * Calm per Constitution II/IV: no red, no error chrome, no apology — just a short
 * line and a way back. No `lib/store` import: this document is served for signed-out
 * visitors too, and must not bootstrap the household data layer.
 */
export default function NotFound() {
  const router = useRouter()
  const [recovering, setRecovering] = useState(false)
  const [slug, setSlug] = useState('en')

  useEffect(() => {
    setSlug(detectLandingSlug(navigator.language))

    // Same rule as the root router, for the same reason: the installed app must never
    // reach a marketing page. Reaching this branch on native would need something to
    // navigate to /landing/* inside the shell — nothing does today — but the guard is
    // one line and this is precisely the failure the feature exists to prevent.
    if (Capacitor.isNativePlatform()) return

    const path = window.location.pathname
    // The trailing slash matters: `/landing/fr` recovers, but `/landingpage` is an
    // unrelated path and must fall through to the ordinary page.
    if (!path.startsWith('/landing/')) return
    setRecovering(true)
    router.replace(`/landing/${detectLandingSlug(navigator.language)}`)
  }, [router])

  // Mid-recovery: render nothing rather than flashing "not found" at someone who
  // followed a legitimate — if outdated — link.
  if (recovering) return null

  // Localized from the funnel's own catalogs. This page is pre-auth, so it cannot use
  // the store's `t()` — and shipping it English-only would be a visible gap in a
  // product whose whole front door is language-specific. Resolved after mount (the
  // static document can't know the browser language), which is why it starts at 'en'.
  const copy = landingCatalog(slug)
  const locale = localeForSlug(slug)

  return (
    <div
      lang={locale?.locale}
      className="flex min-h-screen flex-col items-center justify-center bg-bg px-6"
    >
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-light tracking-tight text-text">Ortho</h1>
        <p className="mt-2 text-sm text-text-2">{copy.notFoundLine}</p>
        <a
          href="/"
          className="ortho-interactive mt-6 inline-block rounded-full px-5 py-2.5 text-[15px] font-normal text-accent"
          style={{ background: 'var(--chip-bg)' }}
        >
          {copy.notFoundCta}
        </a>
      </div>
    </div>
  )
}
