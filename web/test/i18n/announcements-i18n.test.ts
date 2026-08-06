import { describe, it, expect } from 'vitest'
import bn from '@/lib/i18n/bn'
import es from '@/lib/i18n/es'
import ja from '@/lib/i18n/ja'
import zh from '@/lib/i18n/zh'
import ko from '@/lib/i18n/ko'
import { ANNOUNCEMENTS } from '@/components/announcements/registry'

// spec 042 (FR-014) — every user-facing string the feature-announcement popup
// introduces is present in ALL five catalogs (English is the identity key), with
// matching {0}/{1}/… placeholder arity. Registry copy keys are pulled straight
// from ANNOUNCEMENTS so a new announcement can't ship a missing translation.
// ('Financial health' is a spec-041 key covered by financial-health-i18n.test.ts.)

const CHROME_KEYS = ["What's new"]

const REGISTRY_KEYS = ANNOUNCEMENTS.flatMap((a) => [a.descriptionKey, a.cta.labelKey])

const FEATURE_KEYS = [...CHROME_KEYS, ...REGISTRY_KEYS]

const catalogs = { bn, es, ja, zh, ko } as Record<string, Record<string, string>>

const placeholders = (s: string): string[] => (s.match(/\{\d+\}/g) ?? []).sort()

describe('Feature-announcement i18n (spec 042)', () => {
  for (const [lang, catalog] of Object.entries(catalogs)) {
    it(`${lang} has every announcement key with matching placeholders`, () => {
      const missing = FEATURE_KEYS.filter((k) => !(k in catalog))
      expect(missing, `missing keys in ${lang}`).toEqual([])
      for (const k of FEATURE_KEYS) {
        expect(placeholders(catalog[k] ?? ''), `placeholders for "${k}" in ${lang}`).toEqual(
          placeholders(k)
        )
      }
    })
  }
})
