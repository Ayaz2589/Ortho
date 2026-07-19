// Drift lock: the committed edge-function copy of the aggregation core must be
// byte-identical to the source. Regenerate with `npm run sync:functions`.
// The comparison is RECURSIVE (spec 028) — src/ has subdirectories (deprecated/).
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const srcDir = join(__dirname, '..', 'src')
const sharedDir = join(__dirname, '..', '..', '..', 'supabase', 'functions', '_shared', 'aggregation')

/** Depth-first list of every .ts file under `dir`, relative to `dir`, sorted. */
function listTsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...listTsFiles(full).map((f) => join(entry.name, f)))
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(relative(dir, full))
    }
  }
  return out.sort()
}

describe('supabase/functions/_shared/aggregation is a faithful byte-copy of src/', () => {
  const srcFiles = listTsFiles(srcDir)

  it('contains exactly the source file set', () => {
    const sharedFiles = listTsFiles(sharedDir)
    expect(sharedFiles).toEqual(srcFiles)
  })

  for (const file of srcFiles) {
    it(`${file} is byte-identical`, () => {
      const src = readFileSync(join(srcDir, file), 'utf8')
      const copy = readFileSync(join(sharedDir, file), 'utf8')
      expect(copy).toBe(src)
    })
  }
})
