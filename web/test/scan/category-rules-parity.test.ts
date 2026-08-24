import { describe, it, expect } from 'vitest'
import { categorize } from '@/scripts/import/engine/categorize'
import { ruleCategory } from '@/lib/scan/scanHeuristics'

// Review 2026-08-24 (minor): scanHeuristics.CATEGORY_RULES documents itself as
// 'a verbatim port of engine/categorize.ts RULES — keep in sync', but the
// spec-031 category expansion updated only the CLI table: DOORDASH stayed
// dining instead of takeout, NETFLIX subs instead of streaming, LYFT transit
// instead of rideshare, and the parking/gym/pharmacy/gaming splits were
// missing entirely. This parity guard locks the two tables together — the one
// DELIBERATE divergence is the fallback (scan returns null so the form
// default stands; the CLI falls back to 'entertainment').
const SHARED_MERCHANTS = [
  'DOORDASH',
  'UBER EATS',
  'GRUBHUB',
  'NETFLIX',
  'HULU',
  'DISNEY+',
  'YOUTUBE PREMIUM',
  'SPOTIFY',
  'GITHUB',
  'LYFT',
  'UBER',
  'MTA PAYGO',
  'PARKMOBILE',
  'SPOTHERO',
  'EQUINOX',
  'PELOTON',
  'CVS',
  'WALGREENS PHARMACY',
  'HIMS',
  'CITY HOSPITAL',
  'GAMESTOP',
  'STEAM PURCHASE',
  'STARBUCKS',
  'SHELL',
  'CON ED',
  'WHOLE FOODS',
  'APT RENT',
  'CORNER RESTAURANT',
]

describe('scan CATEGORY_RULES parity with engine/categorize.ts', () => {
  for (const merchant of SHARED_MERCHANTS) {
    it(`categorizes '${merchant}' identically to the CLI`, () => {
      expect(ruleCategory(merchant) ?? 'entertainment').toBe(categorize(merchant, 'expense'))
    })
  }
})
