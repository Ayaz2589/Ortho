// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useDashboardRange, readStoredRange } from '@/lib/useDashboardRange'

describe('useDashboardRange (persisted dashboard range)', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('defaults to thisMonth when nothing is stored', () => {
    const { result } = renderHook(() => useDashboardRange())
    expect(result.current[0]).toBe('thisMonth')
  })

  it('adopts a valid stored range after mount', async () => {
    localStorage.setItem('dashboardRange', 'last6Months')
    const { result } = renderHook(() => useDashboardRange())
    await waitFor(() => expect(result.current[0]).toBe('last6Months'))
  })

  it('ignores an invalid stored value', () => {
    localStorage.setItem('dashboardRange', 'bogus')
    expect(readStoredRange()).toBeNull()
    const { result } = renderHook(() => useDashboardRange())
    expect(result.current[0]).toBe('thisMonth')
  })

  it('persists the choice to localStorage when changed', async () => {
    const { result } = renderHook(() => useDashboardRange())
    act(() => result.current[1]('last3Months'))
    await waitFor(() => expect(result.current[0]).toBe('last3Months'))
    expect(localStorage.getItem('dashboardRange')).toBe('last3Months')
    // a fresh mount remembers it
    const second = renderHook(() => useDashboardRange())
    await waitFor(() => expect(second.result.current[0]).toBe('last3Months'))
  })

  it('readStoredRange returns null without localStorage support', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null)
    expect(readStoredRange()).toBeNull()
    spy.mockRestore()
  })
})
