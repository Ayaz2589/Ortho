'use client'

import { useEffect } from 'react'
import type { LandingLocale } from '@/lib/onboarding/locales'
import type { LandingCatalog } from '@/lib/i18n/landing'

/**
 * spec 045 US1 — the structural placeholder behind every /landing/{locale} route.
 * Feature 046 replaces this one file with the real marketing page (hero, the big
 * "Learn more" CTA, the smaller sign-in link); everything around it — routing,
 * metadata, the sitemap, language adoption — is already in place.
 *
 * Deliberately inert: no interactive controls, so there are no hover/focus states to
 * get wrong before there is anything to click. Deliberately isolated: no `lib/store`
 * (which would bootstrap Supabase and the whole household data layer on a page for
 * someone with no account) and no app catalog (32-55 KB, and resolved after mount —
 * it would flash English on a locale-fixed page). Its copy arrives statically from
 * the route, so the first painted frame is already in the right language.
 */
export function LandingPlaceholder({
  locale,
  copy,
}: {
  locale: LandingLocale
  copy: LandingCatalog
}) {
  /**
   * Correct the DOCUMENT language. Only the root layout renders <html>, and it is
   * shared with the entire signed-in app, so the exported file ships `lang="en"` even
   * for /landing/es. The subtree `lang` below is what assistive tech actually resolves
   * against for this content, and this effect fixes the document element too — so a
   * real browser (screen readers, translation prompts, font selection) sees es-ES.
   *
   * KNOWN LIMITATION: the static HTML's initial `<html lang>` is still `en`, so a
   * crawler that does not execute JS reads that. Language targeting is carried by the
   * hreflang alternates, which ARE correct in the static output, so the SEO impact is
   * limited. A complete fix means giving the landing routes their own root layout,
   * which requires moving every existing route into a route group — out of scope here,
   * and noted in specs/045-onboarding-foundation/quickstart.md.
   */
  useEffect(() => {
    const previous = document.documentElement.lang
    document.documentElement.lang = locale.locale
    return () => {
      document.documentElement.lang = previous
    }
  }, [locale.locale])

  return (
    // `lang` marks the subtree for assistive tech and for the correct font/line
    // handling of CJK and Bengali. The app ships a single English-tagged document
    // today, so this is a real accessibility gain, not decoration.
    <div
      lang={locale.locale}
      className="flex min-h-screen flex-col items-center justify-center bg-bg px-6"
    >
      <div className="w-full max-w-sm text-center">
        {/* The wordmark treatment from app/sign-in/page.tsx — one product, one
            front door. Tokens only, per Constitution I. */}
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-text text-2xl font-light text-bg">
          O
        </div>
        <h1 className="text-2xl font-light tracking-tight text-text">Ortho</h1>
        <p className="mt-1 text-sm text-text-2">{copy.placeholderLine}</p>
      </div>
    </div>
  )
}
