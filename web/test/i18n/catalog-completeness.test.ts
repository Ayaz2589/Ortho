import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import ts from 'typescript'

/**
 * Completeness guard (review 2026-08-24) — the DIRECTION the reachability test
 * does not cover: every string the UI passes to `t()`/`tr()` (and every entry
 * of the known key-carrying label tables) MUST exist in all five catalogs. A
 * key missing from a catalog silently falls back to English, so entire
 * shipped surfaces (spec-031 category labels, Settings → Data, bank linking,
 * the CSV import flow) read mixed-language without any test noticing. This is
 * the guard that direction fell through.
 *
 * Keys are collected by TypeScript's own scanner (same approach as
 * catalog-reachability.test.ts): literal first arguments of `t(...)`/`tr(...)`
 * calls (identifier or property callee, e.g. `ctx.t(...)`), plus the `label`
 * fields of lib/categories.ts, whose every entry flows through t().
 */

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CATALOG_LANGS = ['bn', 'es', 'ja', 'zh', 'ko'] as const
const SCAN_DIRS = ['app', 'components', 'lib']
const CATALOG_DIR = join(WEB, 'lib', 'i18n')

/** Keys deliberately not present in the app catalogs (with a why). */
const ALLOWLIST = new Set<string>([
  // Landing/tour funnel strings live in their own per-locale catalogs
  // (web/lib/i18n/landing/*), not the app catalogs — spec 045.
])

/** Files whose t() calls resolve against the LANDING catalogs, not the app ones. */
const LANDING_SCOPES = [
  join(WEB, 'app', 'landing'),
  join(WEB, 'app', 'tour'),
  join(WEB, 'components', 'landing'),
  join(WEB, 'components', 'tour'),
  join(WEB, 'lib', 'i18n', 'landing'),
  join(WEB, 'lib', 'onboarding'),
]

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (/\.(ts|tsx)$/.test(p) && !p.endsWith('.d.ts')) acc.push(p)
  }
  return acc
}

function tCallKeysIn(src: string, path: string): Set<string> {
  const sf = ts.createSourceFile(
    path,
    src,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )
  const out = new Set<string>()
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const callee = node.expression
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.name)
          ? callee.name.text
          : null
      if (name === 't' || name === 'tr') {
        const arg = node.arguments[0]
        if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) out.add(arg.text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

function labelFieldsIn(file: string): Set<string> {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const out = new Set<string>()
  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'label' &&
      (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))
    ) {
      out.add(node.initializer.text)
    }
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

// Collect every used key from app source (landing-scoped files excluded — they
// resolve against the landing catalogs).
const used = new Set<string>()
for (const dir of SCAN_DIRS) {
  for (const f of walk(join(WEB, dir))) {
    if (f.startsWith(CATALOG_DIR)) continue
    if (LANDING_SCOPES.some((scope) => f.startsWith(scope))) continue
    for (const k of tCallKeysIn(readFileSync(f, 'utf8'), f)) used.add(k)
  }
}
// The category taxonomy: every label flows through t() (pickers, chips, ledger,
// copy-list headers, budgets, filters).
for (const k of labelFieldsIn(join(WEB, 'lib', 'categories.ts'))) used.add(k)

describe('i18n catalog completeness (review 2026-08-24)', () => {
  it('the scan found a plausible number of used keys', () => {
    expect(used.size).toBeGreaterThan(400)
  })

  for (const lang of CATALOG_LANGS) {
    it(`every used key exists in the ${lang} catalog`, () => {
      const keys = catalogKeys(join(CATALOG_DIR, `${lang}.ts`))
      const missing = [...used].filter((k) => !keys.has(k) && !ALLOWLIST.has(k)).sort()
      expect(
        missing,
        `keys used by the UI but missing from ${lang} (silent English fallback): ${JSON.stringify(missing, null, 1)}`
      ).toEqual([])
    })
  }
})
