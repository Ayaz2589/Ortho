import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { LANDING_CATALOGS, type LandingCatalog } from '@/lib/i18n/landing'
import { landingSlugs, LANDING_LOCALES } from '@/lib/onboarding/locales'

// spec 045 — the funnel deliberately does NOT use the app catalogs. Those are 32–55 KB
// each and `useTranslate` resolves them AFTER mount, which would flash English on a
// locale-fixed marketing page (research.md §3). These small catalogs are statically
// imported instead, so first paint is already correct.

const DIR = join(process.cwd(), 'lib/i18n/landing')
const KEYS: Array<keyof LandingCatalog> = ['metaTitle', 'metaDescription', 'placeholderLine']

function source(slug: string): string {
  return readFileSync(join(DIR, `${slug}.ts`), 'utf8')
}

describe('landing catalogs — coverage', () => {
  it('has exactly one catalog file per registry slug', () => {
    const files = readdirSync(DIR)
      .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
      .map((f) => f.replace(/\.ts$/, ''))
      .sort()
    expect(files).toEqual([...landingSlugs()].sort())
  })

  it('exposes a catalog for every slug through the static import map', () => {
    for (const slug of landingSlugs()) {
      expect(LANDING_CATALOGS[slug]).toBeDefined()
    }
    expect(Object.keys(LANDING_CATALOGS).sort()).toEqual([...landingSlugs()].sort())
  })

  it('defines every key in every catalog, none blank', () => {
    for (const slug of landingSlugs()) {
      for (const key of KEYS) {
        const value = LANDING_CATALOGS[slug][key]
        expect(typeof value, `${slug}.${key}`).toBe('string')
        expect(value.trim().length, `${slug}.${key} is blank`).toBeGreaterThan(0)
      }
    }
  })
})

describe('landing catalogs — translation quality', () => {
  it('leaves no English string in a non-English catalog', () => {
    // The guard that stops a placeholder shipping as an untranslated stub.
    // Mirrors the existing i18n guards (test/i18n/routines-i18n.test.ts).
    const en = LANDING_CATALOGS.en
    for (const slug of landingSlugs()) {
      if (slug === 'en') continue
      for (const key of KEYS) {
        expect(LANDING_CATALOGS[slug][key], `${slug}.${key} is still the English string`).not.toBe(
          en[key],
        )
      }
    }
  })

  it('writes each catalog in a script plausible for its language', () => {
    // A cheap script check catches the most likely translation mistake: pasting
    // one language's copy into another's file. Latin-script languages are
    // excluded — es/en share an alphabet, so script proves nothing there.
    const scripts: Partial<Record<string, RegExp>> = {
      bn: /[ঀ-৿]/, // Bengali
      ja: /[぀-ヿ一-鿿]/, // kana or kanji
      zh: /[一-鿿]/, // Han
      ko: /[가-힯ᄀ-ᇿ]/, // Hangul
    }
    for (const [slug, pattern] of Object.entries(scripts)) {
      const joined = KEYS.map((k) => LANDING_CATALOGS[slug as 'bn'][k]).join(' ')
      expect(pattern!.test(joined), `${slug} catalog is not written in its own script`).toBe(true)
    }
  })

  it('gives every locale its own distinct meta title', () => {
    const titles = landingSlugs().map((s) => LANDING_CATALOGS[s].metaTitle)
    expect(new Set(titles).size).toBe(titles.length)
  })
})

describe('landing catalogs — reserved regions for features 046/047', () => {
  // The mechanism that lets two sandboxed branches edit the same file and still
  // auto-merge: inserts land in regions separated by ≥3 lines of unchanged
  // context, never adjacent (research.md §9).
  const OPEN_046 = '// --- spec 046 landing copy — insert only between these markers ---'
  const CLOSE_046 = '// --- end spec 046 ---'
  const OPEN_047 = '// --- spec 047 tour copy — insert only between these markers ---'
  const CLOSE_047 = '// --- end spec 047 ---'

  it.each(landingSlugs())('carries both marker pairs in %s.ts', (slug) => {
    const src = source(slug)
    for (const marker of [OPEN_046, CLOSE_046, OPEN_047, CLOSE_047]) {
      expect(src, `${slug}.ts missing: ${marker}`).toContain(marker)
    }
  })

  it.each(landingSlugs())('orders the markers correctly in %s.ts', (slug) => {
    const src = source(slug)
    expect(src.indexOf(OPEN_046)).toBeLessThan(src.indexOf(CLOSE_046))
    expect(src.indexOf(CLOSE_046)).toBeLessThan(src.indexOf(OPEN_047))
    expect(src.indexOf(OPEN_047)).toBeLessThan(src.indexOf(CLOSE_047))
  })

  it.each(landingSlugs())('leaves both regions empty on delivery in %s.ts', (slug) => {
    // FR-025: this feature adds no marketing or tour text.
    const src = source(slug)
    const between = (open: string, close: string) =>
      src.slice(src.indexOf(open) + open.length, src.indexOf(close)).trim()
    expect(between(OPEN_046, CLOSE_046)).toBe('')
    expect(between(OPEN_047, CLOSE_047)).toBe('')
  })

  it.each(landingSlugs())('separates the two regions by blank context in %s.ts', (slug) => {
    // Adjacent hunks conflict; separated hunks merge. Assert the gap exists.
    const src = source(slug)
    const gap = src.slice(src.indexOf(CLOSE_046) + CLOSE_046.length, src.indexOf(OPEN_047))
    expect(gap.split('\n').length).toBeGreaterThanOrEqual(2)
  })
})

describe('landing catalogs — isolation from the app catalogs', () => {
  /**
   * test/i18n/no-eager-catalog.test.ts (spec 023's bundle guard) skips this directory,
   * because the landing files share basenames with the app catalogs and it would flag
   * the legitimate `import es from './es'` sibling. That makes THIS the only guard
   * standing between a landing page and a 32-55 KB app catalog, so it has to cover
   * every way one can be named — including the parent-relative `'../es'`, which is how
   * lib/i18n/landing/*.ts would actually reach lib/i18n/es.ts.
   */
  const APP_CATALOG_IMPORT =
    /^\s*import\s+[^;\n]*\s+from\s+['"](?:\.\.\/(?:\.\.\/)*|[^'"]*i18n\/)(bn|es|ja|zh|ko)['"]/m

  it.each([...landingSlugs(), 'index'])('%s.ts imports no app catalog and no store', (name) => {
    const src = source(name)
    expect(src).not.toMatch(APP_CATALOG_IMPORT)
    expect(src).not.toContain('@/lib/store')
  })

  it('the guard actually rejects a parent-relative app-catalog import', () => {
    // Pins the guard itself. Written after a probe showed the earlier version passed
    // when `import appEs from '../es'` was injected into a landing catalog.
    expect("import appEs from '../es'\n").toMatch(APP_CATALOG_IMPORT)
    expect("import ja from '../../lib/i18n/ja'\n").toMatch(APP_CATALOG_IMPORT)
    expect("import bn from '@/lib/i18n/bn'\n").toMatch(APP_CATALOG_IMPORT)
    // …and still allows the legitimate sibling import of a LANDING catalog.
    expect("import es from './es'\n").not.toMatch(APP_CATALOG_IMPORT)
  })

  it('keeps the whole landing catalog set far smaller than one app catalog', () => {
    // The app catalogs are 32–55 KB each. All six landing catalogs together must
    // stay well under one of them, or the reason they exist has been lost.
    const total = landingSlugs().reduce((n, slug) => n + Buffer.byteLength(source(slug)), 0)
    expect(total).toBeLessThan(30_000)
  })
})

describe('landing catalogs — registry alignment', () => {
  it('matches the registry exactly, so adding a locale needs one list edit', () => {
    expect(Object.keys(LANDING_CATALOGS).sort()).toEqual(
      LANDING_LOCALES.map((e) => e.slug).sort(),
    )
  })
})
