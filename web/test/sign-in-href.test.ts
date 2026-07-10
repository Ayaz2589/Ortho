// spec 021 — regression for the signed-out reload loop on the Capacitor iOS
// build. Capacitor's iOS asset router serves the root index.html for any
// extensionless path, so a hard nav to '/sign-in' re-served index.html (which
// redirects to /dashboard) and looped forever. The native target must be the
// exported file itself ('/sign-in.html'); web keeps the clean '/sign-in'.
import { describe, it, expect, vi, afterEach } from 'vitest'

const isNativePlatform = vi.fn()
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform } }))

import { signInHref } from '@/lib/nav'

describe('signInHref', () => {
  afterEach(() => isNativePlatform.mockReset())

  it('targets the exported sign-in.html on native (router serves index.html for extensionless paths)', () => {
    isNativePlatform.mockReturnValue(true)
    expect(signInHref()).toBe('/sign-in.html')
  })

  it('keeps the clean /sign-in URL on web', () => {
    isNativePlatform.mockReturnValue(false)
    expect(signInHref()).toBe('/sign-in')
  })
})
