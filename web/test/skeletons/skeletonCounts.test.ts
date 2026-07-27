// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  readSkeletonCount,
  writeSkeletonCount,
  SKELETON_COUNT_CAP,
} from '@/lib/skeletonCounts'

const KEY = 'ortho.skeletonCounts'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('skeletonCounts', () => {
  it('returns the fallback when nothing is stored', () => {
    expect(readSkeletonCount('transactions', 7)).toBe(7)
  })

  it('round-trips a written count', () => {
    writeSkeletonCount('transactions', 12)
    expect(readSkeletonCount('transactions', 3)).toBe(12)
  })

  it('clamps a huge count to the cap on write', () => {
    writeSkeletonCount('goals', 9999)
    expect(readSkeletonCount('goals', 3)).toBe(SKELETON_COUNT_CAP)
  })

  it('accepts zero as a valid stored count', () => {
    writeSkeletonCount('housing', 0)
    expect(readSkeletonCount('housing', 5)).toBe(0)
  })

  it.each([
    ['a string', JSON.stringify({ transactions: '10' })],
    ['a negative number', JSON.stringify({ transactions: -4 })],
    ['a float', JSON.stringify({ transactions: 3.5 })],
    ['null', JSON.stringify({ transactions: null })],
    ['NaN (serialized as null)', JSON.stringify({ transactions: Number.NaN })],
  ])('rejects %s and returns the fallback', (_label, blob) => {
    localStorage.setItem(KEY, blob)
    expect(readSkeletonCount('transactions', 9)).toBe(9)
  })

  it('returns the fallback (no throw) when the stored blob is corrupt JSON', () => {
    localStorage.setItem(KEY, '{not json')
    expect(() => readSkeletonCount('transactions', 9)).not.toThrow()
    expect(readSkeletonCount('transactions', 9)).toBe(9)
  })

  it('returns the fallback when the stored blob is not an object', () => {
    localStorage.setItem(KEY, JSON.stringify([1, 2, 3]))
    expect(readSkeletonCount('transactions', 9)).toBe(9)
  })

  it('preserves other keys when writing one', () => {
    writeSkeletonCount('transactions', 10)
    writeSkeletonCount('goals', 4)
    expect(readSkeletonCount('transactions', 0)).toBe(10)
    expect(readSkeletonCount('goals', 0)).toBe(4)
  })

  it('swallows a throwing getItem and returns the fallback', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })
    expect(() => readSkeletonCount('transactions', 6)).not.toThrow()
    expect(readSkeletonCount('transactions', 6)).toBe(6)
  })

  it('swallows a throwing setItem (write is a no-op)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage full')
    })
    expect(() => writeSkeletonCount('transactions', 5)).not.toThrow()
  })

  it('ignores a non-finite write value', () => {
    writeSkeletonCount('tags', Number.POSITIVE_INFINITY)
    expect(readSkeletonCount('tags', 2)).toBe(2)
  })
})
