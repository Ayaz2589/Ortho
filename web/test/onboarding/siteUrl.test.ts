import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// spec 045 — canonical/alternate links and the sitemap all need one absolute origin
// (FR-002). No production domain is recorded in the repo yet, so resolution is layered
// with a documented development default (research.md §8).

const ENV_KEYS = ['NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_VERCEL_URL'] as const

/**
 * `siteUrl()` reads process.env at CALL time, not module scope — so these tests can
 * vary the environment without module-cache gymnastics. Next inlines
 * `process.env.NEXT_PUBLIC_*` at build time either way, so production is unaffected.
 */
async function loadSiteUrl() {
  return import('@/lib/siteUrl')
}

describe('siteUrl — origin resolution', () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k]
      delete process.env[k]
    }
  })

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('prefers NEXT_PUBLIC_SITE_URL', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://ortho.app'
    process.env.NEXT_PUBLIC_VERCEL_URL = 'ortho-abc123.vercel.app'
    const { siteUrl } = await loadSiteUrl()
    expect(siteUrl()).toBe('https://ortho.app')
  })

  it('falls back to the Vercel deployment host, adding the scheme', async () => {
    process.env.NEXT_PUBLIC_VERCEL_URL = 'ortho-abc123.vercel.app'
    const { siteUrl } = await loadSiteUrl()
    expect(siteUrl()).toBe('https://ortho-abc123.vercel.app')
  })

  it('falls back to the documented development default', async () => {
    const { siteUrl } = await loadSiteUrl()
    expect(siteUrl()).toBe('http://localhost:3000')
  })

  it('strips a trailing slash so joined paths never double up', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://ortho.app/'
    const { siteUrl } = await loadSiteUrl()
    expect(siteUrl()).toBe('https://ortho.app')
  })

  it('ignores a blank env value rather than producing an empty origin', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = '   '
    const { siteUrl } = await loadSiteUrl()
    expect(siteUrl()).toBe('http://localhost:3000')
  })

  it('always returns an absolute, parseable origin', async () => {
    for (const value of ['https://ortho.app', 'https://ortho.app/']) {
      process.env.NEXT_PUBLIC_SITE_URL = value
      const { siteUrl } = await loadSiteUrl()
      expect(() => new URL(siteUrl())).not.toThrow()
      expect(siteUrl().endsWith('/')).toBe(false)
    }
  })
})

describe('landingUrl', () => {
  it('builds an absolute landing URL from the resolved origin', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://ortho.app'
    const { landingUrl, siteUrl } = await loadSiteUrl()
    expect(landingUrl('es')).toBe('https://ortho.app/landing/es')
    expect(landingUrl('en')).toBe(`${siteUrl()}/landing/en`)
    delete process.env.NEXT_PUBLIC_SITE_URL
  })

  it('produces a URL for every registry slug', async () => {
    const { landingUrl } = await loadSiteUrl()
    const { landingSlugs } = await import('@/lib/onboarding/locales')
    for (const slug of landingSlugs()) {
      expect(() => new URL(landingUrl(slug))).not.toThrow()
      expect(landingUrl(slug)).toContain(`/landing/${slug}`)
    }
  })
})
