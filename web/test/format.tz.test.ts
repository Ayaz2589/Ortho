import { describe, it, expect } from 'vitest'
import { groupByDay, groupDaysByMonth } from '@/lib/format'
import type { Transaction } from '@/lib/types'

// ─────────────────────────────────────────────────────────────────────────────
// Review 2026-08-24, major A4 — ledger grouping under a non-UTC timezone.
//
// Runs under vitest.tz.config.ts (TZ=America/New_York), NOT the default
// TZ=UTC suite.
//
// THE BUG (pre-fix): groupByDay keyed rows with `startOfDay(new Date(t.date))`.
// For a date-only string ("2026-06-01" — every legacy/imported row before the
// CSV noon-UTC fix), `new Date()` parses UTC midnight, which startOfDay shifts
// to the PREVIOUS local day in any negative-UTC zone — so the row rendered
// under May 31, and first-of-month rows landed in the previous month's
// accordion bucket and month total.
//
// THE FIX: groupByDay parses date-only strings via parseLocalDate (local
// midnight), the same spec-027 A2 guard the insights engine received.
// Noon-UTC instants are unaffected in all offsets within ±11.
// ─────────────────────────────────────────────────────────────────────────────

let seq = 0
function tx(date: string): Transaction {
  seq++
  return {
    id: `tx-${seq}`,
    household_id: 'hh',
    merchant: 'M',
    category: 'groceries',
    kind: 'expense',
    amount_cents: 1000,
    source: 'manual',
    date,
    created_by: 'u',
    created_at: '2026-06-01T12:00:00.000Z',
    updated_at: '2026-06-01T12:00:00.000Z',
    owner_ids: [],
    shares: {},
    tags: [],
    notes: null,
  }
}

describe('groupByDay under TZ=America/New_York', () => {
  it('groups a date-only first-of-month row under its own calendar day', () => {
    const groups = groupByDay([tx('2026-06-01')])
    expect(groups).toHaveLength(1)
    expect(groups[0].day.getFullYear()).toBe(2026)
    expect(groups[0].day.getMonth()).toBe(5) // June
    expect(groups[0].day.getDate()).toBe(1)
  })

  it('groups a noon-UTC instant under the same local calendar day', () => {
    const groups = groupByDay([tx('2026-06-15T12:00:00.000Z')])
    expect(groups).toHaveLength(1)
    expect(groups[0].day.getMonth()).toBe(5)
    expect(groups[0].day.getDate()).toBe(15)
  })

  it('a date-only row and the same day noon-UTC row share one bucket', () => {
    const groups = groupByDay([tx('2026-06-01'), tx('2026-06-01T12:00:00.000Z')])
    expect(groups).toHaveLength(1)
    expect(groups[0].items).toHaveLength(2)
  })

  it('keeps a date-only June 1 row in the June month bucket', () => {
    const months = groupDaysByMonth(groupByDay([tx('2026-06-01'), tx('2026-05-15T12:00:00.000Z')]))
    expect(months).toHaveLength(2)
    expect(months[0].month.getMonth()).toBe(5) // June, newest first
    expect(months[0].days[0].items).toHaveLength(1)
    expect(months[1].month.getMonth()).toBe(4) // May
  })
})
