// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// usePathname is driven per-test via this mock.
const pathnameMock = vi.fn<() => string>()
vi.mock('next/navigation', () => ({ usePathname: () => pathnameMock() }))

import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.clearAllMocks()
})

describe('RouteSkeleton — route → shape mapping', () => {
  it.each([
    ['/dashboard', 'skeleton-dashboard'],
    ['/transactions', 'skeleton-transactions'],
    ['/housing', 'skeleton-housing'],
    ['/planning/budget', 'skeleton-budgets'],
    ['/planning/goals', 'skeleton-goals'],
    ['/planning', 'skeleton-planning'],
    ['/settings', 'skeleton-settings'],
    ['/settings/household', 'skeleton-settings'],
    ['/transactions/new', 'skeleton-transactions'],
  ])('%s renders %s', (path, testId) => {
    pathnameMock.mockReturnValue(path)
    render(<RouteSkeleton />)
    expect(screen.getByTestId(testId)).toBeTruthy()
  })

  it('an unknown path renders the generic skeleton, never "Loading…"', () => {
    pathnameMock.mockReturnValue('/something-else')
    render(<RouteSkeleton />)
    expect(screen.getByTestId('skeleton-generic')).toBeTruthy()
    expect(screen.queryByText('Loading…')).toBeNull()
  })

  it('exposes an accessible busy status region', () => {
    pathnameMock.mockReturnValue('/dashboard')
    render(<RouteSkeleton />)
    const region = screen.getByRole('status')
    expect(region.getAttribute('aria-busy')).toBe('true')
  })

  it('never renders the visible "Loading…" string on a core route', () => {
    pathnameMock.mockReturnValue('/transactions')
    render(<RouteSkeleton />)
    expect(screen.queryByText('Loading…')).toBeNull()
  })
})

describe('RouteSkeleton — sizing from remembered counts (US2)', () => {
  beforeEach(() => localStorage.clear())

  function countRows(testId: string): number {
    const region = screen.getByTestId(testId)
    // Count leaf placeholder blocks that look like a primary row/card marker.
    return region.querySelectorAll('[aria-hidden="true"]').length
  }

  it('renders more transaction rows when a larger count is remembered', () => {
    pathnameMock.mockReturnValue('/transactions')
    localStorage.setItem('ortho.skeletonCounts', JSON.stringify({ transactions: 3 }))
    render(<RouteSkeleton />)
    const small = countRows('skeleton-transactions')
    cleanup()

    localStorage.setItem('ortho.skeletonCounts', JSON.stringify({ transactions: 20 }))
    render(<RouteSkeleton />)
    const large = countRows('skeleton-transactions')

    expect(large).toBeGreaterThan(small)
  })

  it('caps the rendered rows so a huge remembered count is bounded', () => {
    pathnameMock.mockReturnValue('/transactions')
    localStorage.setItem('ortho.skeletonCounts', JSON.stringify({ transactions: 9999 }))
    render(<RouteSkeleton />)
    // 24 rows × 3 blocks each + a couple of day headers + header stubs — an
    // absurd count must not explode the DOM. Bounded well under, say, 200 nodes.
    const blocks = screen.getByTestId('skeleton-transactions').querySelectorAll('[aria-hidden="true"]')
    expect(blocks.length).toBeLessThan(200)
  })

  it('the goals route draws a single-goal detail shape, not a list (spec 045)', () => {
    // /planning/goals is one goal's detail page now, so its skeleton is a fixed
    // shape — a recorded goal count must NOT multiply cards here.
    pathnameMock.mockReturnValue('/planning/goals')
    localStorage.setItem('ortho.skeletonCounts', JSON.stringify({ goals: 7 }))
    render(<RouteSkeleton />)
    const many = screen.getByTestId('skeleton-goals').querySelectorAll('[aria-hidden="true"]').length

    cleanup()
    localStorage.setItem('ortho.skeletonCounts', JSON.stringify({ goals: 0 }))
    render(<RouteSkeleton />)
    const none = screen.getByTestId('skeleton-goals').querySelectorAll('[aria-hidden="true"]').length

    expect(many).toBe(none)
    expect(none).toBeGreaterThan(2) // never a blank screen
  })

  it('the Planning hub skeleton sizes its goal cards from the recorded count', () => {
    // The per-goal cards moved to the hub with spec 045, and so did the count.
    pathnameMock.mockReturnValue('/planning')
    localStorage.setItem('ortho.skeletonCounts', JSON.stringify({ goals: 5 }))
    render(<RouteSkeleton />)
    const many = screen.getByTestId('skeleton-planning').querySelectorAll('[aria-hidden="true"]').length

    cleanup()
    localStorage.setItem('ortho.skeletonCounts', JSON.stringify({ goals: 1 }))
    render(<RouteSkeleton />)
    const few = screen.getByTestId('skeleton-planning').querySelectorAll('[aria-hidden="true"]').length

    expect(many).toBeGreaterThan(few)
  })
})
