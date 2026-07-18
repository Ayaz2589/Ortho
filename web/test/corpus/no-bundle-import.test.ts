import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Guard (spec 026, research D6): the coverage corpus is dev/test-only and MUST
// NOT be reachable from the shipped app bundle. Unlike lib/testdata/seed.ts (which
// ships behind isTestBuild()), a few-hundred-household generator has no place in
// the client bundle. Assert that nothing under lib/ or app/ imports test/corpus/.

const WEB_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

describe('corpus is not reachable from the app bundle (research D6)', () => {
  it('no file under lib/ or app/ imports test/corpus/', () => {
    const roots = ['lib', 'app'].map((d) => join(WEB_ROOT, d))
    const offenders: string[] = []
    for (const root of roots) {
      for (const file of walk(root)) {
        const src = readFileSync(file, 'utf8')
        if (/from\s+['"][^'"]*test\/corpus/.test(src) || /import\(['"][^'"]*test\/corpus/.test(src)) {
          offenders.push(file.replace(WEB_ROOT, ''))
        }
      }
    }
    expect(offenders, `these bundle files import test/corpus: ${offenders.join(', ')}`).toEqual([])
  })
})
