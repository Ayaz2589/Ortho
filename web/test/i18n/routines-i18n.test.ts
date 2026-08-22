import { describe, it, expect } from 'vitest'
import bn from '@/lib/i18n/bn'
import es from '@/lib/i18n/es'
import ja from '@/lib/i18n/ja'
import zh from '@/lib/i18n/zh'
import ko from '@/lib/i18n/ko'

// spec 044 — every new Financial Routines string (routine list/cards, financial-health's 6th
// dimension, location consent/candidates) is present in ALL five catalogs with matching
// {0}/{1}/… placeholder arity. `Settings`/`Remove`/`{0} out of 100`/etc. are reused pre-existing
// keys and intentionally NOT in this list.

const FEATURE_KEYS = [
  // Routines view (US1/US2)
  'Routines',
  'Routines are patterns we notice in your spending — recurring charges and regular habits. Confirming one helps future matching transactions get categorized automatically.',
  'Not enough history yet — keep logging transactions and routines will show up here.',
  'Monthly, about {0}',
  'A regular habit, around {0}',
  'No longer active',
  'Confirm',
  'Rename',
  'Rename routine',
  'Dismiss',
  // Financial health — routine awareness (US3)
  'Routine awareness',
  'Routine awareness reflects: {0}',
  'Not enough recognized routines yet to shape your routine awareness.',
  'A few more recognized routines would make your spending easier to predict — review what’s been detected.',
  // Location (US4)
  'Location',
  'Location assistance',
  'Optional. Off by default. Sharpens routine detection but never required for it.',
  'Off',
  'No location data is collected or used.',
  'Geocoding',
  'Places you already log get a location label. No device permission needed.',
  'Foreground capture',
  'Also notices places you visit often while the app is open, to suggest a routine.',
  "Location enrichment isn't available yet.",
  'A place you visit often',
  'Noticed {0} times — might be worth logging as a routine.',
]

const catalogs = { bn, es, ja, zh, ko } as Record<string, Record<string, string>>

const placeholders = (s: string): string[] => (s.match(/\{\d+\}/g) ?? []).sort()

describe('Financial Routines i18n (spec 044)', () => {
  for (const [lang, catalog] of Object.entries(catalogs)) {
    it(`${lang} has every new key with matching placeholders`, () => {
      const missing = FEATURE_KEYS.filter((k) => !(k in catalog))
      expect(missing, `missing keys in ${lang}`).toEqual([])
      for (const k of FEATURE_KEYS) {
        expect(placeholders(catalog[k] ?? ''), `placeholders for "${k}" in ${lang}`).toEqual(placeholders(k))
      }
    })
  }
})
