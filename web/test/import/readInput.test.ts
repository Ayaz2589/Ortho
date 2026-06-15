import { describe, it, expect } from 'vitest'
import { writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readInput } from '../../scripts/import/engine/readInput'

const tmp = (name: string, content: string) => {
  const p = join(tmpdir(), `ortho-${process.pid}-${Date.now()}-${name}`)
  writeFileSync(p, content)
  return p
}

describe('readInput — CSV', () => {
  it('reads a .csv (any case) as a single page of text', async () => {
    const p = tmp('a.CSV', 'a,b\n1,2\n')
    try {
      expect(await readInput(p)).toEqual(['a,b\n1,2\n'])
    } finally {
      rmSync(p)
    }
  })

  it('throws on an empty CSV', async () => {
    const p = tmp('empty.csv', '   \n')
    try {
      await expect(readInput(p)).rejects.toThrow(/UNPARSEABLE/)
    } finally {
      rmSync(p)
    }
  })
})
