// @vitest-environment jsdom
//
// useTxForm — spec 044 FR-017 bounded automation: a *confirmed* recurring_charge routine may
// suggest its category on merchant blur, into an untouched category field only.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { RoutineWithState } from '@/lib/finance/routines'

const h = vi.hoisted(() => ({ add: vi.fn(), update: vi.fn(), routines: [] as RoutineWithState[] }))
vi.mock('@/lib/store', () => ({
  useApp: () => ({
    currency: 'usd',
    rate: () => 1,
    cards: [{ id: 'c', name: 'Checking' }],
    depositAccounts: [],
    currentHousehold: { id: 'h' },
    currentUserId: 'u',
    currentPersonId: 'p1',
    householdMembers: [{ id: 'p1', name: 'Ayaz', initial: 'A', color_key: 'sage' }],
    addTransaction: h.add,
    updateTransaction: h.update,
    routines: h.routines,
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    t: (k: string, ...a: Array<string | number>) => (a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k),
  }),
}))

import { useTxForm } from '@/components/web/TxForm'

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
    status: 'confirmed',
    label: null,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  h.routines = []
})

describe('useTxForm — routine auto-categorization (FR-017)', () => {
  it('prefills the category from a confirmed recurring_charge routine on merchant blur', () => {
    h.routines = [routine({})]
    const { result } = renderHook(() => useTxForm({}))
    act(() => result.current.setMerchant('Netflix'))
    act(() => result.current.onMerchantBlur())
    expect(result.current.category).toBe('streaming')
  })

  it('a merely recognized (unconfirmed) routine never auto-categorizes', () => {
    h.routines = [routine({ status: 'recognized' })]
    const { result } = renderHook(() => useTxForm({}))
    act(() => result.current.setMerchant('Netflix'))
    act(() => result.current.onMerchantBlur())
    expect(result.current.category).toBe('groceries') // untouched default
  })

  it('a dismissed routine never auto-categorizes', () => {
    h.routines = [routine({ status: 'dismissed' })]
    const { result } = renderHook(() => useTxForm({}))
    act(() => result.current.setMerchant('Netflix'))
    act(() => result.current.onMerchantBlur())
    expect(result.current.category).toBe('groceries')
  })

  it('never overrides a category the user already picked', () => {
    h.routines = [routine({})]
    const { result } = renderHook(() => useTxForm({}))
    act(() => result.current.setCategory('electronics'))
    act(() => result.current.setMerchant('Netflix'))
    act(() => result.current.onMerchantBlur())
    expect(result.current.category).toBe('electronics')
  })

  it('never creates or submits a transaction on its own', () => {
    h.routines = [routine({})]
    const { result } = renderHook(() => useTxForm({}))
    act(() => result.current.setMerchant('Netflix'))
    act(() => result.current.onMerchantBlur())
    expect(h.add).not.toHaveBeenCalled()
  })

  it('a merchant that matches no routine leaves the category untouched', () => {
    h.routines = [routine({})]
    const { result } = renderHook(() => useTxForm({}))
    act(() => result.current.setMerchant('Some Other Store'))
    act(() => result.current.onMerchantBlur())
    expect(result.current.category).toBe('groceries')
  })
})
