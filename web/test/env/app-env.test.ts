// spec 030 — the unified environment signal `appEnv()` and its production-safety
// invariant: any environment we cannot positively identify as non-production
// resolves to `prod` (deny-by-default), so auth-disable / test-data paths are
// provably impossible unless we can prove we are NOT in production.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { appEnv, isLocal, isStage, isProd } from '@/lib/app-env'
import { isTestBuild } from '@/lib/test-build'

// Clear the three inputs so each case starts from a known blank slate; Vitest
// itself sets NODE_ENV='test', so we stub it explicitly per case where it matters.
function clearEnv(): void {
  vi.stubEnv('NEXT_PUBLIC_APP_ENV', undefined)
  vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', undefined)
}

describe('appEnv() — resolution order', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('honors an explicit NEXT_PUBLIC_APP_ENV over everything else', () => {
    clearEnv()
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production') // would say prod
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'stage')
    expect(appEnv()).toBe('stage')

    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'local')
    expect(appEnv()).toBe('local')

    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'prod')
    expect(appEnv()).toBe('prod')
  })

  it('ignores a malformed NEXT_PUBLIC_APP_ENV and falls through', () => {
    clearEnv()
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'staging') // not one of local|stage|prod
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'preview')
    expect(appEnv()).toBe('stage')
  })

  it('maps NEXT_PUBLIC_VERCEL_ENV production/preview/development', () => {
    clearEnv()
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production')
    expect(appEnv()).toBe('prod')
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'preview')
    expect(appEnv()).toBe('stage')
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'development')
    expect(appEnv()).toBe('local')
  })

  it('falls back to NODE_ENV (test/development → local, production → prod)', () => {
    clearEnv()
    vi.stubEnv('NODE_ENV', 'test')
    expect(appEnv()).toBe('local')
    vi.stubEnv('NODE_ENV', 'development')
    expect(appEnv()).toBe('local')
    vi.stubEnv('NODE_ENV', 'production')
    expect(appEnv()).toBe('prod')
  })

  it('deny-by-default: an unidentifiable environment resolves to prod', () => {
    clearEnv()
    vi.stubEnv('NODE_ENV', undefined)
    expect(appEnv()).toBe('prod')
    expect(isProd()).toBe(true)
    expect(isLocal()).toBe(false)
    expect(isStage()).toBe(false)
  })
})

describe('isTestBuild() rides on appEnv() (unchanged truth table)', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is false only in production', () => {
    clearEnv()
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'prod')
    expect(isTestBuild()).toBe(false)

    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'stage')
    expect(isTestBuild()).toBe(true)

    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'local')
    expect(isTestBuild()).toBe(true)
  })

  it('production via NEXT_PUBLIC_VERCEL_ENV is not a test build', () => {
    clearEnv()
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production')
    expect(isTestBuild()).toBe(false)
  })
})
