// @vitest-environment jsdom
//
// spec 015 — the feature-flag registry: read/write round-trip, the bypass
// cookie mirror, and the production force-off safety invariant (FR-003,
// contract C-FF-4). Under Vitest NODE_ENV is 'test', so `isTestBuild()` is true
// by default; a `NEXT_PUBLIC_VERCEL_ENV=production` stub simulates prod.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFlags, writeFlags, effectiveUseTestData, BYPASS_AUTH_COOKIE } from '@/lib/flags'

function clearCookies() {
  for (const c of document.cookie.split(';')) {
    const name = c.split('=')[0].trim()
    if (name) document.cookie = `${name}=; path=/; max-age=0`
  }
}

describe('feature flags (test build)', () => {
  beforeEach(() => {
    localStorage.clear()
    clearCookies()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('defaults to all-off with no stored value', () => {
    expect(readFlags()).toEqual({ useTestData: false, bypassAuth: false })
  })

  it('round-trips through localStorage', () => {
    writeFlags({ useTestData: true, bypassAuth: false })
    expect(readFlags()).toEqual({ useTestData: true, bypassAuth: false })
    expect(JSON.parse(localStorage.getItem('ortho.flags')!)).toEqual({
      useTestData: true,
      bypassAuth: false,
    })
  })

  it('sets the bypass cookie only while bypassAuth is on', () => {
    writeFlags({ useTestData: false, bypassAuth: true })
    expect(document.cookie).toContain(`${BYPASS_AUTH_COOKIE}=1`)
    writeFlags({ useTestData: false, bypassAuth: false })
    expect(document.cookie).not.toContain(`${BYPASS_AUTH_COOKIE}=1`)
  })

  it('effectiveUseTestData is implied by bypassAuth', () => {
    expect(effectiveUseTestData({ useTestData: false, bypassAuth: true })).toBe(true)
    expect(effectiveUseTestData({ useTestData: true, bypassAuth: false })).toBe(true)
    expect(effectiveUseTestData({ useTestData: false, bypassAuth: false })).toBe(false)
  })
})

describe('feature flags — production force-off (FR-003 / SC-004)', () => {
  beforeEach(() => {
    localStorage.clear()
    clearCookies()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reads all-off in production even when a value is persisted', () => {
    // A value carried over from a test build / hand-edited in devtools.
    localStorage.setItem('ortho.flags', JSON.stringify({ useTestData: true, bypassAuth: true }))
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production')
    expect(readFlags()).toEqual({ useTestData: false, bypassAuth: false })
  })

  it('writeFlags is inert in production (no cookie, no storage mutation)', () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production')
    writeFlags({ useTestData: true, bypassAuth: true })
    expect(localStorage.getItem('ortho.flags')).toBeNull()
    expect(document.cookie).not.toContain(`${BYPASS_AUTH_COOKIE}=1`)
  })
})
