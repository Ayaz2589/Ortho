import { describe, it, expect } from 'vitest'
import { isTransfer, transferParties } from '@/lib/transaction'
import { makeTx } from '../helpers/fixtures'

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
