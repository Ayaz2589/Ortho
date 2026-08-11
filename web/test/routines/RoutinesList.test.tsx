// @vitest-environment jsdom
// spec 044 US1/US2 — RoutinesList: recognized routines with cadence + amount, confirm/dismiss/
// rename actions, dismissed-never-reappears, lapsed distinguished, calm empty state.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RoutineWithState } from '@/lib/finance/routines'

const h = vi.hoisted(() => ({
  routines: [] as RoutineWithState[],
  confirmRoutine: vi.fn(),
  dismissRoutine: vi.fn(),
  renameRoutine: vi.fn(),
}))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    routines: h.routines,
    formatMoney: (c: number) => `${c < 0 ? '−' : ''}$${Math.abs(c / 100).toFixed(2)}`,
    confirmRoutine: h.confirmRoutine,
    dismissRoutine: h.dismissRoutine,
    renameRoutine: h.renameRoutine,
    t: (k: string, ...a: unknown[]) =>
      k.replace(/\{(\d+)\}/g, (_: string, i: string) => String(a[Number(i)] ?? '')),
  }),
}))

import { RoutinesList } from '@/components/routines/RoutinesList'

function routine(over: Partial<RoutineWithState>): RoutineWithState {
  return {
    routineKey: 'rc:netflix',
    kind: 'recurring_charge',
    merchantKey: 'netflix',
    merchantLabel: 'Netflix',
    category: 'streaming',
    weekday: null,
    hourBucket: null,
    personId: null,
    typicalAmountCents: 1599,
    amountVarianceCents: 0,
    occurrenceCount: 4,
    firstSeenAt: '2026-05-01',
    lastSeenAt: '2026-08-01',
    confidence: 90,
    derivedStatus: 'recognized',
    evidenceTransactionIds: ['a', 'b', 'c', 'd'],
    status: 'recognized',
    label: null,
    ...over,
  }
}

describe('RoutinesList', () => {
  beforeEach(() => {
    h.routines = []
    h.confirmRoutine.mockClear()
    h.dismissRoutine.mockClear()
    h.renameRoutine.mockClear()
    cleanup()
  })

  it('shows a calm message when there are no routines yet', () => {
    render(<RoutinesList />)
    expect(screen.getByText(/not enough history yet/i)).toBeInTheDocument()
  })

  it('renders a recognized routine with cadence and typical amount', () => {
    h.routines = [routine({})]
    render(<RoutinesList />)
    expect(screen.getByText('Netflix')).toBeInTheDocument()
    expect(screen.getByText(/\$15\.99/)).toBeInTheDocument()
  })

  it('confirm/dismiss buttons call the corresponding store function', async () => {
    h.routines = [routine({})]
    render(<RoutinesList />)
    await userEvent.click(screen.getByText('Confirm'))
    expect(h.confirmRoutine).toHaveBeenCalledWith('rc:netflix')
    await userEvent.click(screen.getByText('Dismiss'))
    expect(h.dismissRoutine).toHaveBeenCalledWith('rc:netflix')
  })

  it('a dismissed routine never renders', () => {
    h.routines = [routine({ status: 'dismissed' })]
    render(<RoutinesList />)
    expect(screen.queryByText('Netflix')).not.toBeInTheDocument()
    expect(screen.getByText(/not enough history yet/i)).toBeInTheDocument()
  })

  it('a lapsed routine is visually distinguished, not shown as active', () => {
    h.routines = [routine({ status: 'lapsed' })]
    render(<RoutinesList />)
    expect(screen.getByText('Netflix')).toBeInTheDocument()
    expect(screen.getByText(/no longer active/i)).toBeInTheDocument()
    // A lapsed routine has nothing left to confirm/dismiss/rename in this pass.
    expect(screen.queryByText('Confirm')).not.toBeInTheDocument()
  })

  it('renaming a routine calls renameRoutine with the new label', async () => {
    h.routines = [routine({})]
    render(<RoutinesList />)
    await userEvent.click(screen.getByText('Rename'))
    const input = screen.getByLabelText(/rename routine/i)
    await userEvent.clear(input)
    await userEvent.type(input, 'Streaming bill')
    await userEvent.tab() // blur commits
    expect(h.renameRoutine).toHaveBeenCalledWith('rc:netflix', 'Streaming bill')
  })

  it('a confirmed routine no longer shows a Confirm action', () => {
    h.routines = [routine({ status: 'confirmed' })]
    render(<RoutinesList />)
    expect(screen.queryByText('Confirm')).not.toBeInTheDocument()
    expect(screen.getByText('Dismiss')).toBeInTheDocument()
  })
})
