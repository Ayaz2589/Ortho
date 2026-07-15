import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import ts from 'typescript'

/**
 * Reachability guard (spec 023, FR-021): every translation-catalog key MUST be
 * reachable from the UI — i.e. its exact text appears as a string literal
 * somewhere in the app source (a `t('…')`/`tr('…')` argument, a `label: '…'`
 * data table, an insight string, etc.). A key present in a catalog but nowhere in
 * source is dead weight (and hides stale copy); this test fails if one exists,
 * preventing reintroduction after the spec-023 purge.
 *
 * Reachability is decided by TypeScript's own scanner (not regex): apostrophes
 * and backticks inside comments, and quotes inside other-quoted strings, defeat
 * naive tokenization. The catalog files themselves are excluded from the scan —
 * otherwise every key would be trivially "reachable" from its own definition.
 */

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CATALOG_LANGS = ['bn', 'es', 'ja', 'zh', 'ko'] as const
const SCAN_DIRS = ['app', 'components', 'lib']
const CATALOG_FILES = new Set(CATALOG_LANGS.map((l) => join(WEB, 'lib', 'i18n', `${l}.ts`)))

/**
 * Keys that are genuinely reachable but NOT as a plain source string literal.
 * Empty today: every dynamic key source (category/currency/dashboard-range/
 * property-kind labels, insight strings) is itself defined as a string literal in
 * source, so the scan already captures them. Add a key here (with a why) only if a
 * future dynamic source builds it without a literal.
 */
const ALLOWLIST = new Set<string>([])

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (/\.(ts|tsx)$/.test(p) && !p.endsWith('.d.ts')) acc.push(p)
  }
  return acc
}

function stringLiteralsIn(src: string, path: string): Set<string> {
  const sf = ts.createSourceFile(
    path,
    src,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )
  const out = new Set<string>()
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.add(node.text)
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

function catalogKeys(file: string): Set<string> {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const keys = new Set<string>()
  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isStringLiteral(node.name) || ts.isNoSubstitutionTemplateLiteral(node.name))
    ) {
      keys.add(node.name.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return keys
}

// Build the reachable set once from all non-catalog app source.
const reachable = new Set<string>()
for (const dir of SCAN_DIRS) {
  for (const f of walk(join(WEB, dir))) {
    if (CATALOG_FILES.has(f)) continue
    for (const s of stringLiteralsIn(readFileSync(f, 'utf8'), f)) reachable.add(s)
  }
}

describe('i18n catalog reachability (FR-021)', () => {
  it('the source scan found a plausible number of reachable strings', () => {
    // Guards against a broken scan silently marking every key "unreachable".
    expect(reachable.size).toBeGreaterThan(500)
  })

  for (const lang of CATALOG_LANGS) {
    it(`${lang} catalog has no unreachable (dead) keys`, () => {
      const keys = catalogKeys(join(WEB, 'lib', 'i18n', `${lang}.ts`))
      const dead = [...keys].filter((k) => !reachable.has(k) && !ALLOWLIST.has(k)).sort()
      expect(dead, `dead ${lang} keys (not reachable from any t()/literal): ${JSON.stringify(dead)}`).toEqual([])
    })
  }
})
