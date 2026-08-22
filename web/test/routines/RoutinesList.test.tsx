// @vitest-environment jsdom
// spec 044 US1/US2 — RoutinesList: recognized routines with cadence + amount, confirm/dismiss/
// rename actions, dismissed-never-reappears, lapsed distinguished, calm empty state.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RoutineWithState } from '@/lib/finance/routines'
import type { LocationConsent, RecognizedRoutineState, RoutineVisit } from '@/lib/types'
import { clusterVisits, clusterRoutineKey } from '@/lib/location/visitClusters'

const h = vi.hoisted(() => ({
  routines: [] as RoutineWithState[],
  confirmRoutine: vi.fn(),
  dismissRoutine: vi.fn(),
  renameRoutine: vi.fn(),
  locationConsent: null as LocationConsent | null,
  routineVisits: [] as RoutineVisit[],
  recognizedRoutineStates: [] as RecognizedRoutineState[],
  loadRoutineVisits: vi.fn(() => Promise.resolve()),
  recordRoutineVisit: vi.fn(() => Promise.resolve()),
  merchantGeocodes: [] as unknown[],
}))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    routines: h.routines,
    formatMoney: (c: number) => `${c < 0 ? '−' : ''}$${Math.abs(c / 100).toFixed(2)}`,
    confirmRoutine: h.confirmRoutine,
    dismissRoutine: h.dismissRoutine,
    renameRoutine: h.renameRoutine,
    locationConsent: h.locationConsent,
    routineVisits: h.routineVisits,
    recognizedRoutineStates: h.recognizedRoutineStates,
    loadRoutineVisits: h.loadRoutineVisits,
    recordRoutineVisit: h.recordRoutineVisit,
    merchantGeocodes: h.merchantGeocodes,
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
    h.locationConsent = null
    h.routineVisits = []
    h.recognizedRoutineStates = []
    h.loadRoutineVisits.mockClear()
    h.recordRoutineVisit.mockClear()
    h.merchantGeocodes = []
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

describe('RoutinesList — US2 behavioral habits alongside recurring charges', () => {
  beforeEach(() => {
    h.routines = []
    cleanup()
  })

  it('labels a behavioral_habit routine distinctly from a recurring_charge one', () => {
    h.routines = [
      routine({ routineKey: 'rc:netflix', merchantLabel: 'Netflix', kind: 'recurring_charge' }),
      routine({
        routineKey: 'bh:coffee shop:1',
        merchantLabel: 'Coffee Shop',
        kind: 'behavioral_habit',
        weekday: 1,
        typicalAmountCents: 400,
      }),
    ]
    render(<RoutinesList />)
    expect(screen.getByText(/monthly, about/i)).toBeInTheDocument()
    expect(screen.getByText(/regular habit/i)).toBeInTheDocument()
  })

  it('sorts recurring charges before behavioral habits', () => {
    h.routines = [
      routine({ routineKey: 'bh:coffee shop:1', merchantLabel: 'Coffee Shop', kind: 'behavioral_habit', weekday: 1 }),
      routine({ routineKey: 'rc:netflix', merchantLabel: 'Netflix', kind: 'recurring_charge' }),
    ]
    render(<RoutinesList />)
    const names = screen.getAllByText(/Netflix|Coffee Shop/).map((el) => el.textContent)
    expect(names).toEqual(['Netflix', 'Coffee Shop'])
  })
})

describe('RoutinesList — US4 location candidates', () => {
  beforeEach(() => {
    h.routines = []
    h.locationConsent = null
    h.routineVisits = []
    h.recognizedRoutineStates = []
    h.dismissRoutine.mockClear()
    cleanup()
  })

  function visit(lat: number, lng: number, id: string) {
    return {
      id,
      user_id: 'u',
      household_id: 'h',
      captured_at: '2026-08-01T09:00:00Z',
      latitude: lat,
      longitude: lng,
      accuracy_meters: 10,
      created_at: '2026-08-01T09:00:00Z',
    }
  }

  it('shows nothing location-related when consent is off, even with visit rows present', () => {
    h.locationConsent = null
    h.routineVisits = [visit(40.7128, -74.006, 'v1'), visit(40.7128, -74.006, 'v2'), visit(40.7128, -74.006, 'v3')]
    render(<RoutinesList />)
    expect(screen.queryByText(/place you visit often/i)).not.toBeInTheDocument()
  })

  it('surfaces a dismissible candidate card for a repeating-place cluster when opted into foreground_capture', () => {
    h.locationConsent = { id: 'c', user_id: 'u', level: 'foreground_capture', granted_at: 'x', revoked_at: null, created_at: 'x', updated_at: 'x' }
    h.routineVisits = [visit(40.7128, -74.006, 'v1'), visit(40.7128, -74.006, 'v2'), visit(40.7128, -74.006, 'v3')]
    render(<RoutinesList />)
    expect(screen.getByText(/place you visit often/i)).toBeInTheDocument()
  })

  it('dismissing a candidate calls dismissRoutine with a loc: prefixed key', async () => {
    h.locationConsent = { id: 'c', user_id: 'u', level: 'foreground_capture', granted_at: 'x', revoked_at: null, created_at: 'x', updated_at: 'x' }
    h.routineVisits = [visit(40.7128, -74.006, 'v1'), visit(40.7128, -74.006, 'v2'), visit(40.7128, -74.006, 'v3')]
    render(<RoutinesList />)
    await userEvent.click(screen.getByText('Dismiss'))
    expect(h.dismissRoutine).toHaveBeenCalledTimes(1)
    expect((h.dismissRoutine.mock.calls[0][0] as string)).toMatch(/^loc:/)
  })

  it('a dismissed cluster never reappears', () => {
    h.locationConsent = { id: 'c', user_id: 'u', level: 'foreground_capture', granted_at: 'x', revoked_at: null, created_at: 'x', updated_at: 'x' }
    const visits = [visit(40.7128, -74.006, 'v1'), visit(40.7128, -74.006, 'v2'), visit(40.7128, -74.006, 'v3')]
    h.routineVisits = visits
    // Compute the real key the same way the component does, so this asserts against actual
    // behavior rather than a guessed rounding.
    const realKey = clusterRoutineKey(clusterVisits(visits)[0].clusterId)
    h.recognizedRoutineStates = [
      { id: 's1', household_id: 'h', routine_key: realKey, status: 'dismissed', label: null, person_id: null, created_by: 'u', created_at: 'x', updated_at: 'x' },
    ]
    render(<RoutinesList />)
    expect(screen.queryByText(/place you visit often/i)).not.toBeInTheDocument()
    expect(screen.getByText(/not enough history yet/i)).toBeInTheDocument()
  })

  it('never renders anything that could be mistaken for an auto-created transaction (dismiss is the only action)', () => {
    h.locationConsent = { id: 'c', user_id: 'u', level: 'foreground_capture', granted_at: 'x', revoked_at: null, created_at: 'x', updated_at: 'x' }
    h.routineVisits = [visit(40.7128, -74.006, 'v1'), visit(40.7128, -74.006, 'v2'), visit(40.7128, -74.006, 'v3')]
    render(<RoutinesList />)
    const card = screen.getByText(/place you visit often/i).closest('div')!.parentElement!
    const buttons = within(card).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['Dismiss'])
  })
})
