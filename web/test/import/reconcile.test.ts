import { describe, it, expect } from 'vitest'
import { reconcile } from '../../scripts/import/engine/reconcile'
import type { ParsedSection, ParsedTransaction } from '../../scripts/import/engine/types'

const row = (amountCents: number): ParsedTransaction =>
  ({ amountCents } as ParsedTransaction)

const section = (name: string, subtotalCents: number, amounts: number[]): ParsedSection => ({
  name,
  kind: 'expense',
  printedSubtotalCents: subtotalCents,
  rows: amounts.map(row),
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
})
