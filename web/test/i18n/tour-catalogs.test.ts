// spec 047 — the tour's six-language copy. Mirrors the shape of the spec 045 guard in
// landing-catalogs.test.ts: coverage, translation quality, and the reserved-region rule
// that lets 046 and 047 edit the same files and still auto-merge.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TOUR_CATALOGS, TOUR_SCREEN_COUNT, tourCatalog, type TourCopy } from '@/lib/i18n/landing/tour'
import { landingSlugs } from '@/lib/onboarding/locales'

const DIR = join(process.cwd(), 'lib/i18n/landing')

/** The flat strings — screens are checked separately since they are structured. */
const CONTROL_KEYS: Array<keyof TourCopy> = ['next', 'back', 'skip', 'finish', 'position', 'regionLabel']

function source(slug: string): string {
  return readFileSync(join(DIR, `${slug}.ts`), 'utf8')
}

/** Drop block and line comments so a guard inspects code, not prose about the code. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

/** Every user-visible string in a catalog, flattened. */
function allStrings(copy: TourCopy): string[] {
  return [
    ...copy.screens.flatMap((s) => [s.title, s.body]),
    ...CONTROL_KEYS.map((k) => copy[k] as string),
  ]
}

describe('tour catalogs — coverage', () => {
  it('has one catalog per registry slug, so a 7th language stays one list edit', () => {
    expect(Object.keys(TOUR_CATALOGS).sort()).toEqual([...landingSlugs()].sort())
  })

  it.each(landingSlugs())('gives %s exactly TOUR_SCREEN_COUNT screens', (slug) => {
    // FR-002: at most five. Fixed at five, and identical across languages — a locale
    // with four screens would silently drop a claim for those visitors.
    expect(TOUR_CATALOGS[slug].screens).toHaveLength(TOUR_SCREEN_COUNT)
  })

  it('caps the deck at five screens', () => {
    expect(TOUR_SCREEN_COUNT).toBeLessThanOrEqual(5)
  })

  it.each(landingSlugs())('defines every string in %s, none blank', (slug) => {
    for (const value of allStrings(TOUR_CATALOGS[slug])) {
      expect(typeof value).toBe('string')
      expect(value.trim().length, `blank string in ${slug}`).toBeGreaterThan(0)
    }
  })

  it('falls back to English for an unrecognized slug rather than throwing', () => {
    expect(tourCatalog('fr')).toBe(TOUR_CATALOGS.en)
    expect(tourCatalog('')).toBe(TOUR_CATALOGS.en)
  })

  it('returns the requested catalog for a known slug', () => {
    for (const slug of landingSlugs()) expect(tourCatalog(slug)).toBe(TOUR_CATALOGS[slug])
  })
})

describe('tour catalogs — translation quality', () => {
  it('leaves no English string in a non-English catalog', () => {
    // The guard that stops a stub shipping as a translation.
    const en = TOUR_CATALOGS.en
    for (const slug of landingSlugs()) {
      if (slug === 'en') continue
      const theirs = allStrings(TOUR_CATALOGS[slug])
      const ours = allStrings(en)
      for (let i = 0; i < ours.length; i++) {
        expect(theirs[i], `${slug} string ${i} is still the English text`).not.toBe(ours[i])
      }
    }
  })

  it('writes each catalog in a script plausible for its language', () => {
    // Catches the likeliest mistake: pasting one language's copy into another's file.
    // Latin-script languages are excluded — es/en share an alphabet.
    const scripts: Partial<Record<string, RegExp>> = {
      bn: /[ঀ-৿]/, // Bengali
      ja: /[぀-ヿ一-鿿]/, // kana or kanji
      zh: /[一-鿿]/, // Han
      ko: /[가-힯ᄀ-ᇿ]/, // Hangul
    }
    for (const [slug, pattern] of Object.entries(scripts)) {
      const joined = allStrings(TOUR_CATALOGS[slug as 'bn']).join(' ')
      expect(pattern!.test(joined), `${slug} tour copy is not in its own script`).toBe(true)
    }
  })

  it.each(landingSlugs())('keeps both position placeholders in %s', (slug) => {
    // Placeholder-arity parity: a translator dropping {1} would render "Step 2 of {1}".
    const template = TOUR_CATALOGS[slug].position
    expect(template, `${slug}.position lost {0}`).toContain('{0}')
    expect(template, `${slug}.position lost {1}`).toContain('{1}')
  })

  it.each(landingSlugs())('uses no placeholder outside {0} and {1} in %s', (slug) => {
    const extras = TOUR_CATALOGS[slug].position.match(/\{(\d+)\}/g) ?? []
    for (const token of extras) expect(['{0}', '{1}']).toContain(token)
  })
})

describe('tour catalogs — content honesty (US3)', () => {
  it('shows no example money anywhere in the deck', () => {
    // US3 scenario 3 constrains how amounts must render; the calmest way to satisfy it
    // is to have no amounts. It also keeps the deck currency-neutral across six
    // languages, where a hardcoded "$" would be wrong for most readers.
    const currency = /[$€£¥₩৳]|\d+[.,]\d{2}\b/
    for (const slug of landingSlugs()) {
      for (const value of allStrings(TOUR_CATALOGS[slug])) {
        expect(currency.test(value), `${slug} shows an example amount: ${value}`).toBe(false)
      }
    }
  })
})

describe('tour catalogs — reserved region (FR-009)', () => {
  const OPEN_046 = '// --- spec 046 landing copy — insert only between these markers ---'
  const CLOSE_046 = '// --- end spec 046 ---'
  const OPEN_047 = '// --- spec 047 tour copy — insert only between these markers ---'
  const CLOSE_047 = '// --- end spec 047 ---'

  it.each(landingSlugs())('declares %s tour copy strictly between the 047 markers', (slug) => {
    const src = source(slug)
    const start = src.indexOf(OPEN_047)
    const end = src.indexOf(CLOSE_047)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)

    const region = src.slice(start + OPEN_047.length, end)
    expect(region.trim().length, `${slug}.ts has an empty 047 region`).toBeGreaterThan(0)

    // The declaration itself is inside, not merely mentioned there.
    const declaration = src.indexOf(`export const ${slug}Tour`)
    expect(declaration, `${slug}.ts has no tour export`).toBeGreaterThan(-1)
    expect(declaration, `${slug}.ts declares its tour export before the 047 region`).toBeGreaterThan(start)
    expect(declaration, `${slug}.ts declares its tour export after the 047 region`).toBeLessThan(end)
  })

  it.each(landingSlugs())('touches nothing outside the 047 region in %s', (slug) => {
    // The tour copy is typed at the registry (lib/i18n/landing/tour.ts), NOT by a type
    // annotation here — so these files need no new import and FR-009 is literally true:
    // every byte 047 adds lies between the markers. It also leaves spec 046 a zero-line
    // conflict surface outside its own region.
    const src = source(slug)
    const before = src.slice(0, src.indexOf(OPEN_047))
    expect(before, `${slug}.ts imports the tour type outside the region`).not.toContain('./tour')
    expect(before).not.toContain('TourCopy')
  })

  it.each(landingSlugs())('puts no tour copy in the 046 region in %s', (slug) => {
    // Originally "the 046 region stays empty **until 046 lands**" — true while 047 was
    // being built in a parallel sandbox, and false the moment both merged. Narrowed on
    // merge rather than deleted: the point was never that 046's region is empty, it was
    // that 047 does not spend 046's budget. That still holds and is still worth pinning.
    // (`landing-catalogs.test.ts` separately asserts BOTH regions are now populated.)
    const src = source(slug)
    const region = src.slice(src.indexOf(OPEN_046) + OPEN_046.length, src.indexOf(CLOSE_046))
    expect(region, `${slug}.ts has tour copy inside the 046 region`).not.toContain('Tour')
    expect(region, `${slug}.ts has tour screens inside the 046 region`).not.toContain('screens:')
  })
})

describe('tour catalogs — isolation from the app catalogs', () => {
  // Same negative contract the 045 guard enforces: a pre-auth page must not pull a
  // 32-55 KB app catalog or the household data layer.
  const APP_CATALOG_IMPORT =
    /^\s*import\s+[^;\n]*\s+from\s+['"](?:\.\.\/(?:\.\.\/)*|[^'"]*i18n\/)(bn|es|ja|zh|ko)['"]/m

  it('tour.ts imports no app catalog and no store', () => {
    const src = source('tour')
    expect(src).not.toMatch(APP_CATALOG_IMPORT)
    expect(src).not.toContain('@/lib/store')
  })

  it('imports the locale catalogs statically, so first paint is already translated', () => {
    // A dynamic import() would reintroduce exactly the English flash FR-008 forbids.
    // Comments are stripped first — this file explains in prose why it does NOT use
    // `import()`, and a naive match would flag that explanation as the offence.
    const code = stripComments(source('tour'))
    expect(code).not.toMatch(/import\s*\(/)
    // …and the guard is real: it still catches the thing it is looking for.
    expect(stripComments("const x = import('./en')\n")).toMatch(/import\s*\(/)
  })

  it('keeps every landing catalog well under one app catalog', () => {
    // The app catalogs are 32-55 KB each. All six landing files together — now carrying
    // the tour copy as well — must stay far below one of them, or the reason this
    // directory exists has been lost.
    const total = landingSlugs().reduce((n, slug) => n + Buffer.byteLength(source(slug)), 0)
    expect(total).toBeLessThan(30_000)
  })
})
