// spec 030 — local/stage auto-login gating. The load-bearing test is the
// production-safety invariant: auto-login MUST be impossible in production even
// with the opt-in and credentials present. Triple-gated (env + opt-in + creds).
import { describe, it, expect, afterEach, vi } from 'vitest'
import { autoLoginEnabled, autoLoginCreds } from '@/lib/auth/autoLogin'

function setEnv(opts: {
  appEnv?: string
  vercel?: string
  optIn?: string
  email?: string
  password?: string
}): void {
  vi.stubEnv('NEXT_PUBLIC_APP_ENV', opts.appEnv)
  vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', opts.vercel)
  vi.stubEnv('NEXT_PUBLIC_DEV_AUTOLOGIN', opts.optIn)
  vi.stubEnv('NEXT_PUBLIC_DEV_AUTOLOGIN_EMAIL', opts.email)
  vi.stubEnv('NEXT_PUBLIC_DEV_AUTOLOGIN_PASSWORD', opts.password)
}

const CREDS = { email: 'seed@ortho.test', password: 'seed-password' }

describe('autoLoginEnabled() — production is never auto-login', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is false in production even with opt-in + credentials', () => {
    setEnv({ appEnv: 'prod', optIn: '1', ...CREDS })
    expect(autoLoginEnabled()).toBe(false)
  })

  it('is false when the environment cannot be proven non-prod (deny-by-default)', () => {
    // No app/vercel signal and NODE_ENV cleared → appEnv() denies to prod.
    setEnv({ optIn: '1', ...CREDS })
    vi.stubEnv('NODE_ENV', undefined)
    expect(autoLoginEnabled()).toBe(false)
  })

  it('is false without the explicit opt-in, even in local with creds', () => {
    setEnv({ appEnv: 'local', ...CREDS })
    expect(autoLoginEnabled()).toBe(false)
  })

  it('is false when credentials are incomplete', () => {
    setEnv({ appEnv: 'local', optIn: '1', email: CREDS.email })
    expect(autoLoginEnabled()).toBe(false)
    setEnv({ appEnv: 'local', optIn: '1', password: CREDS.password })
    expect(autoLoginEnabled()).toBe(false)
  })

  it('is true in local and stage with opt-in + credentials', () => {
    setEnv({ appEnv: 'local', optIn: '1', ...CREDS })
    expect(autoLoginEnabled()).toBe(true)
    setEnv({ appEnv: 'stage', optIn: '1', ...CREDS })
    expect(autoLoginEnabled()).toBe(true)
  })
})

describe('autoLoginCreds()', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('returns the pair only when both are set', () => {
    setEnv({ ...CREDS })
    expect(autoLoginCreds()).toEqual(CREDS)
    setEnv({ email: CREDS.email })
    expect(autoLoginCreds()).toBeNull()
    setEnv({})
    expect(autoLoginCreds()).toBeNull()
  })
})
