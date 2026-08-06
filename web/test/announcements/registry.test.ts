// spec 042 (Foundational) — the announcement registry. Ids are unique and the
// seeded Financial Health entry routes to the questionnaire and is relevant only
// while the user has no financial profile.
import { describe, it, expect } from 'vitest'
import { ANNOUNCEMENTS } from '@/components/announcements/registry'

describe('announcement registry', () => {
  it('has unique ids', () => {
    const ids = ANNOUNCEMENTS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every entry declares title, description, and a CTA with a label + route', () => {
    for (const a of ANNOUNCEMENTS) {
      expect(a.titleKey.length).toBeGreaterThan(0)
      expect(a.descriptionKey.length).toBeGreaterThan(0)
      expect(a.cta.labelKey.length).toBeGreaterThan(0)
      expect(a.cta.route.startsWith('/')).toBe(true)
    }
  })

  it('registers the Financial Health announcement pointing at the questionnaire', () => {
    const fh = ANNOUNCEMENTS.find((a) => a.id === 'financial-health')
    expect(fh).toBeTruthy()
    expect(fh!.cta.route).toBe('/welcome/financial-profile')
  })

  it('Financial Health is relevant only when there is no financial profile', () => {
    const fh = ANNOUNCEMENTS.find((a) => a.id === 'financial-health')!
    expect(fh.isRelevant).toBeTypeOf('function')
    expect(fh.isRelevant!({ userFinancialProfile: null })).toBe(true)
    expect(fh.isRelevant!({ userFinancialProfile: { id: 'p1' } })).toBe(false)
  })
})
