import { describe, it, expect } from 'vitest'
import { stableStringify, serializeCorpus } from './serialize'
import type { Corpus } from './model'

describe('canonical serialization (spec 026)', () => {
  it('is key-order-independent (same value, different key order → identical output)', () => {
    const a = { b: 1, a: 2, nested: { y: [3, 2, 1], x: 'v' } }
    const b = { nested: { x: 'v', y: [3, 2, 1] }, a: 2, b: 1 }
    expect(stableStringify(a)).toBe(stableStringify(b))
  })

  it('preserves array order (arrays are meaningful sequences)', () => {
    expect(stableStringify([3, 1, 2])).toContain('[\n  3,\n  1,\n  2\n]')
  })

  it('ends with a single trailing newline', () => {
    const s = stableStringify({ a: 1 })
    expect(s.endsWith('}\n')).toBe(true)
    expect(s.endsWith('}\n\n')).toBe(false)
  })

  it('serializeCorpus is deterministic for an equal corpus', () => {
    const corpus: Corpus = {
      seed: 1,
      meta: { version: 1, generatedFromSeed: 1, scenarioCount: 0 },
      scenarios: [],
    }
    expect(serializeCorpus(corpus)).toBe(serializeCorpus({ ...corpus }))
  })
})
