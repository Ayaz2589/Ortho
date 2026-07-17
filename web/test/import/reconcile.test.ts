import { describe, it, expect } from 'vitest'
import { reconcile } from '../../scripts/import/engine/reconcile'
import type { ParsedSection, ParsedTransaction } from '../../scripts/import/engine/types'
import type { TransactionKind } from '../../lib/types'

const row = (amountCents: number, kind: TransactionKind = 'expense'): ParsedTransaction =>
  ({ amountCents, kind } as ParsedTransaction)

// Rows default to the section's own kind (the common case: a charge in a charges
// section). Pass a mixed-kind row explicitly to model an in-section return.
const section = (
  name: string,
  subtotalCents: number,
  rows: number[] | ParsedTransaction[],
  kind: TransactionKind = 'expense',
): ParsedSection => ({
  name,
  kind,
  printedSubtotalCents: subtotalCents,
  rows: rows.map((r) => (typeof r === 'number' ? row(r, kind) : r)),
})

describe('reconcile', () => {
  it('passes when every section sums to its printed subtotal', () => {
    const r = reconcile([section('A', 300, [100, 200]), section('B', 50, [50])])
    expect(r.ok).toBe(true)
    expect(r.sections.every((s) => s.ok)).toBe(true)
  })

  it('fails and reports the section, expected, computed, and delta on a mismatch', () => {
    // Electronic Payments missing one $38.50 ATM row.
    const r = reconcile([section('Electronic Payments', 2241468, [2241468 - 3850])])
    expect(r.ok).toBe(false)
    expect(r.sections[0]).toMatchObject({
      name: 'Electronic Payments',
      expectedCents: 2241468,
      computedCents: 2237618,
      ok: false,
    })
  })

  it('an empty section reconciles only against a zero subtotal', () => {
    expect(reconcile([section('Empty', 0, [])]).ok).toBe(true)
    expect(reconcile([section('Empty', 100, [])]).ok).toBe(false)
  })

  it('nets an in-section return against charges (printed subtotal is the net)', () => {
    // Apple Card "Total charges, credits and returns": a $5.00 charge and a
    // $3.00 return net to $2.00. Profiles keep the return as an income row inside
    // the (expense) Transactions section; reconcile must subtract it, not add it,
    // or an operator can never import a month that contains a refund (die 4).
    const charge = row(500, 'expense')
    const ret = row(300, 'income')
    const r = reconcile([section('Transactions', 200, [charge, ret], 'expense')])
    expect(r.ok).toBe(true)
    expect(r.sections[0]).toMatchObject({ expectedCents: 200, computedCents: 200, ok: true })
  })

  it('an income section adds its income rows and subtracts a stray expense row', () => {
    // Symmetric guard: in a Payments/credits section, income rows add and an
    // out-of-kind expense adjustment subtracts against the printed net.
    const payment = row(1000, 'income')
    const adjustment = row(150, 'expense')
    const r = reconcile([section('Payments', 850, [payment, adjustment], 'income')])
    expect(r.ok).toBe(true)
  })
})
