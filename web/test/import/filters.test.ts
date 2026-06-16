import { describe, it, expect } from 'vitest'
import { parseFilters, monthRange } from '../../scripts/import/engine/filters'

describe('monthRange', () => {
  it('builds a half-open month window', () => {
    expect(monthRange('2026-05')).toEqual({
      startISO: '2026-05-01T00:00:00.000Z',
      endISO: '2026-06-01T00:00:00.000Z',
    })
  })
  it('rolls December into the next year', () => {
    expect(monthRange('2025-12')).toEqual({
      startISO: '2025-12-01T00:00:00.000Z',
      endISO: '2026-01-01T00:00:00.000Z',
    })
  })
  it('rejects malformed or out-of-range months', () => {
    expect(() => monthRange('2026-13')).toThrow()
    expect(() => monthRange('2026/05')).toThrow()
    expect(() => monthRange('26-05')).toThrow()
  })
})

describe('parseFilters', () => {
  it('combines filters and maps MONTH to a half-open range', () => {
    const f = parseFilters({ month: '2026-05', category: 'dining', source: 'TD Bank', kind: 'expense', limit: '10' })
    expect(f).toEqual({
      startISO: '2026-05-01T00:00:00.000Z',
      endISO: '2026-06-01T00:00:00.000Z',
      category: 'dining',
      source: 'TD Bank',
      kind: 'expense',
      limit: 10,
    })
  })
  it('returns an empty filter when nothing is supplied', () => {
    expect(parseFilters({})).toEqual({})
  })
  it('rejects invalid enum values and limit', () => {
    expect(() => parseFilters({ category: 'food' })).toThrow()
    expect(() => parseFilters({ kind: 'debit' })).toThrow()
    expect(() => parseFilters({ limit: '0' })).toThrow()
    expect(() => parseFilters({ limit: '-3' })).toThrow()
  })
})
