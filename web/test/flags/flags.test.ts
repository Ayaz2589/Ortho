// @vitest-environment jsdom
//
// spec 015 — the feature-flag registry: read/write round-trip and the
// production force-off safety invariant (FR-003, contract C-FF-4). Under
// Vitest NODE_ENV is 'test', so `isTestBuild()` is true by default; a
// `NEXT_PUBLIC_VERCEL_ENV=production` stub simulates prod.
//
// Spec 021: the cookie mirror of `bypassAuth` (needed only because the old
// server-side `proxy.ts` gate couldn't read localStorage) is gone — the
// client-side gate in `lib/store.tsx` reads `readFlags()` directly.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFlags, writeFlags, effectiveUseTestData } from '@/lib/flags'

describe('feature flags (test build)', () => {
  beforeEach(() => {
    localStorage.clear()
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

  it('effectiveUseTestData is implied by bypassAuth', () => {
    expect(effectiveUseTestData({ useTestData: false, bypassAuth: true })).toBe(true)
    expect(effectiveUseTestData({ useTestData: true, bypassAuth: false })).toBe(true)
    expect(effectiveUseTestData({ useTestData: false, bypassAuth: false })).toBe(false)
  })
})

describe('feature flags — production force-off (FR-003 / SC-004)', () => {
  beforeEach(() => {
    localStorage.clear()
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

  it('writeFlags is inert in production (no storage mutation)', () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production')
    writeFlags({ useTestData: true, bypassAuth: true })
    expect(localStorage.getItem('ortho.flags')).toBeNull()
  })
})
