'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useApp } from '@/lib/store'

/**
 * First-run gate (spec 041, FR-001/FR-012). Routes a signed-in user who has no
 * financial profile yet — and hasn't dismissed the prompt — into the questionnaire
 * once, after bootstrap. It never blocks the app: skipping writes neutral defaults
 * (so the profile is non-null) and a localStorage dismissal suppresses re-prompting.
 * Mounted once in the app Shell; renders nothing.
 */
const DISMISS_KEY = 'ortho.fhOnboardingDismissed'
const WELCOME_PATH = '/welcome/financial-profile'

export function onboardingDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export function dismissOnboarding(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1')
  } catch {}
}

export function FinancialHealthOnboardingGate() {
  const { loading, userFinancialProfile, currentUserId } = useApp()
  const router = useRouter()
  const pathname = usePathname()
  const redirected = useRef(false)

  useEffect(() => {
    if (loading || redirected.current) return
    if (!currentUserId || userFinancialProfile) return
    if (onboardingDismissed()) return
    // Need a real router + path to act; both are absent outside an App Router
    // (e.g. component tests that mount the shell without next/navigation).
    if (!pathname || typeof router?.replace !== 'function') return
    if (pathname.startsWith(WELCOME_PATH)) return
    redirected.current = true
    router.replace(WELCOME_PATH)
  }, [loading, userFinancialProfile, currentUserId, pathname, router])

  return null
}
