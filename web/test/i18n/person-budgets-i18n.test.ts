import { describe, it, expect } from 'vitest'
import bn from '@/lib/i18n/bn'
import es from '@/lib/i18n/es'
import ja from '@/lib/i18n/ja'
import zh from '@/lib/i18n/zh'
import ko from '@/lib/i18n/ko'

// spec 054 — every string per-person budgets introduce is present in ALL five catalogs
// (English is the identity key) with matching {0} placeholder arity. The "whose money"
// chips themselves ('Everyone', 'Whose money') are spec-051 keys, already covered.

const FEATURE_KEYS = [
  "{0}'s budget",
  "Only {0}'s limits are shown here, measured against their share of what the household spends. The household's own budgets stay under Everyone.",
]

const catalogs = { bn, es, ja, zh, ko } as Record<string, Record<string, string>>

const placeholders = (s: string): string[] => (s.match(/\{\d+\}/g) ?? []).sort()

describe('Per-person budget i18n (spec 054)', () => {
  for (const [lang, catalog] of Object.entries(catalogs)) {
    it(`${lang} has every key with matching placeholders`, () => {
      const missing = FEATURE_KEYS.filter((k) => !(k in catalog))
      expect(missing, `missing keys in ${lang}`).toEqual([])
      for (const k of FEATURE_KEYS) {
        expect(placeholders(catalog[k] ?? ''), `placeholders for "${k}" in ${lang}`).toEqual(
          placeholders(k),
        )
      }
    })
  }
})
