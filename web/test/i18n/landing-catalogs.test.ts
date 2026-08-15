import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { LANDING_CATALOGS } from '@/lib/i18n/landing'
import { landingSlugs, LANDING_LOCALES, type LandingSlug } from '@/lib/onboarding/locales'

// spec 045 — the funnel deliberately does NOT use the app catalogs. Those are 32–55 KB
// each and `useTranslate` resolves them AFTER mount, which would flash English on a
// locale-fixed marketing page (research.md §3). These small catalogs are statically
// imported instead, so first paint is already correct.

const DIR = join(process.cwd(), 'lib/i18n/landing')

function source(slug: string): string {
  return readFileSync(join(DIR, `${slug}.ts`), 'utf8')
}

/**
 * spec 046 — every human-readable string a locale ships, flattened to `[path, value]`
 * so the quality guards below cover the marketing copy and not just the two meta keys.
 *
 * Paths rather than plain values because the failure message is the whole point: a
 * blank or untranslated string is useless to debug if the assertion can only say "one
 * of them is wrong". `points` is walked by index because its LENGTH IS PER-LOCALE —
 * that is the mechanism behind US3 (a market may ship two supporting ideas or four),
 * so nothing here may assume a fixed count.
 */
function copyStrings(slug: LandingSlug): Array<[string, string]> {
  const c = LANDING_CATALOGS[slug]
  const out: Array<[string, string]> = [
    ['metaTitle', c.metaTitle],
    ['metaDescription', c.metaDescription],
    ['notFoundLine', c.notFoundLine],
    ['notFoundCta', c.notFoundCta],
    ['landing.headline', c.landing.headline],
    ['landing.subhead', c.landing.subhead],
    ['landing.primaryCta', c.landing.primaryCta],
    ['landing.secondaryPrompt', c.landing.secondaryPrompt],
    ['landing.secondaryCta', c.landing.secondaryCta],
  ]
  c.landing.points.forEach((point, i) => {
    out.push([`landing.points[${i}].title`, point.title])
    out.push([`landing.points[${i}].body`, point.body])
  })
  return out
}

describe('landing catalogs — coverage', () => {
  it('has exactly one catalog file per registry slug', () => {
    // Non-catalog modules in this directory are excluded by name, so the check stays a
    // real "one file per slug" assertion rather than drifting into a file count:
    //   index.ts — the LandingCatalog type + LANDING_CATALOGS registry (spec 045)
    //   tour.ts  — the TourCopy type + TOUR_CATALOGS registry (spec 047)
    const NOT_A_CATALOG = ['index.ts', 'tour.ts']
    const files = readdirSync(DIR)
      .filter((f) => f.endsWith('.ts') && !NOT_A_CATALOG.includes(f))
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
      for (const [path, value] of copyStrings(slug)) {
        expect(typeof value, `${slug}.${path}`).toBe('string')
        expect(value.trim().length, `${slug}.${path} is blank`).toBeGreaterThan(0)
      }
    }
  })

  it('gives every locale at least one supporting point, each with a title and a body', () => {
    // spec 046 — `points` is an array, not point1/point2/point3, because US3 requires a
    // market to be able to carry a different NUMBER of supporting ideas without a
    // per-locale branch in the component. A locale shipping zero would render a hero
    // with nothing under it, which is a content bug the type system can't catch.
    for (const slug of landingSlugs()) {
      const { points } = LANDING_CATALOGS[slug].landing
      expect(Array.isArray(points), `${slug}.landing.points is not an array`).toBe(true)
      expect(points.length, `${slug}.landing.points is empty`).toBeGreaterThan(0)
      points.forEach((point, i) => {
        expect(typeof point.title, `${slug}.landing.points[${i}].title`).toBe('string')
        expect(typeof point.body, `${slug}.landing.points[${i}].body`).toBe('string')
      })
    }
  })
})

describe('landing catalogs — translation quality', () => {
  it('leaves no English string in a non-English catalog', () => {
    // The guard that stops a placeholder shipping as an untranslated stub.
    // Mirrors the existing i18n guards (test/i18n/routines-i18n.test.ts).
    const english = new Map(copyStrings('en'))
    for (const slug of landingSlugs()) {
      if (slug === 'en') continue
      for (const [path, value] of copyStrings(slug)) {
        // Compare by PATH, and only where English has the same one: a locale with a
        // different number of points has paths English does not, and that is allowed
        // by design (US3). Missing paths are skipped, never treated as a pass/fail.
        if (!english.has(path)) continue
        expect(value, `${slug}.${path} is still the English string`).not.toBe(english.get(path))
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
      // Every string, not just the meta pair — the marketing copy is the bulk of what
      // ships now, and it is the part most likely to be pasted from the wrong file.
      for (const [path, value] of copyStrings(slug as LandingSlug)) {
        expect(pattern!.test(value), `${slug}.${path} is not written in its own script`).toBe(true)
      }
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

  const between = (src: string, open: string, close: string) =>
    src.slice(src.indexOf(open) + open.length, src.indexOf(close)).trim()

  // Merge resolution (046 + 047). Spec 045 shipped both regions EMPTY and asserted so;
  // each feature then narrowed that assertion from its own side — 046 claimed its region
  // while 047's was still empty, and 047 the mirror image. Both regions are now filled,
  // so the standing invariant is that each is CLAIMED and neither feature consumed,
  // reordered or tidied away the other's. That is the marker mechanism having worked.
  it.each(landingSlugs())('fills the spec 046 region in %s.ts', (slug) => {
    // spec 046 — all of its marketing copy lives here and nowhere else (FR-005). An
    // empty region would mean a locale shipped without a proposition.
    expect(between(source(slug), OPEN_046, CLOSE_046)).not.toBe('')
  })

  it.each(landingSlugs())('fills the spec 047 region in %s.ts', (slug) => {
    // spec 047 — tour copy, inside the markers as a sibling export (it sits below the
    // LandingCatalog literal, so a field would have had to live OUTSIDE them). Its
    // deeper structural guards are in test/i18n/tour-catalogs.test.ts.
    expect(between(source(slug), OPEN_047, CLOSE_047)).not.toBe('')
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
