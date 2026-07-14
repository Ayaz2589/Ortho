import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Split-integrity guard (spec 022, US2 / T012): the heavy scan parsing graph
// (scanParser → scanHeuristics, scanInference) must NOT be statically imported by
// useScanFlow, which is called unconditionally on the Transactions route. If it were,
// the whole parser would sit in that route's initial-load bundle. It must instead be
// reached via dynamic import() inside the capture callbacks, so it loads only when a
// scan is actually initiated. Behavior is covered by test/scan/useScanFlow.test.tsx.

const HOOK = fileURLToPath(new URL('../../lib/scan/useScanFlow.ts', import.meta.url))
const src = readFileSync(HOOK, 'utf8')

const staticImport = (mod: string) =>
  new RegExp(`import\\s+[^;]*?\\bfrom\\s+['"]${mod.replace('.', '\\.')}['"]`)
const dynamicImport = (mod: string) =>
  new RegExp(`import\\(\\s*['"]${mod.replace('.', '\\.')}['"]\\s*\\)`)

describe('useScanFlow defers the heavy scan parser graph (spec 022 US2 guard)', () => {
  it('does NOT statically import the parser/heuristics/inference graph', () => {
    expect(staticImport('./scanParser').test(src)).toBe(false)
    expect(staticImport('./scanInference').test(src)).toBe(false)
  })

  it('DOES load the parser graph via dynamic import() (moved, not deleted)', () => {
    expect(dynamicImport('./scanParser').test(src)).toBe(true)
    expect(dynamicImport('./scanInference').test(src)).toBe(true)
  })

  it('keeps the lightweight session reducer eager (needed to render)', () => {
    expect(staticImport('./scanSession').test(src)).toBe(true)
  })
})
