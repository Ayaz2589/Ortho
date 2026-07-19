import { describe, it, expect } from 'vitest'
import { generateInsights } from '@/lib/finance/insights'
import type { Transaction } from '@/lib/types'

// ─────────────────────────────────────────────────────────────────────────────
// spec 027 — A2: Timezone insight-bucketing regression test
//
// This file runs under vitest.tz.config.ts (TZ=America/New_York), NOT the
// default TZ=UTC suite. The main vitest.config.ts excludes *.tz.test.ts.
//
// THE BUG (pre-fix): insights.ts builds local-calendar [mStart, mEnd) windows
// via monthInterval(now) but inInterval(t.date, …) parses a date-only string
// like "2026-06-01" as UTC midnight. In TZ=America/New_York (UTC-4 in EDT),
// local midnight on June 1 = 2026-06-01T04:00:00Z, but the transaction parses
// as 2026-06-01T00:00:00Z — which is BEFORE local midnight and thus lands in
// MAY's bucket, not June's.
//
// THE FIX: inInterval detects date-only strings and parses them via
// parseLocalDate (local midnight), aligning both sides of the comparison.
//
// These tests verify:
// 1. A boundary-dated date-only transaction (June 1) counts as June under a
//    non-UTC timezone after the fix.
// 2. Full ISO timestamps (noon-UTC) continue to land correctly in any timezone.
// 3. The prior-month (May) is not contaminated by the June-boundary transaction.
// ─────────────────────────────────────────────────────────────────────────────

const NOW_JUNE_15 = new Date(2026, 5, 15) // local June 15 — deep inside June

function makeTx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-tz-test',
    household_id: 'hh-1',
    merchant: 'Coffee Shop',
    category: 'dining',
    kind: 'expense',
    amount_cents: 5_000,
    source: 'Chase',
    date: '2026-06-15T12:00:00.000Z',
    created_by: 'u-1',
    created_at: '2026-06-15T12:00:00.000Z',
    updated_at: '2026-06-15T12:00:00.000Z',
    owner_ids: ['u-1'],
    shares: {},
    ...over,
  }
}

describe('insights timezone bucketing — A2 (TZ=America/New_York)', () => {
  it('a date-only "YYYY-MM-DD" transaction on the 1st of the month is counted in that month, not the prior month', () => {
    // This is the exact A2 bug scenario: an imported/legacy transaction with a
    // date-only string on June 1. In TZ=America/New_York (UTC-4), local midnight
    // June 1 = 2026-06-01T04:00:00Z. If the date is parsed as UTC midnight
    // (2026-06-01T00:00:00Z), it falls BEFORE local mStart → wrong month (May).
    const tx = makeTx({ date: '2026-06-01' })
    const insights = generateInsights([tx], [], [], NOW_JUNE_15)

    // Rule 1 (top-category) fires when there is any this-month spend.
    // If the transaction is misclassified into May, Rule 1 will NOT fire for
    // June (no June spend), and the insight id won't contain "2026-06".
    const topCategoryInsight = insights.find((i) => i.id.startsWith('top-category-'))
    expect(topCategoryInsight).toBeDefined()
    expect(topCategoryInsight?.id).toContain('2026-06')
    // magnitude should be the June spending ($50.00 = 5000¢)
    expect(topCategoryInsight?.magnitude_cents).toBe(5_000)
  })

  it('a mid-month noon-UTC ISO timestamp always lands in the correct month in any timezone', () => {
    // Noon UTC on June 15 = 2026-06-15T12:00:00Z. In UTC-4 this is 8am local —
    // still June 15. In UTC+12 it's 2026-06-16 local — but insights bucketing is
    // based on local time of `now` (June 15 local), and the transaction is far
    // from any boundary. This should never be affected by the A2 bug.
    const tx = makeTx({ date: '2026-06-15T12:00:00.000Z' })
    const insights = generateInsights([tx], [], [], NOW_JUNE_15)

    const topCategoryInsight = insights.find((i) => i.id.startsWith('top-category-'))
    expect(topCategoryInsight).toBeDefined()
    expect(topCategoryInsight?.id).toContain('2026-06')
  })

  it('a May-31 date-only transaction is NOT counted in June (stays in May)', () => {
    // Boundary in the other direction: May 31 date-only. In UTC-4, local midnight
    // May 31 = 2026-05-31T04:00:00Z. The transaction is May regardless of how it
    // is parsed — both UTC midnight (2026-05-31T00:00:00Z) and local midnight are
    // in May (before June 1 local midnight = 2026-06-01T04:00:00Z).
    const mayTx = makeTx({ date: '2026-05-31' })
    const juneTx = makeTx({ id: 'june-tx', date: '2026-06-15T12:00:00.000Z', amount_cents: 3_000 })
    const insights = generateInsights([mayTx, juneTx], [], [], NOW_JUNE_15)

    // Only the June expense (3000¢) should be the top category for June.
    // The May transaction should NOT inflate the June total.
    const topCategoryInsight = insights.find((i) => i.id.startsWith('top-category-'))
    expect(topCategoryInsight).toBeDefined()
    expect(topCategoryInsight?.magnitude_cents).toBe(3_000)
  })

  it('prior-month expenses still count correctly after the fix', () => {
    // MoM rule requires both months to have ≥ $20 in the same category.
    // May expense is a full ISO timestamp deep in May — should still fire MoM.
    const mayTx = makeTx({
      id: 'may-tx',
      date: '2026-05-15T12:00:00.000Z',
      amount_cents: 8_000, // $80 dining in May
    })
    const juneTx = makeTx({
      id: 'june-tx',
      date: '2026-06-15T12:00:00.000Z',
      amount_cents: 12_000, // $120 dining in June → +50% MoM
    })
    const insights = generateInsights([mayTx, juneTx], [], [], NOW_JUNE_15)
    const momInsight = insights.find((i) => i.id.startsWith('mom-dining-'))
    expect(momInsight).toBeDefined()
    expect(momInsight?.severity).toBe('warning') // up
  })
})
