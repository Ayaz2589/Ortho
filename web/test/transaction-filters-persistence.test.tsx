// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

// Review 2026-08-24 (major): on mobile, editing a transaction navigates to a
// separate route, unmounting the list page; on save/cancel the list remounts
// with emptyCriteria(), silently discarding every active filter and the search
// query. The hook now round-trips criteria through sessionStorage
// ('ortho.txFilters') so a remount within the same browsing session restores
// exactly what the user had narrowed to.

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    transactions: [],
    tags: [],
    resolveUser: (id: string) => ({ id, name: id, initial: 'X', color_key: 'sage' }),
    locale: 'en-US',
    t: (k: string) => k,
  }),
}))

import { useTransactionFilters } from '@/lib/useTransactionFilters'

beforeEach(() => {
  window.sessionStorage.clear()
})

afterEach(() => {
  window.sessionStorage.clear()
})

describe('useTransactionFilters persistence across remount', () => {
  it('restores query, kind and month bounds after unmount/remount (mobile edit round-trip)', () => {
    const first = renderHook(() => useTransactionFilters())
    act(() => {
      first.result.current.setQuery('coffee')
      first.result.current.setKind('expense')
      first.result.current.setMonth('2026-05')
    })
    first.unmount()

    const second = renderHook(() => useTransactionFilters())
    expect(second.result.current.criteria.query).toBe('coffee')
    expect(second.result.current.criteria.kind).toBe('expense')
    expect(second.result.current.selectedMonth).toBe('2026-05')
    expect(second.result.current.count).toBe(3)
  })

  it('restores multi-select dimensions (categories, tags)', () => {
    const first = renderHook(() => useTransactionFilters())
    act(() => {
      first.result.current.toggleCategory('dining')
      first.result.current.toggleTag('tag-work')
    })
    first.unmount()

    const second = renderHook(() => useTransactionFilters())
    expect(second.result.current.criteria.categories).toEqual(['dining'])
    expect(second.result.current.criteria.tags).toEqual(['tag-work'])
  })

  it('clearAll clears the persisted copy too — the next mount starts clean', () => {
    const first = renderHook(() => useTransactionFilters())
    act(() => {
      first.result.current.setQuery('coffee')
    })
    act(() => {
      first.result.current.clearAll()
    })
    first.unmount()

    const second = renderHook(() => useTransactionFilters())
    expect(second.result.current.criteria.query).toBe('')
    expect(second.result.current.count).toBe(0)
  })

  it('ignores corrupt or wrong-shape stored state without throwing', () => {
    window.sessionStorage.setItem('ortho.txFilters', 'not json {')
    const first = renderHook(() => useTransactionFilters())
    expect(first.result.current.count).toBe(0)
    first.unmount()

    window.sessionStorage.setItem(
      'ortho.txFilters',
      JSON.stringify({ query: 42, kind: 'bogus', categories: 'dining', dateFrom: 7 })
    )
    const second = renderHook(() => useTransactionFilters())
    expect(second.result.current.criteria).toEqual({
      query: '',
      categories: [],
      kind: 'all',
      sources: [],
      owners: [],
      tags: [],
      dateFrom: null,
      dateTo: null,
    })
  })
})
