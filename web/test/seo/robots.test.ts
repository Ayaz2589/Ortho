// spec 045 US4 — crawl rules. The app publishes none today; these are its first.
import { describe, it, expect } from 'vitest'
import robots from '@/app/robots'
import { siteUrl } from '@/lib/siteUrl'

const result = robots()
const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules
const allow = [rules?.allow ?? []].flat()
const disallow = [rules?.disallow ?? []].flat()

describe('robots — the indexable surface', () => {
  it('applies to every crawler', () => {
    expect(rules?.userAgent).toBe('*')
  })

  it('allows the landing pages', () => {
    expect(allow).toContain('/landing/')
  })

  it.each([
    '/dashboard',
    '/transactions',
    '/planning',
    '/housing',
    '/settings',
    '/routines',
    '/welcome',
    '/sign-in',
  ])('does not advertise %s for indexing', (path) => {
    // Not a security control — these are already behind authentication. It keeps
    // crawl budget on the pages that matter and stops empty pre-auth shells being
    // indexed as thin content.
    expect(disallow).toContain(path)
  })
})

describe('robots — sitemap reference', () => {
  it('points at the sitemap on the same resolved origin', () => {
    expect(result.sitemap).toBe(`${siteUrl()}/sitemap.xml`)
  })

  it('uses an absolute URL, as the standard requires', () => {
    expect(() => new URL(String(result.sitemap))).not.toThrow()
  })
})
