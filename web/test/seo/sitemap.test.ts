// spec 045 US4 — the sitemap. Under output: 'export' this renders to a static
// sitemap.xml at build (Route Handlers are supported; research.md §1).
import { describe, it, expect } from 'vitest'
import sitemap from '@/app/sitemap'
import { landingSlugs, localeForSlug } from '@/lib/onboarding/locales'
import { siteUrl, landingUrl } from '@/lib/siteUrl'

const entries = sitemap()

describe('sitemap — coverage', () => {
  it('lists exactly one entry per registry slug', () => {
    expect(entries).toHaveLength(landingSlugs().length)
  })

  it('is generated from the registry, not hand-listed', () => {
    // Adding a seventh language must add an entry with no edit to app/sitemap.ts.
    expect(entries.map((e) => e.url).sort()).toEqual(
      landingSlugs().map((s) => landingUrl(s)).sort(),
    )
  })

  it('uses absolute URLs on one consistent origin', () => {
    for (const entry of entries) {
      expect(() => new URL(entry.url)).not.toThrow()
      expect(entry.url.startsWith(siteUrl())).toBe(true)
    }
  })
})

describe('sitemap — hreflang alternates', () => {
  it('gives every entry all six alternates plus x-default', () => {
    for (const entry of entries) {
      const languages = (entry.alternates?.languages ?? {}) as Record<string, string>
      expect(Object.keys(languages)).toHaveLength(landingSlugs().length + 1)
      expect(languages['x-default']).toBe(landingUrl('en'))
      for (const slug of landingSlugs()) {
        expect(languages[localeForSlug(slug)!.hreflang]).toBe(landingUrl(slug))
      }
    }
  })

  it('points x-default at English — the same fallback the root router uses', () => {
    for (const entry of entries) {
      expect(entry.alternates?.languages?.['x-default']).toBe(landingUrl('en'))
    }
  })
})

describe('sitemap — exclusions', () => {
  it.each([
    '/dashboard',
    '/transactions',
    '/planning',
    '/housing',
    '/settings',
    '/routines',
    '/welcome',
    '/sign-in',
  ])('does not advertise the signed-in route %s', (path) => {
    for (const entry of entries) {
      expect(new URL(entry.url).pathname).not.toBe(path)
    }
  })

  it('lists only landing pages', () => {
    for (const entry of entries) {
      expect(new URL(entry.url).pathname).toMatch(/^\/landing\/[a-z]{2}$/)
    }
  })
})

describe('sitemap — determinism', () => {
  it('omits lastModified so the build stays reproducible', () => {
    // A build-time `new Date()` would churn the sitemap on every deploy without the
    // content changing, and make the build non-deterministic.
    for (const entry of entries) {
      expect(entry.lastModified).toBeUndefined()
    }
  })

  it('produces identical output across calls', () => {
    expect(JSON.stringify(sitemap())).toBe(JSON.stringify(sitemap()))
  })
})

describe('sitemap — hreflang keys are SEO-format tags (review 2026-08-24)', () => {
  it('no alternates key carries a Unicode extension subtag', () => {
    for (const entry of entries) {
      for (const key of Object.keys(entry.alternates?.languages ?? {})) {
        expect(key).not.toContain('-u-')
      }
    }
  })
})
