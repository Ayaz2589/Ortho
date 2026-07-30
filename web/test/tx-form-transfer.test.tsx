// @vitest-environment jsdom
//
// useTxForm — who-paid default (US1) + the transfer/reimbursement shape (US3).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const h = vi.hoisted(() => ({ add: vi.fn(), update: vi.fn() }))
vi.mock('@/lib/store', () => ({
  useApp: () => ({
    currency: 'usd',
    rate: () => 1,
    cards: [{ id: 'c', name: 'Checking' }],
    depositAccounts: [],
    currentHousehold: { id: 'h' },
    currentUserId: 'u',
    currentPersonId: 'p1',
    householdMembers: [
      { id: 'p1', name: 'Ayaz', initial: 'A', color_key: 'sage' },
      { id: 'p2', name: 'Tasnuva', initial: 'T', color_key: 'slate' },
    ],
    addTransaction: h.add,
    updateTransaction: h.update,
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    t: (k: string, ...a: Array<string | number>) => (a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k),
  }),
}))

import { useTxForm } from '@/components/web/TxForm'

beforeEach(() => vi.clearAllMocks())

describe('useTxForm — who paid + transfer', () => {
  it('an expense defaults paid_by to the current person', () => {
    const { result } = renderHook(() => useTxForm({}))
    act(() => result.current.setAmount('40.00'))
    act(() => result.current.setMerchant('Costco'))
    act(() => {
      expect(result.current.submit()).toBe(true)
    })
    expect(h.add).toHaveBeenCalledTimes(1)
    const tx = h.add.mock.calls[0][0]
    expect(tx.kind).toBe('expense')
    expect(tx.paid_by).toBe('p1')
  })

  it('a transfer records sender→recipient, no split, categorized transfer', () => {
    const { result } = renderHook(() => useTxForm({}))
    act(() => result.current.setDir('transfer'))
    act(() => {
      result.current.setAmount('50.00')
      result.current.setTransferFrom('p2')
      result.current.setTransferTo('p1')
    })
    act(() => {
      expect(result.current.submit()).toBe(true)
    })
    const tx = h.add.mock.calls[0][0]
    expect(tx.kind).toBe('transfer')
    expect(tx.category).toBe('transfer')
    expect(tx.paid_by).toBe('p2') // sender (ower)
    expect(tx.owner_ids).toEqual(['p1']) // recipient (payer)
    expect(tx.shares).toEqual({ p1: 5000 })
    expect(tx.amount_cents).toBe(5000)
  })

  it('a transfer with the same from and to cannot be saved', () => {
    const { result } = renderHook(() => useTxForm({}))
    act(() => result.current.setDir('transfer'))
    act(() => {
      result.current.setAmount('50.00')
      result.current.setTransferFrom('p1')
      result.current.setTransferTo('p1')
    })
    expect(result.current.canSave).toBe(false)
  })

  it('a settle prefill opens directly in transfer mode, pre-filled', () => {
    const { result } = renderHook(() =>
      useTxForm({ initialTransfer: { from: 'p2', to: 'p1', amountCents: 5000 } })
    )
    expect(result.current.isTransfer).toBe(true)
    expect(result.current.transferFrom).toBe('p2')
    expect(result.current.transferTo).toBe('p1')
    expect(result.current.canSave).toBe(true)
  })
})
