'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Capacitor } from '@capacitor/core'
import { createClient } from '@/lib/supabase/client'
import { detectLandingSlug } from '@/lib/onboarding/locales'

/**
 * spec 045 US2 — the root router.
 *
 * `/` serves two audiences from one file. On the web it is the product's front door;
 * in the Capacitor build it is ALSO the installed app's entry point (capacitor.config.ts
 * `webDir: 'out'` wraps this same bundle). The three branches below are ordered so those
 * two roles can never be confused.
 *
 *   1. native            → /dashboard   (FR-004) — first, and synchronous
 *   2. signed-in web     → /dashboard   (FR-005)
 *   3. signed-out web    → /landing/{detected}  (FR-006)
 *
 * **Branch 1 is first and awaits nothing.** Not a stylistic preference: if the platform
 * check raced an async auth call, a slow or failed `getUser()` could let a marketing page
 * paint inside the App Store build. Ordering it first also spares the installed app a
 * launch round-trip. `test/onboarding/root-router.test.tsx` asserts that `getUser()` is
 * never *called* on native — the destination alone would pass even with the race present.
 *
 * `router.replace()`, never `window.location`: Capacitor's iOS asset router serves
 * index.html for any extensionless path (see lib/nav.ts), so a hard navigation here would
 * loop. Client navigations fetch segment data instead. `replace` not `push`, so the root
 * never becomes a back-button trap between marketing and the app.
 *
 * spec 021 note (preserved): this was a client redirect rather than a Server Component
 * `redirect()` because the app is a static export; that reasoning still holds — under
 * `output: 'export'` there is no server hop and no middleware to make this decision.
 */
export default function Home() {
  const router = useRouter()

  useEffect(() => {
    // 1. The installed app never shows marketing — checked before anything async.
    if (Capacitor.isNativePlatform()) {
      router.replace('/dashboard')
      return
    }

    let cancelled = false
    async function route() {
      const {
        data: { user },
      } = await createClient().auth.getUser()
      if (cancelled) return
      // 2/3. A returning user goes to their money; a newcomer gets a front door in
      // their own language.
      router.replace(user ? '/dashboard' : `/landing/${detectLandingSlug(navigator.language)}`)
    }
    void route()
    return () => {
      cancelled = true
    }
  }, [router])

  // Neutral hold while the decision resolves (FR-007) — never a flash of one
  // destination before the other. Unchanged from the previous behavior of this route.
  return null
}
