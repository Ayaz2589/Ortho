import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import ts from 'typescript'

/**
 * Positional-placeholder guard.
 *
 * The catalog-reachability test proves every key is used, and the render-locale
 * test proves catalogs load — but neither catches a translation that keeps the
 * right KEYS while corrupting the `{n}` placeholders inside a value. Two failure
 * modes this locks:
 *
 *  1. **Placeholder-set drift** — a value that references an index the caller
 *     never supplies (`makeT` renders the literal `{3}`) or drops one the source
 *     provides. The set of `{n}` indices in every translation must match its
 *     English source key exactly.
 *
 *  2. **Semantic slot swap** — the three budget-insight strings all pass
 *     `{0}`=money, `{1}`=money-limit, `{2}`=day-count (see
 *     `lib/finance/insights.ts`). A translation that swaps `{0}`↔`{2}` keeps the
 *     same index set but renders the dollar amount where the day count belongs.
 *     We lock the day slot: in every locale, `{2}` must be adjacent to that
 *     locale's word for "days".
 */

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CATALOG_LANGS = ['bn', 'es', 'ja', 'zh', 'ko'] as const

/** key → translated value, parsed from a catalog's `as const` object literal. */
function catalogEntries(file: string): Map<string, string> {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const entries = new Map<string, string>()
  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isStringLiteral(node.name) || ts.isNoSubstitutionTemplateLiteral(node.name)) &&
      (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))
    ) {
      entries.set(node.name.text, node.initializer.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return entries
}

function placeholderSet(s: string): Set<string> {
  return new Set([...s.matchAll(/\{(\d+)\}/g)].map((m) => m[1]))
}

const catalogs = CATALOG_LANGS.map((lang) => ({
  lang,
  entries: catalogEntries(join(WEB, 'lib', 'i18n', `${lang}.ts`)),
}))

describe('i18n placeholder parity', () => {
  it('parsed a plausible number of entries per catalog', () => {
    for (const { lang, entries } of catalogs) {
      expect(entries.size, `${lang} catalog parsed too few entries`).toBeGreaterThan(200)
    }
  })

  for (const { lang, entries } of catalogs) {
    it(`${lang}: every value uses exactly the same {n} placeholders as its source key`, () => {
      const bad: string[] = []
      for (const [key, value] of entries) {
        const want = placeholderSet(key)
        const got = placeholderSet(value)
        if (want.size === 0 && got.size === 0) continue
        const missing = [...want].filter((i) => !got.has(i))
        const extra = [...got].filter((i) => !want.has(i))
        if (missing.length || extra.length) {
          bad.push(`"${key}" → "${value}" (missing ${JSON.stringify(missing)}, extra ${JSON.stringify(extra)})`)
        }
      }
      expect(bad, `${lang} placeholder mismatches:\n${bad.join('\n')}`).toEqual([])
    })
  }

  // The three budget-insight strings: {2} is always the day count.
  const DAY_WORD: Record<(typeof CATALOG_LANGS)[number], string> = {
    bn: 'দিন',
    es: 'días',
    ja: '日',
    ko: '일',
    zh: '天',
  }
  const BUDGET_KEYS = [
    '{0} left of {1} with {2} days to go.',
    '{0} of {1} still available with {2} days left.',
    "You're {0} over your {1} limit with {2} days left.",
  ]

  for (const { lang, entries } of catalogs) {
    it(`${lang}: budget-insight strings keep {2} in the day-count slot`, () => {
      const dayWord = DAY_WORD[lang]
      const swapped: string[] = []
      for (const key of BUDGET_KEYS) {
        const value = entries.get(key)
        expect(value, `${lang} is missing key "${key}"`).toBeTruthy()
        // {2} (the day count) must be adjacent to the locale's day word.
        if (!new RegExp(`\\{2\\}\\s*${dayWord}`).test(value!)) {
          swapped.push(`"${key}" → "${value}"`)
        }
      }
      expect(
        swapped,
        `${lang}: {2} (day count) is not in the day slot — money/day placeholders likely swapped:\n${swapped.join('\n')}`,
      ).toEqual([])
    })
  }
})
