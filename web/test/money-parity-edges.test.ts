import { describe, expect, it } from 'vitest'
import { toUSDCents } from '@/lib/finance/money'
import { sharePercent } from '@/lib/splits'
import { generateInsights } from '@/lib/finance/insights'
import type { Transaction, Budget } from '@/lib/types'

// Cross-platform edge behaviors that are display-string / guard logic and so don't
// fit the value-equality golden vectors — pinned here to match iOS (spec 020 P3).

describe('toUSDCents — guards a non-positive rate (parity with iOS `guard rate > 0`)', () => {
  it('returns 0 for rate 0', () => expect(toUSDCents(100, 'usd', 0)).toBe(0))
  it('returns 0 for a negative rate (was: a negative cents result)', () =>
    expect(toUSDCents(100, 'usd', -2)).toBe(0))
  it('still converts a normal positive rate', () => expect(toUSDCents(100, 'usd', 1)).toBe(10000))
})

describe('sharePercent — rounds half AWAY FROM ZERO (parity with Swift .rounded())', () => {
  it('a positive exact value is unchanged', () => expect(sharePercent(25, 100)).toBe(25))
  it('negative exact-half rounds away from zero (−3), not toward +∞ (−2)', () =>
    expect(sharePercent(-25, 1000)).toBe(-3))
})

describe('insights money — always 2 decimals on whole dollars (parity with iOS)', () => {
  it('renders a whole-dollar figure as $N.00, never a bare $N', () => {
    const txs: Transaction[] = [
      { id: 'a', household_id: 'h', merchant: 'Bistro', category: 'dining', kind: 'expense', amount_cents: 40000, source: '', date: '2026-06-05', created_by: 'u', created_at: '', updated_at: '', owner_ids: [], shares: {} },
      { id: 'b', household_id: 'h', merchant: 'Payroll', category: 'income', kind: 'income', amount_cents: 30000, source: '', date: '2026-06-03', created_by: 'u', created_at: '', updated_at: '', owner_ids: [], shares: {} },
    ]
    const bodies = generateInsights(txs, [] as Budget[], [], new Date(2026, 5, 15)).map((i) => i.body).join(' | ')
    expect(bodies).toContain('$400.00')
    expect(bodies).not.toMatch(/\$400(?!\.)/) // no bare "$400"
  })
})
