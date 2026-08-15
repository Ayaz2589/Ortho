import { describe, it, expect } from 'vitest'
import bn from '@/lib/i18n/bn'
import es from '@/lib/i18n/es'
import ja from '@/lib/i18n/ja'
import zh from '@/lib/i18n/zh'
import ko from '@/lib/i18n/ko'

// Transaction-form picker unification — the one string this change introduces is
// present in ALL five catalogs with matching {n} placeholder arity. Every other
// label the accordion rows show (Owners / Paid by / Paid with / Deposit to /
// From / To / Not set / Saved) is a pre-existing key and is NOT re-listed here.

const FEATURE_KEYS = ['{0} people']

// The transfer From/To rows are plain `From`/`To` accordions now, so these
// aria-label-only keys have no source literal left (catalog-reachability would
// fail on them) — assert they are gone rather than leaving dead copy behind.
const REMOVED_KEYS = ['Transfer from', 'Transfer to']

const catalogs = { bn, es, ja, zh, ko } as Record<string, Record<string, string>>

const placeholders = (s: string): string[] => (s.match(/\{\d+\}/g) ?? []).sort()

describe('transaction-form picker i18n', () => {
  for (const [lang, catalog] of Object.entries(catalogs)) {
    it(`${lang} has every new key with matching placeholders`, () => {
      const missing = FEATURE_KEYS.filter((k) => !(k in catalog))
      expect(missing, `missing keys in ${lang}`).toEqual([])
      for (const k of FEATURE_KEYS) {
        expect(placeholders(catalog[k] ?? ''), `placeholders for "${k}" in ${lang}`).toEqual(
          placeholders(k)
        )
      }
    })

    it(`${lang} no longer carries the retired transfer aria-label keys`, () => {
      expect(REMOVED_KEYS.filter((k) => k in catalog)).toEqual([])
    })
  }
})
