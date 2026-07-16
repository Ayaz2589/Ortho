import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Split-integrity guard (spec 023 P1): the five translation catalogs
// (bn/es/ja/zh/ko, ~30 KB gzip / ~100 KB raw combined) must NEVER be statically
// imported on the initial-load path — they are dynamically imported per ACTIVE
// language, so a default (English/System-English) user downloads none. A static
// `import es from './es'` anywhere under lib/app/components would pull all five
// back into the shared chunk. This test fails if so.

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const SCAN_DIRS = ['lib', 'app', 'components']
const CATALOGS = ['bn', 'es', 'ja', 'zh', 'ko']
// A STATIC default/namespace import of a catalog module by any path ending in the
// catalog basename (`'./bn'`, `'@/lib/i18n/es'`, `'../i18n/ja'`, …).
const STATIC_CATALOG_IMPORT = new RegExp(
  `^\\s*import\\s+[^;\\n]*\\s+from\\s+['"][^'"]*/(?:${CATALOGS.join('|')})['"]`,
  'm'
)

function tsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...tsFiles(p))
    else if ((entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) && !CATALOGS.includes(entry.name.replace(/\.tsx?$/, '')))
      out.push(p)
  }
  return out
}

describe('i18n catalogs are never eagerly imported (spec 023 P1 guard)', () => {
  it('no initial-load module statically imports a translation catalog', () => {
    const offenders: string[] = []
    for (const dir of SCAN_DIRS) {
      for (const f of tsFiles(join(WEB_ROOT, dir))) {
        if (STATIC_CATALOG_IMPORT.test(readFileSync(f, 'utf8'))) offenders.push(f.slice(WEB_ROOT.length))
      }
    }
    expect(offenders).toEqual([])
  })

  it('lib/i18n/index.ts dynamically imports every catalog (proving they moved, not vanished)', () => {
    const src = readFileSync(join(WEB_ROOT, 'lib/i18n/index.ts'), 'utf8')
    const dynamic = CATALOGS.filter((lang) => new RegExp(`import\\(\\s*['"]\\./${lang}['"]\\s*\\)`).test(src))
    expect(dynamic.sort()).toEqual([...CATALOGS].sort())
  })
})
