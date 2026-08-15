'use client'

import { useEffect } from 'react'
import type { LandingLocale } from '@/lib/onboarding/locales'
import type { LandingCatalog } from '@/lib/i18n/landing'
import { adoptLandingLanguage } from '@/lib/onboarding/adoptLanguage'

/**
 * spec 046 — the marketing page behind every /landing/{locale} route, and the app's
 * only surface written for someone who has no account yet.
 *
 * Replaces spec 045's inert `LandingPlaceholder`. Everything around it — routing,
 * per-locale metadata and hreflang, the statically imported catalog, the language
 * hand-off — was built by 045 and is consumed here, not rebuilt.
 *
 * Three decisions worth not undoing:
 *
 * 1. **The actions are plain `<a href>`.** Not `next/link`, not `router.push`. The
 *    link from a landing page to its tour is the entire SEO point of a per-language
 *    funnel, and a button carries nothing a crawler can follow. `next/link` would also
 *    prefetch `/tour/{slug}`, which spec 047 has not built yet — six 404s per view.
 *
 * 2. **Adoption rides the click handler.** `adoptLandingLanguage` is a synchronous
 *    `localStorage` write, and a click handler runs to completion before the browser
 *    begins navigating, so "adopt, then go" needs no `preventDefault` and no await.
 *    It is called on BOTH actions: someone who already has an account should still
 *    reach a sign-in screen in the language they were just reading.
 *
 * 3. **Nothing here is imported from the signed-in app** — not `lib/store` (which
 *    would bootstrap Supabase and the household data layer for someone with no
 *    account), not an app catalog (32–55 KB, resolved after mount, so it would flash
 *    English on a locale-fixed page), not even `components/ui.tsx`. Pinned by the
 *    module-graph guard in test/onboarding/landing-route.test.tsx.
 */
export function LandingView({
  locale,
  copy,
}: {
  locale: LandingLocale
  copy: LandingCatalog
}) {
  /**
   * Correct the DOCUMENT language. Only the root layout renders <html>, and it is
   * shared with the entire signed-in app, so the exported file ships `lang="en"` even
   * for /landing/es. The subtree `lang` below is what assistive tech resolves against
   * for this content; this effect fixes the document element too, so a real browser
   * (screen readers, translation prompts, font selection) sees es-ES.
   *
   * KNOWN LIMITATION (inherited from spec 045): the static HTML's initial
   * `<html lang>` is still `en`, so a crawler that does not execute JS reads that.
   * Language targeting is carried by the hreflang alternates, which ARE correct in the
   * static output. A complete fix means giving the landing routes their own root
   * layout, which requires moving every existing route into a route group.
   */
  useEffect(() => {
    const previous = document.documentElement.lang
    document.documentElement.lang = locale.locale
    return () => {
      document.documentElement.lang = previous
    }
  }, [locale.locale])

  // Viewing must change nothing (FR-004) — this runs only from a click, never an effect.
  const adopt = () => adoptLandingLanguage(locale.slug)
  const { landing } = copy

  return (
    // `lang` marks the subtree for assistive tech and for the correct font and line
    // handling of CJK and Bengali. `min-h-screen`, never `h-screen`: a fixed viewport
    // height fights spec 040's `zoom` on <html> and double-scrolls (PRs #104/#105).
    <div lang={locale.locale} className="min-h-screen bg-bg">
      {/* One centered reading column, capped at the constitution's 560px. On an
          ultrawide the margins stay empty, which is the intent — room to breathe,
          not room to cram — and it makes "no horizontal scroll at any width" a
          property of the layout rather than something to test by eye. */}
      <main className="mx-auto w-full max-w-[560px] px-6 py-12 sm:py-16">
        <div className="text-center">
          {/* The wordmark treatment from app/sign-in/page.tsx — one product, one front
              door. Not a heading: the proposition below is this page's <h1>. */}
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-text text-2xl font-light text-bg">
            O
          </div>
          <p className="mt-3 text-sm text-text-2">Ortho</p>

          <h1 className="mt-8 text-[32px] font-light leading-[1.15] tracking-tight text-text sm:text-[36px]">
            {landing.headline}
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-text-2">{landing.subhead}</p>

          {/* The prominent action. Carries PrimaryButton's treatment without importing
              it — that primitive renders a <button>, which cannot hold an href. */}
          <a
            href={`/tour/${locale.slug}`}
            onClick={adopt}
            className="mt-8 flex h-12 w-full items-center justify-center rounded-full bg-text text-[15px] font-normal text-bg transition-opacity hover:opacity-90"
          >
            {landing.primaryCta}
          </a>

          {/* The quieter one. Padded to a real touch target rather than left as bare
              inline text, and given its own <span> so the prompt and the link are
              separately addressable. */}
          <p className="mt-4 text-sm text-text-2">
            <span>{landing.secondaryPrompt}</span>{' '}
            <a
              href="/sign-in"
              onClick={adopt}
              className="ortho-interactive inline-block rounded-full px-3 py-2.5 font-normal text-accent"
            >
              {landing.secondaryCta}
            </a>
          </p>
        </div>

        {/* Below the fold on a phone, and deliberately so: US1 asks for the
            proposition and both actions above it, not the whole page. */}
        <ul className="mt-12 space-y-8 border-t border-hairline pt-12 text-left">
          {/* Mapped, never branched on locale: a market may ship two supporting ideas
              or four, and this renders whatever its catalog carries (US3). */}
          {landing.points.map((point) => (
            <li key={point.title}>
              <h2 className="text-[17px] font-normal text-text">{point.title}</h2>
              <p className="mt-1.5 text-[15px] leading-relaxed text-text-2">{point.body}</p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
