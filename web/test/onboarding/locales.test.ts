import { describe, it, expect } from 'vitest'
import {
  LANDING_LOCALES,
  landingSlugs,
  localeForSlug,
  detectLandingSlug,
  type LandingSlug,
} from '@/lib/onboarding/locales'
import { LANGUAGES, localeForLanguage, type Language } from '@/lib/language'

// spec 045 — the locale registry is the feature's central contract (FR-001/FR-002) and is
// consumed by three follow-on features. These invariants are what make "adding a seventh
// language is ONE list edit" (SC-006) true rather than aspirational.

describe('LANDING_LOCALES — registry invariants', () => {
  it('has exactly one entry per supported language', () => {
    expect(LANDING_LOCALES).toHaveLength(6)
  })

  it('covers every app Language except System, in both directions', () => {
    // Forward: every registry entry names a real app Language.
    for (const entry of LANDING_LOCALES) {
      expect(LANGUAGES).toContain(entry.language)
    }
    // Reverse: every app Language except System has a landing page. This is the
    // direction that fails loudly when a 7th app language is added without one.
    const covered = LANDING_LOCALES.map((e) => e.language)
    const expected = LANGUAGES.filter((l) => l !== 'System')
    expect([...covered].sort()).toEqual([...expected].sort())
  })

  it('never exposes System — a preference, not a destination', () => {
    expect(LANDING_LOCALES.map((e) => e.language)).not.toContain('System' as Language)
  })

  it('has unique, lowercase-ASCII slugs needing no percent-encoding', () => {
    const slugs = LANDING_LOCALES.map((e) => e.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z]{2}$/)
      expect(encodeURIComponent(slug)).toBe(slug)
    }
  })

  it("keeps locale values identical to lib/language's map so the two cannot drift", () => {
    for (const entry of LANDING_LOCALES) {
      expect(entry.locale).toBe(localeForLanguage(entry.language))
    }
  })

  it("preserves Bengali's Latin-digits locale extension", () => {
    // Deliberate pre-existing choice in lib/language.ts (matches iOS): money and
    // dates use Western numerals under বাংলা. The registry must reuse it, not
    // simplify it to a plain bn-BD.
    const bn = LANDING_LOCALES.find((e) => e.slug === 'bn')
    expect(bn?.locale).toBe('bn-BD-u-nu-latn')
  })

  it('lists en first — the fallback and x-default target', () => {
    expect(landingSlugs()[0]).toBe('en')
    expect(LANDING_LOCALES[0].language).toBe('English')
  })

  it('exposes slugs matching the registry order', () => {
    expect(landingSlugs()).toEqual(LANDING_LOCALES.map((e) => e.slug))
  })
})

describe('localeForSlug', () => {
  it('resolves every registry slug', () => {
    for (const entry of LANDING_LOCALES) {
      expect(localeForSlug(entry.slug)).toEqual(entry)
    }
  })

  it('returns undefined for an unrecognized slug so callers choose the fallback', () => {
    expect(localeForSlug('fr')).toBeUndefined()
    expect(localeForSlug('')).toBeUndefined()
    expect(localeForSlug('EN')).toBeUndefined()
    expect(localeForSlug('../etc/passwd')).toBeUndefined()
  })
})

describe('detectLandingSlug', () => {
  it.each([
    ['es-ES', 'es'],
    ['es-MX', 'es'],
    ['es', 'es'],
    ['zh-TW', 'zh'],
    ['zh-Hans', 'zh'],
    ['zh', 'zh'],
    ['bn-BD', 'bn'],
    ['ja-JP', 'ja'],
    ['ko-KR', 'ko'],
    ['en-GB', 'en'],
  ])('collapses %s to %s', (tag, slug) => {
    expect(detectLandingSlug(tag)).toBe(slug as LandingSlug)
  })

  it.each(['pt-BR', 'fr-FR', 'de', 'hi-IN', 'ar'])(
    'falls back to en for the unsupported tag %s',
    (tag) => {
      expect(detectLandingSlug(tag)).toBe('en')
    },
  )

  it.each<[string | null | undefined, string]>([
    ['', 'empty string'],
    [null, 'null'],
    [undefined, 'undefined'],
  ])('falls back to en for %s input (%s)', (tag) => {
    expect(detectLandingSlug(tag)).toBe('en')
  })

  it('is case-insensitive', () => {
    expect(detectLandingSlug('EN-us')).toBe('en')
    expect(detectLandingSlug('ES-mx')).toBe('es')
  })

  it('never throws, whatever it is handed', () => {
    for (const junk of ['-', '---', 'x'.repeat(500), '🙂', 'en_US', '  ', '..']) {
      expect(() => detectLandingSlug(junk)).not.toThrow()
      expect(landingSlugs()).toContain(detectLandingSlug(junk))
    }
  })
})
