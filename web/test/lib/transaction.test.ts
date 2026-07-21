import { describe, it, expect } from 'vitest'
import { isTransfer, transferParties, transactionSortName, sortByName } from '@/lib/transaction'
import { makeTx } from '../helpers/fixtures'

const NAMES: Record<string, string> = { u1: 'Alice', u2: 'Bob' }
const resolveUser = (id: string) => ({ name: NAMES[id] ?? id })

describe('transaction accessors (spec 023 FR-019)', () => {
  it('isTransfer is true only for a transfer row', () => {
    expect(isTransfer(makeTx({ kind: 'transfer', owner_ids: ['u2'], shares: { u2: 500 } }))).toBe(true)
    expect(isTransfer(makeTx({ kind: 'expense' }))).toBe(false)
    expect(isTransfer(makeTx({ kind: 'income' }))).toBe(false)
  })

  it('transferParties reads from = paid_by, to = owner_ids[0]', () => {
    const tx = makeTx({ kind: 'transfer', paid_by: 'u1', owner_ids: ['u2'], shares: { u2: 500 } })
    expect(transferParties(tx)).toEqual({ from: 'u1', to: 'u2' })
  })

  it('transferParties returns null for unset parties', () => {
    const tx = makeTx({ kind: 'transfer', paid_by: null, owner_ids: [], shares: {} })
    expect(transferParties(tx)).toEqual({ from: null, to: null })
  })
})

describe('transactionSortName', () => {
  it('uses the merchant for an expense/income', () => {
    expect(transactionSortName(makeTx({ kind: 'expense', merchant: 'Costco' }), resolveUser)).toBe('Costco')
  })

  it('uses the sender name for a transfer', () => {
    const tx = makeTx({ kind: 'transfer', paid_by: 'u1', owner_ids: ['u2'], shares: { u2: 500 } })
    expect(transactionSortName(tx, resolveUser)).toBe('Alice')
  })

  it('returns empty string for a transfer with no sender', () => {
    const tx = makeTx({ kind: 'transfer', paid_by: null, owner_ids: [], shares: {} })
    expect(transactionSortName(tx, resolveUser)).toBe('')
  })
})

describe('sortByName', () => {
  it('sorts by displayed name, case-insensitively, without mutating the input', () => {
    const items = [
      makeTx({ id: 'z', merchant: 'zebra' }),
      makeTx({ id: 'a', merchant: 'Apple' }),
      makeTx({ id: 'm', merchant: 'Mango' }),
    ]
    const sorted = sortByName(items, resolveUser)
    expect(sorted.map((t) => t.id)).toEqual(['a', 'm', 'z'])
    // Original array is untouched.
    expect(items.map((t) => t.id)).toEqual(['z', 'a', 'm'])
  })

  it('orders a transfer by its sender name among merchants', () => {
    const items = [
      makeTx({ id: 'c', merchant: 'Costco' }),
      makeTx({ id: 't', kind: 'transfer', paid_by: 'u2', owner_ids: ['u1'], shares: { u1: 500 } }), // Bob
      makeTx({ id: 'a', merchant: 'Apple' }),
    ]
    // Apple, Bob (transfer), Costco
    expect(sortByName(items, resolveUser).map((t) => t.id)).toEqual(['a', 't', 'c'])
  })
})
