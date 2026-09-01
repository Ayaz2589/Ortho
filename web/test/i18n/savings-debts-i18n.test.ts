import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import bn from '@/lib/i18n/bn'
import es from '@/lib/i18n/es'
import ja from '@/lib/i18n/ja'
import zh from '@/lib/i18n/zh'
import ko from '@/lib/i18n/ko'

// spec 059 (FR-030, SC-009) — every member-facing string in Savings & Debts
// resolves in all five catalogs, with matching {n} placeholder arity.
//
// This suite DERIVES its key list from the source rather than hardcoding one.
// A hardcoded list only pins the strings someone remembered to add to it; a
// derived list fails the moment a new `t('…')` lands untranslated, which is the
// failure this guard exists to catch.

const catalogs = { bn, es, ja, zh, ko } as Record<string, Record<string, string>>

/** The components this feature owns. */
const SOURCE_FILES = [
  ...listTsx('components/goals'),
  'components/planning/GoalsSummaryCard.tsx',
  'components/widgets/bodies/GoalsBody.tsx',
  'components/widgets/panels/GoalsPanel.tsx',
]

/** Strings the widget registry carries as raw English and translates at render. */
const REGISTRY_KEYS = ['Savings & Debts', 'What you’re saving for and paying down.']

function listTsx(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) out.push(...listTsx(path))
    else if (entry.name.endsWith('.tsx')) out.push(path)
  }
  return out
}

/** Every `t('…')` literal in the feature's source. */
function sourceKeys(): string[] {
  const keys = new Set<string>(REGISTRY_KEYS)
  for (const file of SOURCE_FILES) {
    const src = readFileSync(join(process.cwd(), file), 'utf8')
    // No `s` flag: the project's TS target predates it, and the character class
    // below already spans newlines for multi-line strings.
    for (const m of src.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) {
      keys.add(m[1].replace(/\\'/g, "'"))
    }
  }
  return [...keys].sort()
}

const placeholders = (s: string): string[] => (s.match(/\{\d+\}/g) ?? []).sort()

describe('Savings & Debts i18n (spec 059)', () => {
  const keys = sourceKeys()

  it('finds the feature’s strings in the source (the guard is not vacuous)', () => {
    // Without this, a broken extractor would make every assertion below pass on
    // an empty list.
    expect(keys.length).toBeGreaterThan(60)
    expect(keys).toContain('Savings & Debts')
    expect(keys).toContain('{0} more payments')
  })

  for (const [lang, catalog] of Object.entries(catalogs)) {
    it(`${lang} translates every string this feature renders`, () => {
      const missing = keys.filter((k) => !(k in catalog))
      expect(missing, `missing keys in ${lang}`).toEqual([])
    })

    it(`${lang} keeps the placeholder arity of every string`, () => {
      const wrong = keys
        .filter((k) => k in catalog)
        .filter((k) => placeholders(catalog[k]).join() !== placeholders(k).join())
      expect(wrong, `placeholder mismatch in ${lang}`).toEqual([])
    })
  }
})

describe('Savings & Debts copy (spec 059 FR-028)', () => {
  it('no member-facing string in the feature says "goal"', () => {
    const offenders = sourceKeys().filter((k) => /\bgoals?\b/i.test(k))
    expect(offenders).toEqual([])
  })

  it('every catalog translates the section name away from "Goals"', () => {
    for (const [lang, catalog] of Object.entries(catalogs)) {
      expect(catalog['Savings & Debts'], `${lang} section title`).toBeTruthy()
      expect(catalog['Savings & Debts']).not.toBe('Savings & Debts')
    }
  })
})
