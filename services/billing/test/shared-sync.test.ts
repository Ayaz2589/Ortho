// Drift lock: the committed edge-function copy of the billing core must be
// byte-identical to the source. Regenerate with `npm run sync:functions`.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const srcDir = join(__dirname, '..', 'src')
const sharedDir = join(__dirname, '..', '..', '..', 'supabase', 'functions', '_shared', 'billing')

describe('supabase/functions/_shared/billing is a faithful byte-copy of src/', () => {
  const srcFiles = readdirSync(srcDir).filter((f) => f.endsWith('.ts')).sort()

  it('contains exactly the source file set', () => {
    const sharedFiles = readdirSync(sharedDir).filter((f) => f.endsWith('.ts')).sort()
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
