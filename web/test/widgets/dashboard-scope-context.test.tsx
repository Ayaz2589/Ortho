// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import {
  DashboardScopeProvider,
  useDashboardScopeContext,
} from '@/lib/widgets/DashboardScopeContext'

// Spec 035 (Section 0): the dashboard's time scope must be a SINGLE shared source.
// `useDashboardScope()` holds its month/range in local state, so if each widget
// called it every widget would get its own month and the board would desync
// (decision D1). The provider calls the hook ONCE and hands the same value to
// every consumer via context; consuming outside the provider is a programming
// error and throws.

// Two transactions so `availableMonths` spans May+June 2026 — enough for a
// selected month to "stick" (a month absent from the data falls back to the range).
vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string) => k,
    locale: 'en-US',
    transactions: [
      { date: '2026-06-15T12:00:00.000Z' },
      { date: '2026-05-10T12:00:00.000Z' },
    ],
  }),
}))

/** A consumer that reads the shared scope and can drive it. */
function Reader({ id }: { id: string }) {
  const scope = useDashboardScopeContext()
  return (
    <div>
      <span data-testid={`month-${id}`}>{scope.selectedMonth ?? 'none'}</span>
      <button type="button" onClick={() => scope.setMonth('2026-05')}>
        set-{id}
      </button>
    </div>
  )
}

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('DashboardScopeContext', () => {
  it('supplies ONE shared scope to every consumer', () => {
    render(
      <DashboardScopeProvider>
        <Reader id="a" />
        <Reader id="b" />
      </DashboardScopeProvider>
    )
    // Both start on the relative range (no specific month).
    expect(screen.getByTestId('month-a').textContent).toBe('none')
    expect(screen.getByTestId('month-b').textContent).toBe('none')
  })

  it('propagates a month change from one consumer to ALL consumers', () => {
    render(
      <DashboardScopeProvider>
        <Reader id="a" />
        <Reader id="b" />
      </DashboardScopeProvider>
    )
    // Change the month through consumer A only…
    fireEvent.click(screen.getByText('set-a'))
    // …and BOTH consumers reflect it — proof they share one state instance, not
    // one hook call each (which would leave B on 'none').
    expect(screen.getByTestId('month-a').textContent).toBe('2026-05')
    expect(screen.getByTestId('month-b').textContent).toBe('2026-05')
  })

  it('throws when used outside a provider', () => {
    function Bare() {
      useDashboardScopeContext()
      return null
    }
    // Silence React's error boundary logging for the expected throw.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Bare />)).toThrow(/DashboardScopeProvider/)
    spy.mockRestore()
  })
})
