import { describe, it, expect } from 'vitest'
import bn from '@/lib/i18n/bn'
import es from '@/lib/i18n/es'
import ja from '@/lib/i18n/ja'
import zh from '@/lib/i18n/zh'
import ko from '@/lib/i18n/ko'

// spec 043 (FR-016) — every user-facing string this feature introduces is present
// in ALL five catalogs with matching {n} placeholder arity. Reused pre-existing
// keys (Income/Expenses/Transfers/Net/Savings rate/Transfer/From/To) are NOT
// re-listed here; the removed balances keys are gone (guarded by
// catalog-reachability).

const FEATURE_KEYS = [
  'Everyone',
  'Member',
  'Member view',
  'Last month {0}',
  'No comparison yet',
]

const catalogs = { bn, es, ja, zh, ko } as Record<string, Record<string, string>>

const placeholders = (s: string): string[] => (s.match(/\{\d+\}/g) ?? []).sort()

describe('Dashboard & household refinements i18n (spec 043)', () => {
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
  }

  it('the removed balances keys are gone from every catalog', () => {
    const removed = ['Balances', 'Settle up', '{0} owes you', 'You owe {0}', 'Settled with {0}']
    for (const [lang, catalog] of Object.entries(catalogs)) {
      const stillThere = removed.filter((k) => k in catalog)
      expect(stillThere, `stale balances keys in ${lang}`).toEqual([])
    }
  })
})
