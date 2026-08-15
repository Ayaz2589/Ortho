'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Capacitor } from '@capacitor/core'
import { detectLandingSlug } from '@/lib/onboarding/locales'

/**
 * spec 045 US1 — the bare /landing address. A campaign link, a shortened URL or a
 * hand-typed address that stops at /landing must not dead-end (FR-011).
 *
 * Under output: 'export' there is no config-level redirect available (research.md
 * §1), so this is a real route that forwards on mount. It renders nothing of its own
 * — flashing one language's page on the way to another's would be worse than the
 * brief blank.
 */
export default function LandingIndex() {
  const router = useRouter()

  useEffect(() => {
    // Defense in depth, matching the root router: nothing in the installed app links
    // here, but if anything ever did, it must land in the app rather than marketing.
    if (Capacitor.isNativePlatform()) {
      router.replace('/dashboard')
      return
    }
    router.replace(`/landing/${detectLandingSlug(navigator.language)}`)
  }, [router])

  // `replace`, not `push`: the forwarding hop must never sit in the back stack.
  return null
}
