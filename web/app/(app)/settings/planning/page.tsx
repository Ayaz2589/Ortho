'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Legacy redirect (spec 038). Planning is now a top-level destination at
 * `/planning`; this former Settings sub-page bounces any old link/bookmark there so
 * nothing dead-ends (FR-004). Client redirect to match the rest of the fully-client,
 * statically-exported app (see app/page.tsx).
 */
export default function SettingsPlanningRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/planning')
  }, [router])
  return null
}
