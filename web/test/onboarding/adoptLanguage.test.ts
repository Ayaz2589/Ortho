// @vitest-environment jsdom
// spec 045 US3 — language adoption. Without it the language-specific entry points are
// cosmetic: a visitor reads a Spanish page and is handed an English sign-in form.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { adoptLandingLanguage } from '@/lib/onboarding/adoptLanguage'
import { LANDING_LOCALES } from '@/lib/onboarding/locales'
import { asLanguage } from '@/lib/language'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('adoptLandingLanguage', () => {
  it('writes the app Language value, not the slug', () => {
    // Writing 'es' would round-trip through asLanguage() to the DEFAULT language,
    // silently discarding the visitor's choice — the exact bug this pins.
    adoptLandingLanguage('es')
    expect(localStorage.getItem('language')).toBe('Español')
    expect(asLanguage(localStorage.getItem('language'))).toBe('Español')
  })

  it.each(LANDING_LOCALES.map((e) => [e.slug, e.language] as const))(
    'adopts %s as %s',
    (slug, language) => {
      adoptLandingLanguage(slug)
      expect(localStorage.getItem('language')).toBe(language)
    },
  )

  it('writes a value the existing language machinery accepts for every locale', () => {
    for (const entry of LANDING_LOCALES) {
      adoptLandingLanguage(entry.slug)
      // asLanguage() falls back to the default for anything it doesn't recognize,
      // so a round-trip that preserves the value proves the write is well-formed.
      expect(asLanguage(localStorage.getItem('language'))).toBe(entry.language)
    }
  })

  it('writes nothing for an unrecognized slug', () => {
    adoptLandingLanguage('fr')
    expect(localStorage.getItem('language')).toBeNull()
  })

  it('leaves an existing preference untouched when the slug is unrecognized', () => {
    localStorage.setItem('language', '日本語')
    adoptLandingLanguage('xx')
    expect(localStorage.getItem('language')).toBe('日本語')
  })

  it('is a silent no-op when storage throws (FR-015)', () => {
    // Private browsing / disabled storage must not break navigation.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => adoptLandingLanguage('es')).not.toThrow()
  })

  it('overwrites a previous preference when the visitor continues in a new language', () => {
    localStorage.setItem('language', 'English')
    adoptLandingLanguage('ko')
    expect(localStorage.getItem('language')).toBe('한국어')
  })
})
