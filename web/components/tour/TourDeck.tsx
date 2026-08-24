'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Capacitor } from '@capacitor/core'
import { markFunnelEntry } from '@/lib/onboarding/funnel'
import { adoptLandingLanguage } from '@/lib/onboarding/adoptLanguage'
import { nextScreen, prevScreen, swipeIntent, formatPosition } from '@/lib/onboarding/tour'
import type { LandingLocale } from '@/lib/onboarding/locales'
import type { TourCopy } from '@/lib/i18n/landing/tour'

/**
 * spec 047 — the learn-more tour. Five screens between the landing page and sign-in.
 *
 * Screens are CLIENT STATE, not routes. Six locales x five screens would be thirty
 * statically exported documents for no benefit, and the position is deliberately absent
 * from the address too: `useSearchParams` fails a production build without a Suspense
 * boundary, and a pushed history entry per screen would mean pressing Back five times to
 * leave a tour someone entered once (research.md §2).
 *
 * Deliberately isolated, like LandingPlaceholder: no `lib/store` (which would bootstrap
 * Supabase and the household data layer for someone with no account), no app catalog
 * (32-55 KB, resolved after mount, so it would flash English), and no `components/ui` —
 * that module imports the store, so `PrimaryButton` would drag the data layer in by the
 * back door. Its visual recipe is reproduced below in tokens instead.
 */
export function TourDeck({ locale, copy }: { locale: LandingLocale; copy: TourCopy }) {
  const router = useRouter()
  const total = copy.screens.length
  const [index, setIndex] = useState(0)

  /**
   * FR-011: the installed app must never show the tour. Nothing paints until this has
   * resolved — `null` rather than the first screen, because "one frame of marketing
   * inside the App Store build" is still a marketing page inside the App Store build.
   */
  const [checkedPlatform, setCheckedPlatform] = useState(false)
  const [native, setNative] = useState(false)
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      setNative(true)
      router.replace('/dashboard')
    }
    setCheckedPlatform(true)
  }, [router])

  /**
   * The ONE way out of the tour, for BOTH the finish action and Skip (FR-005/FR-006).
   *
   * Skip has no path of its own, and that is the point: the intuitive reading of Skip —
   * "they opted out, so don't mark them" — is wrong here. A visitor who skips is still a
   * funnel visitor, and dropping the marker would silently cost them the guided hand-off
   * into the financial-health questionnaire that spec 048 provides. Routing both exits
   * through one function means Skip cannot forget.
   *
   * Order matters: adopt the language before navigating, so the sign-in screen renders in
   * the language they were just reading. Both 045 modules swallow storage failures
   * internally; the catch here is a second line of defense in case that ever changes.
   * It SWALLOWS rather than rethrows — the visitor must always reach sign-in (spec edge
   * case: storage unavailable), and an error escaping a click handler would surface as a
   * dev error overlay over a tour that in fact worked.
   */
  const leaveForSignIn = useCallback(() => {
    try {
      adoptLandingLanguage(locale.slug)
      markFunnelEntry()
    } catch {
      // Nothing to recover: the marker is best-effort, and losing it costs only the
      // guided hand-off, never the journey.
    }
    // push, not replace: Back from sign-in should return to the tour.
    router.push('/sign-in')
  }, [locale.slug, router])

  const goNext = useCallback(() => setIndex((i) => nextScreen(i, total)), [total])
  const goPrev = useCallback(() => setIndex((i) => prevScreen(i, total)), [total])

  // Arrow keys on a desktop, where there is no gesture to make. Bound to the window
  // rather than the deck so it works without the visitor first clicking into it.
  useEffect(() => {
    // Nothing is listening before the platform check resolves, and nothing listens on
    // native: the deck is not on screen in either case, so a key press has no deck to
    // act on.
    if (!checkedPlatform || native) return
    function onKeyDown(event: KeyboardEvent) {
      // Cmd+← / Alt+← is browser Back (and →, Forward). Without this guard, that
      // keystroke would BOTH navigate away and step the deck, so the visitor returns
      // to a tour sitting on a different screen than the one they left.
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
      if (event.key === 'ArrowRight') goNext()
      else if (event.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [checkedPlatform, native, goNext, goPrev])

  // Swipe. A ref, not state: the start point is gesture bookkeeping, and re-rendering
  // the deck the moment a finger touches it would be wasted work.
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  function onTouchStart(event: React.TouchEvent) {
    const point = event.touches[0]
    touchStart.current = point ? { x: point.clientX, y: point.clientY } : null
  }

  function onTouchEnd(event: React.TouchEvent) {
    const start = touchStart.current
    // Cleared immediately: a touchEnd with no matching start (a cancelled gesture, a
    // second finger lifting) must be inert rather than replaying the last swipe.
    touchStart.current = null
    const point = event.changedTouches[0]
    if (!start || !point) return
    const intent = swipeIntent(point.clientX - start.x, point.clientY - start.y)
    if (intent === 'next') goNext()
    else if (intent === 'prev') goPrev()
  }

  if (!checkedPlatform || native) return null

  const screen = copy.screens[index]
  const isLast = index === total - 1

  return (
    // `lang` marks the subtree for assistive tech and for correct CJK/Bengali font and
    // line handling — the app ships a single English-tagged document (see
    // LandingPlaceholder's note on the document-level limitation).
    <div
      lang={locale.locale}
      role="region"
      aria-label={copy.regionLabel}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="flex flex-col bg-bg px-6 py-10"
      style={{ minHeight: 'calc(100dvh / var(--ui-zoom, 1))' }}
    >
      {/* Reading column capped and centered: money copy is unreadable spanning an
          ultrawide monitor, and the responsive contract caps reading at 560px. */}
      <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col">
        <div className="flex flex-1 flex-col justify-center">
          {/* Screens swap INSTANTLY — there is deliberately no slide or fade here.
              Calm over dense (Principle II), and it means the content is never mid-
              animation when someone arrives, which is what FR-008's no-flash rule is
              really protecting. It also makes reduced motion correct by construction:
              there is no screen motion to suppress. The controls below do carry real
              transitions (press feedback), and those are CSS-only, so they are covered
              both by their own `motion-reduce:` opt-out and by the global
              prefers-reduced-motion reset in globals.css. */}
          {/* Announced when the screen changes: advancing moves no focus, so without a
              live region a screen-reader user gets silence after pressing Next. */}
          <div aria-live="polite">
            <h1 className="text-[28px] font-light leading-tight tracking-tight text-text">
              {screen.title}
            </h1>
            {/* Full-strength `text`, not `text-2`: on a tour screen the body IS the
                primary reading text, and Principle V forbids secondary shades there
                (text-2 measures 3.87:1 in light mode — below AA). Hierarchy is carried
                by size and weight instead, which is what Principle I asks for anyway. */}
            <p className="mt-4 text-[17px] leading-relaxed text-text">{screen.body}</p>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-5">
          {/* Position as TEXT, with the dots as decoration only. Meaning is carried by
              position and weight, never by color or shape alone (Principle I/V). */}
          <div className="flex items-center justify-center gap-3">
            <span aria-hidden="true" className="flex gap-1.5">
              {copy.screens.map((_, i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background: i === index ? 'var(--text)' : 'var(--hairline)',
                  }}
                />
              ))}
            </span>
            {/* text-2, not text-3: FR-007 requires the position to be VISIBLE, and
                text-3 measures 2.18:1 in light and 2.85:1 in dark — unreadable, not
                merely quiet. text-2 is the app's established secondary shade. */}
            <span className="text-[13px] tabular-nums text-text-2">
              {formatPosition(copy.position, index + 1, total)}
            </span>
          </div>

          {/* DOM order is keyboard order: advance first (what most people came to do),
              then the two secondary actions. Back and Skip share a row rather than
              stacking, which keeps roughly 50px of chrome off the fold — the difference
              between the advance control being reachable or not on a small phone
              carrying the longest translation. */}
          <div className="flex flex-col gap-3">
            {/* PrimaryButton's recipe, reproduced in tokens rather than imported —
                components/ui.tsx imports lib/store (research §8). */}
            <button
              type="button"
              onClick={isLast ? leaveForSignIn : goNext}
              className="flex h-12 w-full items-center justify-center rounded-full text-[15px] font-normal transition-opacity motion-reduce:transition-none"
              style={{ background: 'var(--text)' }}
            >
              <span style={{ color: 'var(--bg)' }}>{isLast ? copy.finish : copy.next}</span>
            </button>

            <div className="flex gap-3">
              {index > 0 ? (
                <button
                  type="button"
                  onClick={goPrev}
                  className="flex h-12 flex-1 items-center justify-center rounded-full text-[15px] font-normal text-text-2 transition-opacity motion-reduce:transition-none"
                >
                  {copy.back}
                </button>
              ) : null}

              {/* On every screen, including the last (FR-004). text-2 rather than
                  text-3 for the same reason as the position: a required affordance may
                  be quiet, but it may not be unreadable. */}
              <button
                type="button"
                onClick={leaveForSignIn}
                className="flex h-12 flex-1 items-center justify-center rounded-full text-[15px] font-normal text-text-2 transition-opacity motion-reduce:transition-none"
              >
                {copy.skip}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
