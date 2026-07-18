import { describe, it, expect } from 'vitest'
import { mulberry32 } from './prng'

describe('mulberry32 PRNG (spec 026)', () => {
  it('is deterministic: same seed → same sequence', () => {
    const a = mulberry32(12345)
    const b = mulberry32(12345)
    const seqA = Array.from({ length: 20 }, () => a.next())
    const seqB = Array.from({ length: 20 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('different seeds → different sequences', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    const seqA = Array.from({ length: 20 }, () => a.next())
    const seqB = Array.from({ length: 20 }, () => b.next())
    expect(seqA).not.toEqual(seqB)
  })

  it('emits floats in [0, 1)', () => {
    const r = mulberry32(99)
    for (let i = 0; i < 1000; i++) {
      const x = r.next()
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })

  it('int / range / pick / bool stay in bounds', () => {
    const r = mulberry32(7)
    for (let i = 0; i < 500; i++) {
      expect(r.int(5)).toBeGreaterThanOrEqual(0)
      expect(r.int(5)).toBeLessThan(5)
      const v = r.range(10, 20)
      expect(v).toBeGreaterThanOrEqual(10)
      expect(v).toBeLessThanOrEqual(20)
      expect(['a', 'b', 'c']).toContain(r.pick(['a', 'b', 'c'] as const))
      expect(typeof r.bool()).toBe('boolean')
    }
  })

  it('sub(label) is independent of parent draws and stable by label', () => {
    // Drawing from the parent must not change what sub(label) produces.
    const p1 = mulberry32(555)
    const s1 = p1.sub('scenario-A').next()
    const p2 = mulberry32(555)
    p2.next()
    p2.next()
    p2.next() // advance the parent
    const s2 = p2.sub('scenario-A').next()
    expect(s1).toBe(s2)

    // Different labels → different streams.
    const p3 = mulberry32(555)
    expect(p3.sub('scenario-A').next()).not.toBe(p3.sub('scenario-B').next())
  })

  it('never calls Math.random', () => {
    const orig = Math.random
    let called = false
    Math.random = () => {
      called = true
      return orig()
    }
    try {
      const r = mulberry32(1)
      for (let i = 0; i < 100; i++) {
        r.next()
        r.sub(`x${i}`).range(0, 10)
      }
    } finally {
      Math.random = orig
    }
    expect(called).toBe(false)
  })
})
